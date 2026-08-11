/**
 * OmniCash - Aplicación
 * Caso de usos de segundo factor (TOTP):
 * - Iniciar la configuración (genera el secreto y la URI otpauth para QR).
 * - Confirmar la activación (el cliente escanea y envía un código válido).
 * - Desactivar (exige contraseña vigente).
 * - Gestión de sesiones: listar, revocar una o cerrar todas.
 */

import { ForbiddenError, BusinessRuleViolationError } from '../../domain/errors/DomainError.js';
import { UserRepository } from '../../infrastructure/repositories/UserRepository.js';
import { SessionRepository } from '../../infrastructure/repositories/SessionRepository.js';
import { AuditRepository } from '../../infrastructure/repositories/AuditRepository.js';
import { PasswordService } from '../../infrastructure/security/password.js';
import {
  generarSecretoTotp, verificarTotp, otpauthUri,
} from '../../infrastructure/security/totp.js';

/**
 * Paso 1 de la activación del 2FA: crea el secreto y el QR.
 * El secreto se guarda para que el usuario confirme con el código.
 * @param {object} input {userId}
 * @returns {object} {secreto, otpauth, qrNecesario: true}
 */
export async function iniciar2fa({ userId }) {
  const usuario = await UserRepository.findById(userId);
  if (!usuario) throw new ForbiddenError();

  const secreto = generarSecretoTotp();
  usuario.totpSecret = secreto;
  await UserRepository.update(usuario);

  return {
    secreto,
    otpauth: otpauthUri(secreto, usuario.email),
    mensaje: 'Escanea el código QR con tu app de autenticación y envía el código de 6 dígitos para confirmar',
  };
}

/**
 * Paso 2: confirma la activación validando un código TOTP del cliente.
 * @param {object} input {userId, codigo}
 */
export async function confirmar2fa({ userId, codigo }) {
  const usuario = await UserRepository.findById(userId);
  if (!usuario || !usuario.totpSecret) {
    throw new BusinessRuleViolationError('Primero debes iniciar la configuración del 2FA');
  }
  if (!verificarTotp(codigo, usuario.totpSecret)) {
    throw new BusinessRuleViolationError('El código no coincide. Escanea el QR nuevamente e ingresa el código actual');
  }

  usuario.totpEnabled = true;
  await UserRepository.update(usuario);

  await AuditRepository.log({
    actorId: usuario.id,
    action: '2FA_ACTIVADO',
    detail: `Segundo factor (TOTP) activado para ${usuario.email}`,
  });

  return { habilitado: true };
}

/**
 * Desactiva el 2FA (exige la contraseña vigente del usuario).
 * @param {object} input {userId, password}
 */
export async function desactivar2fa({ userId, password }) {
  const usuario = await UserRepository.findById(userId);
  if (!usuario) throw new ForbiddenError();

  const passwordOk = await PasswordService.verify(password ?? '', usuario.passwordHash);
  if (!passwordOk) {
    throw new ForbiddenError('Contraseña incorrecta. No podemos desactivar el 2FA');
  }

  usuario.totpEnabled = false;
  usuario.totpSecret = null;
  await UserRepository.update(usuario);

  await AuditRepository.log({
    actorId: usuario.id,
    action: '2FA_DESACTIVADO',
    detail: `Segundo factor desactivado para ${usuario.email}`,
  });

  return { habilitado: false };
}

/**
 * Lista las sesiones activas del usuario.
 * @param {object} input {userId, sesionActualId}
 * @returns {object} {sesiones}
 */
export async function listarSesiones({ userId, sesionActualId }) {
  const sesiones = (await SessionRepository.findActivasByUser(userId)).map(s => ({
    id: s.id,
    actual: s.id === sesionActualId,
    purpose: s.purpose,
    userAgent: s.userAgent,
    ip: s.ip,
    creada: s.createdAt,
    ultimaActividad: s.lastUsedAt ?? s.createdAt,
    expira: s.expiresAt,
  })).filter(s => s.purpose === 'LOGIN');
  return { sesiones };
}

/**
 * Revoca una sesión específica del usuario.
 * @param {object} input {userId, sesionId}
 */
export async function revocarSesion({ userId, sesionId }) {
  const ok = await SessionRepository.revoke(sesionId, userId);
  if (!ok) throw new BusinessRuleViolationError('No se pudo revocar la sesión');
  await AuditRepository.log({ actorId: userId, action: 'SESION_REVOCADA', detail: `Sesión ${sesionId} revocada` });
  return { revocada: true };
}

/**
 * Cierra todas las sesiones del usuario excepto la actual.
 * @param {object} input {userId, sesionActualId}
 */
export async function revocarTodasSesiones({ userId, sesionActualId }) {
  await SessionRepository.revokeAll(userId, sesionActualId);
  await AuditRepository.log({ actorId: userId, action: 'SESIONES_CERRADAS', detail: 'Todas las demás sesiones fueron cerradas' });
  return { cerradas: true };
}