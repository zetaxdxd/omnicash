/**
 * OmniCash - Interfaces HTTP
 * Middlewares de autenticación y autorización de operaciones sensibles.
 *
 * - autenticar: valida el token opaco de sesión (LOGIN) contra su hash
 *   en la base de datos. Verifica expiración, revocación y estado del usuario.
 * - exigirReauth: valida el token temporal REAUTH (un solo uso) que se
 *   solicita antes de una operación sensible.
 */

import { SessionRepository } from '../../../infrastructure/repositories/SessionRepository.js';
import { UserRepository } from '../../../infrastructure/repositories/UserRepository.js';
import { SESSION_PURPOSES } from '../../../infrastructure/security/sessions.js';
import { UnauthorizedError, ForbiddenError } from '../../../domain/errors/DomainError.js';

/** Extrae el token Bearer del header Authorization */
function extraerToken(req) {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

/**
 * Middleware Express: protege rutas que requieren sesión de login.
 */
export async function autenticar(req, res, next) {
  try {
    const token = extraerToken(req);
    if (!token) throw new UnauthorizedError();

    const sesion = await SessionRepository.findByToken(token);
    // Token inválido, revocado o de otro propósito
    if (!sesion
      || sesion.purpose !== SESSION_PURPOSES.LOGIN
      || sesion.revokedAt
      || new Date(sesion.expiresAt).getTime() < Date.now()) {
      throw new UnauthorizedError('Tu sesión expiró o fue cerrada. Inicia sesión de nuevo');
    }

    // Carga al usuario real desde la BD para reflejar su estado actual
    const usuario = await UserRepository.findById(sesion.userId);
    if (!usuario) throw new UnauthorizedError();

    if (!usuario.isActivo) {
      await SessionRepository.revoke(sesion.id, sesion.userId);
      throw new UnauthorizedError('Tu cuenta está bloqueada por el administrador');
    }

    // Registra actividad de la sesión
    await SessionRepository.touch(sesion.id);

    req.usuario = usuario;
    req.sesion = sesion;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware Express: exige un token REAUTH válido y DE UN SOLO USO
 * antes de una operación sensible (retiro/transferencia grandes).
 * El token llega en el header X-Reauth-Token.
 */
export async function exigirReauth(req, res, next) {
  try {
    const token = req.headers['x-reauth-token'] ?? null;
    if (!token) {
      throw new ForbiddenError('Esta operación requiere que te identifiques de nuevo');
    }

    const sesion = await SessionRepository.findByToken(token);
    if (!sesion
      || sesion.purpose !== SESSION_PURPOSES.REAUTH
      || sesion.userId !== req.usuario.id
      || sesion.usedAt
      || sesion.revokedAt
      || new Date(sesion.expiresAt).getTime() < Date.now()) {
      throw new UnauthorizedError('La confirmación expiró o ya fue usada. Solicítala de nuevo');
    }

    // Token de un solo uso: se invalida al consumirse
    await SessionRepository.markUsed(sesion.id);
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware Express: restringe la ruta a ciertos roles.
 * Uso: proteger('ADMIN') o proteger('ADMIN', 'TRABAJADOR').
 * @param  {...string} roles Roles permitidos
 * @returns {Function} Middleware Express
 */
export function proteger(...roles) {
  return (req, res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.role)) {
      return next(new ForbiddenError('No tienes permisos para acceder a este recurso'));
    }
    next();
  };
}