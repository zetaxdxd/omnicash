/**
 * OmniCash - Aplicación
 * Caso de uso: Aplicar el cambio de datos personales del cliente (paso 2).
 *
 * Recibe el código enviado al correo principal en solicitarCambioIdentidad.
 * Si el código es válido, aplica los cambios de identidad a la cuenta:
 * - Solo campos permitidos: apellido paterno, materno, nombres, dirección,
 *   teléfono y DNI.
 * - El correo NO se puede cambiar aquí (el correo es la llave de la cuenta;
 *   cambiarlo exige un flujo aparte).
 * - Si se cambia el DNI y hay RENIEC configurado, se contrasta la identidad
 *   contra el registro oficial antes de guardar.
 */

import { ForbiddenError, BusinessRuleViolationError } from '../../domain/errors/DomainError.js';
import { UserRepository } from '../../infrastructure/repositories/UserRepository.js';
import { VerificationCodeRepository } from '../../infrastructure/repositories/VerificationCodeRepository.js';
import { AuditRepository } from '../../infrastructure/repositories/AuditRepository.js';
import { verificarCodigo, codigoVigente, OTP_MAX_ATTEMPTS } from '../../infrastructure/security/otp.js';
import { normalizarDni } from '../../infrastructure/security/peru.js';
import { consultarDni, identidadCoincide } from '../../infrastructure/reniec/consultaDni.js';
import { config } from '../../infrastructure/config.js';
import { IDENTITY_CHANGE_PURPOSE } from './solicitarCambioIdentidad.js';

const PHONE_REGEX = /^9\d{8}$/;

/**
 * Paso 2: aplica los cambios personales tras validar el código OTP.
 * @param {object} input {userId, codigo, cambios: {apellidoPaterno, apellidoMaterno, nombres, direccion, phone, dni}}
 * @returns {object} {cambiosAplicados: true}
 */
export async function aplicarCambioIdentidad({ userId, codigo, cambios = {} }) {
  const usuario = await UserRepository.findById(userId);
  if (!usuario) throw new ForbiddenError();

  // 1. Candado de seguridad: el código debe ser válido y vigente
  const fila = await VerificationCodeRepository.findLatest(usuario.email, IDENTITY_CHANGE_PURPOSE);
  if (!codigoVigente(fila)) {
    throw new ForbiddenError(
      fila && fila.attempts >= OTP_MAX_ATTEMPTS
        ? 'Demasiados intentos. Solicita un código nuevo'
        : 'El código expiró o ya fue usado. Solicita uno nuevo'
    );
  }
  if (!verificarCodigo(String(codigo ?? ''), fila.code_hash)) {
    await VerificationCodeRepository.registrarIntento(fila.id);
    throw new BusinessRuleViolationError('El código ingresado es incorrecto');
  }
  await VerificationCodeRepository.marcarUsado(fila.id);
  await VerificationCodeRepository.invalidarActivos(usuario.email, IDENTITY_CHANGE_PURPOSE);

  // 2. Valida los campos nuevos
  const apellidoPaterno = String(cambios.apellidoPaterno ?? usuario.apellidoPaterno).trim();
  const apellidoMaterno = String(cambios.apellidoMaterno ?? usuario.apellidoMaterno).trim();
  const nombres = String(cambios.nombres ?? usuario.nombres).trim();
  const direccion = String(cambios.direccion ?? usuario.direccion).trim();
  const phone = String(cambios.phone ?? usuario.phone).trim();
  const dniNuevo = normalizarDni(cambios.dni) ?? usuario.dni;

  if (apellidoPaterno.length < 2 || apellidoMaterno.length < 2 || nombres.length < 2) {
    throw new BusinessRuleViolationError('Los nombres y apellidos deben tener mínimo 2 letras');
  }
  if (direccion.length < 5) {
    throw new BusinessRuleViolationError('Indica tu dirección completa (calle, número, distrito)');
  }
  if (dniNuevo !== usuario.dni) {
    const mismosDni = (await UserRepository.findAll({ limit: 1000 })).filter(
      u => u.dni === dniNuevo && u.id !== usuario.id
    );
    if (mismosDni.length >= config.maxCuentasPorDni) {
      throw new BusinessRuleViolationError(
        `Este DNI ya tiene el máximo de ${config.maxCuentasPorDni} cuentas en OmniCash`
      );
    }
  }
  if (!PHONE_REGEX.test(phone)) {
    throw new BusinessRuleViolationError('Teléfono inválido: debe tener 9 dígitos y empezar con 9');
  }

  // 3. Si hay RENIEC y el DNI cambió, contrasta la identidad oficial
  if (dniNuevo !== usuario.dni) {
    const identidad = await consultarDni(dniNuevo.slice(0, 8));
    if (identidad && !identidadCoincide(identidad, { nombres, apellidoPaterno, apellidoMaterno })) {
      throw new BusinessRuleViolationError(
        'Los datos no coinciden con el registro oficial del DNI (RENIEC)'
      );
    }
  }

  // 4. Registra el antes para auditoría
  const cambiosRegistrados = {
    apellidoPaterno: [usuario.apellidoPaterno, apellidoPaterno],
    apellidoMaterno: [usuario.apellidoMaterno, apellidoMaterno],
    nombres: [usuario.nombres, nombres],
    direccion: [usuario.direccion, direccion],
    phone: [usuario.phone, phone],
    dni: [usuario.dni, dniNuevo],
  };

  // 5. Aplica los cambios
  usuario.apellidoPaterno = apellidoPaterno;
  usuario.apellidoMaterno = apellidoMaterno;
  usuario.nombres = nombres;
  usuario.direccion = direccion;
  usuario.phone = phone;
  usuario.dni = dniNuevo;
  await UserRepository.update(usuario);

  await AuditRepository.log({
    actorId: usuario.id,
    action: 'IDENTIDAD_ACTUALIZADA',
    detail: `Cambio de identidad aprobado: ${JSON.stringify(cambiosRegistrados)}`,
  });

  return { cambiosAplicados: true };
}