/**
 * OmniCash - Aplicación
 * Caso de uso: Reautenticación para operaciones.
 *
 * TODA operación (retiro, transferencia, depósito, Yape, acciones de
 * administración) exige doble confirmación:
 *   1. La contraseña vigente del usuario.
 *   2. Un código de aprobación de 6 dígitos enviado a su correo.
 * Entrega un token REAUTH de un solo uso con 5 minutos de validez.
 */

import {
  UnauthorizedError, ForbiddenError, BusinessRuleViolationError,
} from '../../domain/errors/DomainError.js';
import { UserRepository } from '../../infrastructure/repositories/UserRepository.js';
import { SessionRepository } from '../../infrastructure/repositories/SessionRepository.js';
import { VerificationCodeRepository } from '../../infrastructure/repositories/VerificationCodeRepository.js';
import { AuditRepository } from '../../infrastructure/repositories/AuditRepository.js';
import { PasswordService } from '../../infrastructure/security/password.js';
import { verificarTotp } from '../../infrastructure/security/totp.js';
import {
  generarCodigoOtp, hashearCodigo, verificarCodigo,
  codigoVigente, OTP_MAX_ATTEMPTS, OTP_TTL_MS,
} from '../../infrastructure/security/otp.js';
import { generarToken, SESSION_PURPOSES } from '../../infrastructure/security/sessions.js';
import { TEMP_TTL_MS } from '../../infrastructure/config.js';
import { enviarCodigoAprobacion } from '../../infrastructure/email/emailUsuarios.js';

/**
 * Paso 1: valida la contraseña y envía el código de aprobación al correo.
 * @param {object} input {userId, password, userAgent, ip}
 * @returns {object} {correo: emailDelUsuario}
 */
export async function solicitarAprobacion({ userId, password = null, userAgent = null, ip = null }) {
  const usuario = await UserRepository.findById(userId);
  if (!usuario) throw new UnauthorizedError();

  // La contraseña vigente es obligatoria SIEMPRE
  if (!password || !await PasswordService.verify(String(password), usuario.passwordHash)) {
    await AuditRepository.log({
      actorId: usuario.id,
      action: 'REAUTH_FALLIDA',
      detail: `Contraseña incorrecta al solicitar aprobación de operación (IP ${ip ?? 'desconocida'})`,
    });
    throw new ForbiddenError('Contraseña incorrecta. Inténtalo de nuevo');
  }

  // Genera y envía el código de aprobación al correo PRINCIPAL
  const activos = await VerificationCodeRepository.countActivos(usuario.email, 'OPERACION');
  if (activos >= 5) {
    throw new BusinessRuleViolationError(
      'Has alcanzado el límite de códigos enviados. Espera unos minutos e inténtalo de nuevo'
    );
  }
  await VerificationCodeRepository.invalidarActivos(usuario.email, 'OPERACION');
  const codigo = generarCodigoOtp();
  const { hash, salt } = hashearCodigo(codigo);
  await VerificationCodeRepository.insert({
    email: usuario.email,
    purpose: 'OPERACION',
    codeHash: `${salt}:${hash}`,
    expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
  });
  await enviarCodigoAprobacion(usuario.email, codigo);

  await AuditRepository.log({
    actorId: usuario.id,
    action: 'APROBACION_SOLICITADA',
    detail: `Código de aprobación enviado a ${usuario.email} (IP ${ip ?? 'desconocida'})`,
  });

  return { correo: usuario.email };
}

/**
 * Paso 2: valida el código de aprobación y entrega el token REAUTH de un solo uso.
 * @param {object} input {userId, password, codigo, userAgent, ip}
 * @returns {object} {reauthToken}
 */
export async function reautenticar({ userId, password = null, codigo = null, userAgent = null, ip = null }) {
  const usuario = await UserRepository.findById(userId);
  if (!usuario) throw new UnauthorizedError();

  // 1. Contraseña vigente
  if (!password || !await PasswordService.verify(String(password), usuario.passwordHash)) {
    throw new ForbiddenError('Contraseña incorrecta. Inténtalo de nuevo');
  }

  // 2. Código de aprobación del correo (o TOTP de la app si tiene 2FA activo)
  let codigoOk = false;
  if (usuario.totpEnabled) {
    codigoOk = Boolean(codigo) && verificarTotp(String(codigo), usuario.totpSecret);
  } else {
    const fila = await VerificationCodeRepository.findLatest(usuario.email, 'OPERACION');
    codigoOk = Boolean(codigo) && codigoVigente(fila) && verificarCodigo(String(codigo), fila.code_hash);
    if (fila && !codigoOk) {
      await VerificationCodeRepository.registrarIntento(fila.id);
      if (fila.attempts + 1 >= OTP_MAX_ATTEMPTS) {
        await VerificationCodeRepository.invalidarActivos(usuario.email, 'OPERACION');
      }
    }
  }

  if (!codigoOk) {
    await AuditRepository.log({
      actorId: usuario.id,
      action: 'REAUTH_FALLIDA',
      detail: `Código de aprobación incorrecto para operación (IP ${ip ?? 'desconocida'})`,
    });
    throw new ForbiddenError(usuario.totpEnabled
      ? 'Código de la app incorrecto. Inténtalo de nuevo'
      : 'El código de aprobación es incorrecto o expiró. Solicítalo de nuevo');
  }

  // Invalida el código usado y entrega el token REAUTH de un solo uso
  await VerificationCodeRepository.invalidarActivos(usuario.email, 'OPERACION');

  const token = generarToken();
  await SessionRepository.insert({
    token,
    userId: usuario.id,
    purpose: SESSION_PURPOSES.REAUTH,
    userAgent,
    ip,
    expiresAt: new Date(Date.now() + TEMP_TTL_MS).toISOString(),
  });

  await AuditRepository.log({
    actorId: usuario.id,
    action: 'REAUTH_OK',
    detail: `Aprobación confirmada para operación (IP ${ip ?? 'desconocida'})`,
  });

  return { reauthToken: token };
}
