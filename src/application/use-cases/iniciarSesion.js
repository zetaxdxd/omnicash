/**
 * OmniCash - Aplicación
 * Caso de uso: Iniciar sesión (v2 — seguridad bancaria).
 *
 * Defensas implementadas:
 * 1. Anti-enumeración: si el correo no existe, se compara contra un hash
 *    ficticio para no filtrar usuarios por tiempo de respuesta.
 * 2. Anti fuerza bruta: tras N intentos fallidos el login se bloquea
 *    temporalmente y se envía una alerta al correo del cliente.
 * 3. Verificación de correo obligatoria antes del primer acceso.
 * 4. Segundo factor TOTP: si está activado, el login entrega un token
 *    temporal P2FA y exige el código antes de crear la sesión real.
 * 5. Sesiones revocables (token opaco con hash en BD) en lugar de JWT.
 */

import crypto from 'node:crypto';
import {
  InvalidCredentialsError, ForbiddenError,
} from '../../domain/errors/DomainError.js';
import { UserRepository } from '../../infrastructure/repositories/UserRepository.js';
import { SessionRepository } from '../../infrastructure/repositories/SessionRepository.js';
import { AuditRepository } from '../../infrastructure/repositories/AuditRepository.js';
import { PasswordService } from '../../infrastructure/security/password.js';
import { generarToken, SESSION_PURPOSES } from '../../infrastructure/security/sessions.js';
import { config, TEMP_TTL_MS, SESSION_TTL_MS } from '../../infrastructure/config.js';
import { enviarAlertaFuerzaBruta } from '../../infrastructure/email/emailUsuarios.js';

/** Hash ficticio para igualar el tiempo de respuesta cuando el correo no existe */
const HASH_FICTICIO = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8VvI8p8A3X1QkYq0nTWyHe6fZ6llEe';

/**
 * Autentica a un usuario (primer paso). Si el usuario tiene 2FA activado,
 * devuelve un token temporal para completar el segundo paso.
 *
 * @param {object} input {email, password, userAgent, ip}
 * @returns {object} {token?, requiere2fa?, sesionTemporal?, usuario}
 */
export async function iniciarSesion({ email, password, userAgent = null, ip = null }) {
  const emailNormalizado = String(email ?? '').trim().toLowerCase();
  const usuario = await UserRepository.findByEmail(emailNormalizado);

  // Anti-enumeración: la comparación se hace igual aunque no exista el usuario
  const hashReal = usuario ? usuario.passwordHash : HASH_FICTICIO;
  const passwordOk = await PasswordService.verify(password ?? '', hashReal);

  if (!usuario) {
    throw new InvalidCredentialsError();
  }

  // Bloqueo temporal por fuerza bruta (previo a verificar contraseña)
  if (usuario.isLoginBlocked) {
    throw new ForbiddenError(
      `Demasiados intentos fallidos. Tu acceso está bloqueado temporalmente; reintenta en ${usuario.loginBlockMinutesLeft} minuto(s)`
    );
  }

  if (!passwordOk) {
    const bloqueado = usuario.registrarIntentoFallido(config.loginMaxAttempts, config.loginBlockMinutes);
    await UserRepository.update(usuario);

    if (bloqueado) {
      // Alerta de seguridad al correo real del cliente
      enviarAlertaFuerzaBruta(usuario.email, {
        minutosBloqueo: config.loginBlockMinutes,
        ip,
        agente: userAgent,
      }).catch(() => {});
      await AuditRepository.log({
        actorId: usuario.id,
        action: 'LOGIN_BLOQUEADO',
        detail: `Login bloqueado por intentos fallidos (IP ${ip ?? 'desconocida'}, ${userAgent ?? '? '}). ${config.loginBlockMinutes} minutos`,
      });
      throw new ForbiddenError(
        `Demasiados intentos fallidos. Tu acceso quedó bloqueado ${config.loginBlockMinutes} minutos y enviamos una alerta a tu correo`
      );
    }

    const restantes = config.loginMaxAttempts - usuario.loginAttempts;
    throw new InvalidCredentialsError(
      `Correo o contraseña incorrectos. Te quedan ${restantes} intento(s) antes de bloquear tu acceso temporalmente`
    );
  }

  // Contraseña correcta: reinicia el contador anti fuerza bruta
  usuario.reiniciarIntentosFallidos();
  await UserRepository.update(usuario);

  // El correo debe estar verificado (identidad confirmada)
  if (!usuario.isEmailVerified) {
    throw new ForbiddenError(
      'Primero verifica tu correo electrónico con el código que te enviamos al registrarte'
    );
  }

  // Cuentas bloqueadas por el administrador no acceden
  if (!usuario.isActivo) {
    throw new ForbiddenError('Tu cuenta está bloqueada por el administrador. Contacta con soporte');
  }

  await AuditRepository.log({
    actorId: usuario.id,
    action: 'LOGIN',
    detail: `Inicio de sesión: ${emailNormalizado} (IP ${ip ?? 'desconocida'})`,
  });

  // Segundo factor obligatorio si está activado
  if (usuario.totpEnabled) {
    const tokenTemporal = generarToken();
    await SessionRepository.insert({
      token: tokenTemporal,
      userId: usuario.id,
      purpose: SESSION_PURPOSES.P2FA,
      userAgent,
      ip,
      expiresAt: new Date(Date.now() + TEMP_TTL_MS).toISOString(),
    });
    return { requiere2fa: true, sesionTemporal: tokenTemporal, usuario: usuario.toPublicJSON() };
  }

  // Sesión real de login
  const token = generarToken();
  await SessionRepository.insert({
    token,
    userId: usuario.id,
    purpose: SESSION_PURPOSES.LOGIN,
    userAgent,
    ip,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });

  return { token, requiere2fa: false, usuario: usuario.toPublicJSON() };
}

/** Genera un token aleatorio para propósitos internos (evita import ciclico) */
export function tokenSeguro() {
  return crypto.randomBytes(32).toString('hex');
}