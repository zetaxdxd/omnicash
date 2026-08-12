/**
 * OmniCash - Aplicación
 * Caso de uso: Solicitar la apertura de cuenta (KYC) y enviar el OTP.
 *
 * Flujo bancario real de apertura de cuenta:
 * 1. El cliente entrega su identidad (apellido paterno, materno, nombres,
 *    DNI, dirección, teléfono, correo y contraseña fuerte).
 * 2. Se valida su identidad: DNI con dígito verificador RENIEC (se acepta
 *    el DNI de 8 dígitos y el sistema calcula el verificador), formato de
 *    teléfono peruano.
 * 3. Se envía un código OTP de un solo uso A SU CORREO ELECTRÓNICO.
 * 4. El USUARIO AÚN NO SE CREA: los datos quedan en espera (pending_registrations)
 *    hasta que el cliente confirme el código en verificarEmail.
 * 5. La apertura definitiva (creación del usuario, CCI, activación) ocurre
 *    SOLO en verificarEmail.
 */

import { User, ROLES, esContrasenaFuerte } from '../../domain/entities/User.js';
import { BusinessRuleViolationError } from '../../domain/errors/DomainError.js';
import { UserRepository } from '../../infrastructure/repositories/UserRepository.js';
import { VerificationCodeRepository } from '../../infrastructure/repositories/VerificationCodeRepository.js';
import { PendingRegistrationRepository } from '../../infrastructure/repositories/PendingRegistrationRepository.js';
import { AuditRepository } from '../../infrastructure/repositories/AuditRepository.js';
import { PasswordService } from '../../infrastructure/security/password.js';
import { generarCodigoOtp, hashearCodigo, OTP_TTL_MS } from '../../infrastructure/security/otp.js';
import { normalizarDni } from '../../infrastructure/security/peru.js';
import { enviarCodigoVerificacion } from '../../infrastructure/email/emailUsuarios.js';
import { consultarDni, identidadCoincide } from '../../infrastructure/reniec/consultaDni.js';
import { config } from '../../infrastructure/config.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^9\d{8}$/;
/** Reenvíos máximos de código por correo antes de exigir espera */
const MAX_REENVIOS = 5;
/** Tiempo máximo para confirmar el registro con el código */
const REGISTRO_TTL_MS = 10 * 60 * 1000;

/**
 * Solicita la apertura de cuenta: valida la identidad, guarda los datos en
 * espera y envía el código de verificación. NO crea el usuario todavía.
 *
 * @param {object} input {paterno, materno, nombres, dni, direccion, phone, email, backupEmail, password}
 * @returns {object} {requiereCodigo: true, correo: emailNormalizado}
 */
