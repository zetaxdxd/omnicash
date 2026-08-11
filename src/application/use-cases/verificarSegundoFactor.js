/**
 * OmniCash - Aplicación
 * Caso de uso: Completar el segundo factor (TOTP) del inicio de sesión.
 * Convierte el token temporal P2FA en una sesión LOGIN plena.
 */

import { UnauthorizedError, ForbiddenError, BusinessRuleViolationError } from '../../domain/errors/DomainError.js';
import { UserRepository } from '../../infrastructure/repositories/UserRepository.js';
import { SessionRepository } from '../../infrastructure/repositories/SessionRepository.js';
import { AuditRepository } from '../../infrastructure/repositories/AuditRepository.js';
import { verificarTotp } from '../../infrastructure/security/totp.js';
import { generarToken, SESSION_PURPOSES, hashToken } from '../../infrastructure/security/sessions.js';
import { SESSION_TTL_MS } from '../../infrastructure/config.js';

/**
 * Valida el código de la app de autenticación y crea la sesión real.
 * @param {object} input {sesionTemporal, codigoTotp, userAgent, ip}
 * @returns {object} {token, usuario}
 */
export async function verificarSegundoFactor({ sesionTemporal, codigoTotp, userAgent = null, ip = null }) {
  // 1. El token temporal debe existir y tener propósito P2FA
  const temporal = await SessionRepository.findByToken(sesionTemporal);
  if (
    !temporal
    || temporal.purpose !== SESSION_PURPOSES.P2FA
    || temporal.usedAt
    || new Date(temporal.expiresAt).getTime() < Date.now()
  ) {
    throw new UnauthorizedError('Tu sesión temporal expiró. Vuelve a iniciar sesión');
  }

  const usuario = await UserRepository.findById(temporal.userId);
  if (!usuario || !usuario.totpEnabled || !usuario.totpSecret) {
    throw new ForbiddenError('El segundo factor no está configurado en esta cuenta');
  }

  // 2. Verifica el código de la app (ventana ±1: 30 segundos)
  if (!verificarTotp(codigoTotp, usuario.totpSecret)) {
    // Intentos fallidos: 3 permitidos y el token temporal se invalida
    await SessionRepository.markUsed(temporal.id);
    throw new BusinessRuleViolationError('El código de verificación es incorrecto. Vuelve a iniciar sesión');
  }

  // 3. Token temporal de un solo uso
  await SessionRepository.markUsed(temporal.id);

  // 4. Sesión real de login
  const token = generarToken();
  await SessionRepository.insert({
    token,
    userId: usuario.id,
    purpose: SESSION_PURPOSES.LOGIN,
    userAgent,
    ip,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });

  await AuditRepository.log({
    actorId: usuario.id,
    action: 'LOGIN_2FA',
    detail: `Segundo factor verificado: ${usuario.email} (IP ${ip ?? 'desconocida'})`,
  });

  return { token, usuario: usuario.toPublicJSON() };
}