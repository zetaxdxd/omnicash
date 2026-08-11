/**
 * OmniCash - Infraestructura
 * Servicio de sesiones: tokens opacos (en lugar de JWT).
 * - El token que recibe el cliente es aleatorio (32 bytes), firma criptográfica.
 * - En la base de datos solo se guarda su hash SHA-256: si alguien roba
 *   la BD, no puede reutilizar ningún token.
 * - Cada sesión tiene propósito (LOGIN/REAUTH/P2FA) y puede revocarse.
 */

import crypto from 'node:crypto';

/**
 * Genera un token opaco nuevo.
 * @returns {string} Token de 64 caracteres hexadecimales
 */
export function generarToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Calcula el hash SHA-256 de un token (lo que se guarda en la BD).
 * @param {string} token
 * @returns {string} Hash hexadecimal
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Propósitos de sesión soportados */
export const SESSION_PURPOSES = Object.freeze({
  LOGIN: 'LOGIN',         // Sesión normal de usuario
  REAUTH: 'REAUTH',       // Autorización puntual para operación sensible
  P2FA: 'P2FA',           // Token temporal del segundo paso del login (2FA)
});