export async function solicitarRegistro({ paterno, materno, nombres, dni, direccion, phone, email, backupEmail, password }) {
  const emailNormalizado = String(email ?? '').trim().toLowerCase();
  const respaldoNormalizado = String(backupEmail ?? '').trim().toLowerCase();
  const clave = String(password ?? '');

  // 1. Datos de identidad (estilo KYC bancario)
  const apellidoPaterno = String(paterno ?? '').trim();
  const apellidoMaterno = String(materno ?? '').trim();
  const nombrePila = String(nombres ?? '').trim();
  const direccionCliente = String(direccion ?? '').trim();

  if (apellidoPaterno.length < 2 || apellidoMaterno.length < 2 || nombrePila.length < 2) {
    throw new BusinessRuleViolationError(
      'Completa tus apellidos paterno, materno y nombres (mínimo 2 letras cada uno)'
    );
  }
  if (direccionCliente.length < 5) {
    throw new BusinessRuleViolationError('Indica tu dirección completa (calle, número, distrito)');
  }
  if (!EMAIL_REGEX.test(emailNormalizado)) {
    throw new BusinessRuleViolationError('Correo electrónico inválido');
  }
  if (!EMAIL_REGEX.test(respaldoNormalizado) || respaldoNormalizado === emailNormalizado) {
    throw new BusinessRuleViolationError(
      'El correo de respaldo es obligatorio y debe ser distinto al correo principal'
    );
  }
  if (!PHONE_REGEX.test(String(phone ?? ''))) {
    throw new BusinessRuleViolationError('Teléfono inválido: debe tener 9 dígitos y empezar con 9');
  }
  if (!esContrasenaFuerte(clave)) {
    throw new BusinessRuleViolationError(
      'La contraseña debe tener al menos 8 caracteres, con mayúscula, minúscula y número'
    );
  }

  // 2. DNI: acepta 8 dígitos (se calcula el verificador) o 9 con verificador
  const dniNormalizado = normalizarDni(dni);
  if (!dniNormalizado) {
    throw new BusinessRuleViolationError(
      'DNI inválido: debe tener 8 dígitos (ej: 73148217)'
    );
  }

  // 2b. Regla RENIEC: una persona puede tener MÁXIMO 2 cuentas
  if (await UserRepository.countByDni(dniNormalizado) >= config.maxCuentasPorDni) {
    throw new BusinessRuleViolationError(
      `Este DNI ya tiene el máximo de ${config.maxCuentasPorDni} cuentas permitidas en OmniCash`
    );
  }

  // 2c. Contraste con RENIEC (si hay proveedor configurado):
  //     el nombre debe coincidir con el registro oficial de la persona
  const identidad = await consultarDni(dniNormalizado.slice(0, 8));
  if (identidad && !identidadCoincide(identidad, { nombres: nombrePila, apellidoPaterno, apellidoMaterno })) {
    throw new BusinessRuleViolationError(
      'Los datos no coinciden con el registro oficial del DNI (RENIEC). Revísalos'
    );
  }

  // 3. Unicidad (tanto de cuentas activas como de solicitudes pendientes)
  if (await UserRepository.findByEmail(emailNormalizado)) {
    throw new BusinessRuleViolationError('Ya existe una cuenta con este correo electrónico');
  }
  const pendienteAnterior = await PendingRegistrationRepository.findByEmail(emailNormalizado);
  if (pendienteAnterior && new Date(pendienteAnterior.expiresAt) > new Date()) {
    throw new BusinessRuleViolationError(
      'Ya iniciaste una solicitud con este correo. Revisa tu bandeja (o spam) para ingresar el código'
    );
  }

  // 4. Se guarda la solicitud EN ESPERA (el usuario aún NO existe)
  const passwordHash = await PasswordService.hash(clave);
  await PendingRegistrationRepository.upsert({
    email: emailNormalizado,
    data: {
      apellidoPaterno,
      apellidoMaterno,
      nombres: nombrePila,
      direccion: direccionCliente,
      backupEmail: respaldoNormalizado,
      dni: dniNormalizado,
      phone: String(phone).trim(),
      passwordHash,
    },
    expiresAt: new Date(Date.now() + REGISTRO_TTL_MS).toISOString(),
  });

  // 5. Genera y envía el código OTP al correo del cliente
  await emitirCodigoVerificacion(emailNormalizado);

  await AuditRepository.log({
    actorId: null,
    action: 'REGISTRO_SOLICITADO',
    detail: `Solicitud de apertura de cuenta: ${emailNormalizado} (DNI ${dniNormalizado})` + (identidad ? ' · identidad validada contra RENIEC' : ' · modo offline (sin RENIEC)'),
  });

  return { requiereCodigo: true, correo: emailNormalizado };
}

/**
 * Emite un código OTP nuevo para un correo (con límite de reenvíos).
 * @param {string} email
 */
export async function emitirCodigoVerificacion(email) {
  const activos = await VerificationCodeRepository.countActivos(email, 'EMAIL_VERIFY');
  if (activos >= MAX_REENVIOS) {
    throw new BusinessRuleViolationError(
      'Has alcanzado el límite de códigos enviados. Espera unos minutos e inténtalo de nuevo'
    );
  }

  // Invalida los anteriores: solo el último código es válido
  await VerificationCodeRepository.invalidarActivos(email, 'EMAIL_VERIFY');

  const codigo = generarCodigoOtp();
  const { hash, salt } = hashearCodigo(codigo);
  const expira = new Date(Date.now() + OTP_TTL_MS).toISOString();
  await VerificationCodeRepository.insert({ email, purpose: 'EMAIL_VERIFY', codeHash: `${salt}:${hash}`, expiresAt: expira });

  await enviarCodigoVerificacion(email, codigo);
}