/**
 * OmniCash - Aplicación
 * Caso de uso: cambiar la contraseña desde la sesión iniciada.
 *
 * A diferencia de la recuperación (solicitarRecuperacion), aquí el cliente
 * YA está autenticado: demuestra que es él con su contraseña ACTUAL.
 * Al cambiarla:
 * - Se cierran las sesiones de los demás dispositivos (protección ante
 *   un posible acceso ajeno).
 * - Se envía una alerta al correo principal.
 */

import { ForbiddenError, BusinessRuleViolationError } from '../../domain/errors/DomainError.js';
import { esContrasenaFuerte } from '../../domain/entities/User.js';
import { UserRepository } from '../../infrastructure/repositories/UserRepository.js';
import { SessionRepository } from '../../infrastructure/repositories/SessionRepository.js';
import { AuditRepository } from '../../infrastructure/repositories/AuditRepository.js';
import { PasswordService } from '../../infrastructure/security/password.js';
import { enviarAlertaContrasenaCambiada } from '../../infrastructure/email/emailUsuarios.js';

/**
 * Cambia la contraseña del usuario autenticado.
 * @param {object} input {userId, sesionActualId, passwordActual, nuevaPassword}
 * @returns {object} {cambiada: true}
 */
export async function cambiarContrasena({ userId, sesionActualId, passwordActual, nuevaPassword }) {
  const usuario = await UserRepository.findById(userId);
  if (!usuario) throw new ForbiddenError();

  const actual = String(passwordActual ?? '');
  const nueva = String(nuevaPassword ?? '');

  // 1. Prueba de identidad: la contraseña actual debe ser correcta
  if (!await PasswordService.verify(actual, usuario.passwordHash)) {
    throw new ForbiddenError('La contraseña actual es incorrecta');
  }

  // 2. Política de seguridad y novedad de la clave
  if (!esContrasenaFuerte(nueva)) {
    throw new BusinessRuleViolationError(
      'La contraseña nueva debe tener al menos 8 caracteres, con mayúscula, minúscula y número'
    );
  }
  if (await PasswordService.verify(nueva, usuario.passwordHash)) {
    throw new BusinessRuleViolationError('La contraseña nueva debe ser distinta a la actual');
  }

  // 3. Aplica el cambio y cierra las demás sesiones
  const nuevoHash = await PasswordService.hash(nueva);
  await UserRepository.cambiarContrasena(usuario.id, nuevoHash);
  await SessionRepository.revokeAll(usuario.id, sesionActualId ?? null);

  await AuditRepository.log({
    actorId: usuario.id,
    action: 'CONTRASENA_CAMBIADA',
    detail: 'La contraseña fue cambiada desde la sesión activa',
  });

  await enviarAlertaContrasenaCambiada(usuario.email);

  return { cambiada: true };
}