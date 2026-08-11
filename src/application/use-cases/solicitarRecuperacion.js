/**
 * OmniCash - Aplicación
 * Caso de uso: Solicitar recuperación de contraseña (paso 1).
 *
 * El cliente olvidó su contraseña. Para recuperarla debe demostrar que es
 * él: ingresa su DNI y el CORREO DE RESPALDO que registró al abrir la
 * cuenta. Si ambos coinciden, se envía un OTP al correo de respaldo.
 *
 * Seguridad anti-enumeración: si el DNI o el respaldo no coinciden, el
 * mensaje de error es el mismo (no revela qué dato falló ni si la cuenta
 * existe). El límite de intentos lo impone el propio código OTP.
 */

import { BusinessRuleViolationError } from '../../domain/errors/DomainError.js';
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

/** Enmascara el correo para mostrarlo sin revelarlo: "eli***@gmail.com" */
function enmascarar(correo) {
  const [local, dominio] = String(correo).split('@');
  const visible = local.slice(0, 3);
  const resto = local.length > 3 ? local.slice(3).replace(/./g, '•') : '';
  return `${visible}${resto}@${dominio}`;
}

/**
 * Paso 1: valida DNI + correo de respaldo y envía el OTP.
 * @param {object} input {dni, backupEmail}
 * @returns {object} {requiereCodigo: true, correoEnmascarado}
 */
export async function solicitarRecuperacion({ dni, backupEmail }) {
  const dniNormalizado = normalizarDni(dni) ?? String(dni ?? '').trim();
  const respaldo = String(backupEmail ?? '').trim().toLowerCase();
  const usuario = await UserRepository.findByDni(dniNormalizado);

  // Respuesta genérica: nunca revelar si el DNI existe ni qué dato falló
  if (!usuario || !usuario.backupEmail || usuario.backupEmail !== respaldo) {
    throw new BusinessRuleViolationError(
      'El DNI o el correo de respaldo no coinciden con nuestra base de datos'
    );
  }

  // Entrega un código nuevo al correo de respaldo (invalida los anteriores)
  const activos = await VerificationCodeRepository.countActivos(respaldo, PASSWORD_RECOVERY_PURPOSE);
  if (activos >= MAX_RECUPERACIONES) {
    throw new BusinessRuleViolationError('Demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo');
  }
  await VerificationCodeRepository.invalidarActivos(respaldo, PASSWORD_RECOVERY_PURPOSE);

  const codigo = generarCodigoOtp();
  const { hash, salt } = hashearCodigo(codigo);
  const expira = new Date(Date.now() + OTP_TTL_MS).toISOString();
  await VerificationCodeRepository.insert({
    email: respaldo,
    purpose: PASSWORD_RECOVERY_PURPOSE,
    codeHash: `${salt}:${hash}`,
    expiresAt: expira,
  });

  await enviarCodigoRecuperacion(respaldo, codigo);

  await AuditRepository.log({
    actorId: usuario.id,
    action: 'RECUPERACION_SOLICITADA',
    detail: `Se solicitó recuperar la contraseña (código enviado al correo de respaldo ${enmascarar(respaldo)})`,
  });

  return { requiereCodigo: true, correoEnmascarado: enmascarar(respaldo) };
}