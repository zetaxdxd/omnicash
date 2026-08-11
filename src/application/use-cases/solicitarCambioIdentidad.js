/**
 * OmniCash - Aplicación
 * Caso de uso: Cambiar datos de identidad del cliente (solicitud).
 *
 * Los datos personales de un cliente bancario pueden actualizarse, pero
 * con un doble candado de seguridad:
 * 1. El cliente debe estar autenticado.
 * 2. Se envía un código de un solo uso AL CORREO PRINCIPAL de la cuenta.
 *    Sin ese código no se aplica ningún cambio (authorización de dos pasos).
 *
 * Flujo: solicitarCambioIdentidad → (correo con OTP) → aplicarCambioIdentidad.
 */

import { ForbiddenError } from '../../domain/errors/DomainError.js';
import { UserRepository } from '../../infrastructure/repositories/UserRepository.js';
import { VerificationCodeRepository } from '../../infrastructure/repositories/VerificationCodeRepository.js';
import { AuditRepository } from '../../infrastructure/repositories/AuditRepository.js';
import { normalizarDni } from '../../infrastructure/security/peru.js';
import { generarCodigoOtp, hashearCodigo, OTP_TTL_MS } from '../../infrastructure/security/otp.js';
import { enviarCodigoCambioIdentidad } from '../../infrastructure/email/emailUsuarios.js';
import { consultarDni, identidadCoincide } from '../../infrastructure/reniec/consultaDni.js';
import { config } from '../../infrastructure/config.js';

/** Propósito del OTP de cambio de identidad */
export const IDENTITY_CHANGE_PURPOSE = 'IDENTITY_CHANGE';

/**
 * Valida que el DNI no supere el máximo de cuentas permitidas,
 * dejando fuera de la cuenta al propio usuario (que ya la tiene).
 * @param {string} dni DNI normalizado
 * @param {number} exceptoId ID del usuario actual
 */
async function validarLimiteCuentas(dni, exceptoId) {
  let cuentas = await UserRepository.countByDni(dni);
  const usuariosMismoDni = (await UserRepository.findAll({ limit: 1000 }))
    .filter(u => u.dni === dni && u.id !== exceptoId);
  cuentas = Math.max(cuentas, usuariosMismoDni.length);
  if (cuentas >= config.maxCuentasPorDni) {
    throw new ForbiddenError(
      `Este DNI ya tiene el máximo de ${config.maxCuentasPorDni} cuentas en OmniCash`
    );
  }
}

/**
 * Paso 1: el cliente solicita cambiar sus datos personales.
 * Se valida que el nuevo DNI no choque con la regla RENIEC y se envía
 * el código de autorización al correo principal de la cuenta.
 * @param {object} input {userId, dni}
 * @returns {object} {requiereCodigo: true}
 */
export async function solicitarCambioIdentidad({ userId, dni }) {
  const usuario = await UserRepository.findById(userId);
  if (!usuario || !usuario.emailVerified) {
    throw new ForbiddenError('Debes tener tu correo verificado para cambiar tus datos');
  }

  // El DNI es el ancla de la identidad: solo puede cambiarse si no
  // viola el máximo de 2 cuentas por persona.
  const dniNuevo = normalizarDni(dni);
  if (!dniNuevo) {
    throw new ForbiddenError('DNI inválido: debe tener 8 dígitos (ej: 73148217)');
  }
  if (dniNuevo !== usuario.dni) {
    validarLimiteCuentas(dniNuevo, usuario.id);
  }

  // Emite un código nuevo al CORREO PRINCIPAL (invalida los anteriores)
  await VerificationCodeRepository.invalidarActivos(usuario.email, IDENTITY_CHANGE_PURPOSE);
  const codigo = generarCodigoOtp();
  const { hash, salt } = hashearCodigo(codigo);
  const expira = new Date(Date.now() + OTP_TTL_MS).toISOString();
  await VerificationCodeRepository.insert({
    email: usuario.email,
    purpose: IDENTITY_CHANGE_PURPOSE,
    codeHash: `${salt}:${hash}`,
    expiresAt: expira,
  });

  enviarCodigoCambioIdentidad(usuario.email, codigo).catch(() => {});

  await AuditRepository.log({
    actorId: usuario.id,
    action: 'CAMBIO_IDENTIDAD_SOLICITADO',
    detail: 'Se solicitó actualizar los datos personales (código enviado al correo principal)',
  });

  return { requiereCodigo: true };
}