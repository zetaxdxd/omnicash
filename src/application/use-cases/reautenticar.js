/**
 * OmniCash - Aplicación
 * Caso de uso: Reautenticación para operaciones sensibles.
 * Antes de retiros o transferencias grandes, el cliente debe volver a
 * probar su identidad (contraseña O código de la app si tiene 2FA).
 * Entrega un token REAUTH de un solo uso con 5 minutos de validez.
 */

import {
  UnauthorizedError, ForbiddenError,
} from '../../domain/errors/DomainError.js';
import { UserRepository } from '../../infrastructure/repositories/UserRepository.js';
import { SessionRepository } from '../../infrastructure/repositories/SessionRepository.js';
import { AuditRepository } from '../../infrastructure/repositories/AuditRepository.js';
import { PasswordService } from '../../infrastructure/security/password.js';
import { verificarTotp } from '../../infrastructure/security/totp.js';
import { generarToken, SESSION_PURPOSES } from '../../infrastructure/security/sessions.js';
import { TEMP_TTL_MS } from '../../infrastructure/config.js';

/**
 * Reautentica al usuario para una operación sensible.
 *
 * @param {object} input {userId, password, codigoTotp, userAgent, ip}
 * @returns {object} {reauthToken}
 */
export async function reautenticar({ userId, password = null, codigoTotp = null, userAgent = null, ip = null }) {
  const usuario = await UserRepository.findById(userId);
  if (!usuario) throw new UnauthorizedError();

  let identidadOk = false;

  // Si el usuario tiene 2FA activado, exige el código de la app
  if (usuario.totpEnabled) {
    if (codigoTotp && verificarTotp(codigoTotp, usuario.totpSecret)) {
      identidadOk = true;
    }
  } else {
    // Sin 2FA: basta con la contraseña vigente
    if (password && await PasswordService.verify(password, usuario.passwordHash)) {
      identidadOk = true;
    }
  }

  if (!identidadOk) {
    await AuditRepository.log({
      actorId: usuario.id,
      action: 'REAUTH_FALLIDA',
      detail: `Reautenticación fallida para operación sensible (IP ${ip ?? 'desconocida'})`,
    });
    throw new ForbiddenError(usuario.totpEnabled
      ? 'Código de la app incorrecto. Inténtalo de nuevo'
      : 'Contraseña incorrecta. Inténtalo de nuevo');
  }

  // Token REAUTH de un solo uso
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
    detail: `Reautenticación aprobada para operación sensible (IP ${ip ?? 'desconocida'})`,
  });

  return { reauthToken: token };
}