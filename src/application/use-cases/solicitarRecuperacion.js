/**
 * OmniCash - Aplicación
 * Caso de uso: Solicitar recuperación de contraseña (paso 1).
 *
 * El cliente olvidó su contraseña. Para recuperarla debe demostrar que es
 * él: ingresa su DNI y el CORREO PRINCIPAL con el que se registró.
 * Si ambos coinciden, se envía un OTP a su correo principal.
 *
 * Seguridad anti-enumeración: si el DNI o el correo no coinciden, el
 * mensaje de error es el mismo (no revela qué dato falló ni si la cuenta
 * existe).
 */

import { BusinessRuleViolationError, ForbiddenError } from '../../domain/errors/DomainError.js';
import { UserRepository } from '../../infrastructure/repositories/UserRepository.js';
import { VerificationCodeRepository } from '../../infrastructure/repositories/VerificationCodeRepository.js';
import { AuditRepository } from '../../infrastructure/repositories/AuditRepository.js';
import { normalizarDni } from '../../infrastructure/security/peru.js';
import { generarCodigoOtp, hashearCodigo, OTP_TTL_MS } from '../../infrastructure/security/otp.js';
import { enviarCodigoRecuperacion } from '../../infrastructure/email/emailUsuarios.js';

/** Propósito del OTP de recuperación de contraseña */
export const PASSWORD_RECOVERY_PURPOSE = 'PASSWORD_RECOVERY';
/** Máximo de códigos de recuperación emitidos consecutivos */
const MAX_RECUPERACIONES = 5;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Enmascara el correo para mostrarlo sin revelarlo: "eli***@gmail.com" */
function enmascarar(correo) {
  const [local, dominio] = String(correo).split('@');
  const visible = local.slice(0, 3);
  const resto = local.length > 3 ? local.slice(3).replace(/./g, '•') : '';
  return `${visible}${resto}@${dominio}`;
}

/**
 * Paso 1: valida DNI + correo principal y envía el OTP al correo principal.
 * @param {object} input {dni, email}
 * @returns {object} {requiereCodigo: true, correoEnmascarado}
 */
export async function solicitarRecuperacion({ dni, email }) {
  const dniNormalizado = normalizarDni(dni) ?? String(dni ?? '').trim();
  const emailNormalizado = String(email ?? '').trim().toLowerCase();

  if (!EMAIL_REGEX.test(emailNormalizado)) {
    throw new BusinessRuleViolationError('El correo electrónico no es válido');
  }

  // Respuesta genérica anti-enumeración: no revela si el DNI/correo existen
  const usuario = await UserRepository.findByDni(dniNormalizado);
  const errorGenerico = new ForbiddenError(
    'Si el DNI y el correo coinciden, enviaremos un código a tu correo'
  );
  if (!usuario || usuario.email !== emailNormalizado) {
    // Pequeña demora para dificultar la enumeración automatizada
    await new Promise((r) => setTimeout(r, 300));
    throw errorGenerico;
  }

  // Entrega un código nuevo al correo principal (invalida los anteriores)
  const activos = await VerificationCodeRepository.countActivos(emailNormalizado, PASSWORD_RECOVERY_PURPOSE);
  if (activos >= MAX_RECUPERACIONES) {
    throw new BusinessRuleViolationError('Demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo');
  }
  await VerificationCodeRepository.invalidarActivos(emailNormalizado, PASSWORD_RECOVERY_PURPOSE);

  const codigo = generarCodigoOtp();
  const { hash, salt } = hashearCodigo(codigo);
  const expira = new Date(Date.now() + OTP_TTL_MS).toISOString();
  await VerificationCodeRepository.insert({
    email: emailNormalizado,
    purpose: PASSWORD_RECOVERY_PURPOSE,
    codeHash: `${salt}:${hash}`,
    expiresAt: expira,
  });

  await enviarCodigoRecuperacion(emailNormalizado, codigo);

  await AuditRepository.log({
    actorId: usuario.id,
    action: 'RECUPERACION_SOLICITADA',
    detail: `Se solicitó recuperar la contraseña (código enviado al correo ${enmascarar(emailNormalizado)})`,
  });

  return { requiereCodigo: true, correoEnmascarado: enmascarar(emailNormalizado) };
}
