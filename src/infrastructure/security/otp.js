/**
 * OmniCash - Infraestructura
 * Servicio de códigos OTP (One-Time Password) para verificación por correo.
 * - Genera códigos de 6 dígitos.
 * - Nunca almacena el código en claro: solo guarda su hash SHA-256 con salt.
 * - Comparación en tiempo constante contra el hash (evita timing attacks).
 * - Controla expiración, intentos máximos y reutilización.
 */

import crypto from 'node:crypto';
import { config } from '../config.js';

/** Intentos máximos antes de invalidar un código */
const MAX_ATTEMPTS = 5;

/**
 * Genera un código OTP de 6 dígitos.
 * @returns {string} Código numérico de 6 dígitos
 */
export function generarCodigoOtp() {
  // crypto.randomInt garantiza aleatoriedad criptográfica
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

/**
 * Calcula el hash seguro del código (código + salt por código).
 * @param {string} codigo Código OTP
 * @returns {{hash: string, salt: string}} Hash y salt usados
 */
export function hashearCodigo(codigo) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(`${salt}:${codigo}`).digest('hex');
  return { hash, salt };
}

/**
 * Verifica un código contra su hash almacenado.
 * @param {string} codigo Código ingresado por el usuario
 * @param {string} hash Hash almacenado (formato salt:hash)
 * @returns {boolean} true si coincide
 */
export function verificarCodigo(codigo, hash) {
  const [salt, hashHex] = String(hash ?? '').split(':');
  if (!salt || !hashHex) return false;
  const calculado = crypto.createHash('sha256').update(`${salt}:${codigo}`).digest('hex');
  // Comparación en tiempo constante
  const a = Buffer.from(calculado, 'utf8');
  const b = Buffer.from(hashHex, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Calcula si un código fue emitido dentro de su ventana de validez.
 * Acepta filas con claves camelCase (repositorios) o snake_case (SQL crudo).
 * @param {object} fila Fila de verification_codes
 * @returns {boolean} true si el código sigue vigente y no fue usado
 */
export function codigoVigente(fila) {
  if (!fila) return false;
  if (fila.used_at || fila.usedAt) return false;
  const attempts = Number(fila.attempts ?? 0);
  if (attempts >= MAX_ATTEMPTS) return false;
  const expira = new Date(fila.expires_at ?? fila.expiresAt).getTime();
  return Date.now() < expira;
}

/** Intentos máximos permitidos por código */
export const OTP_MAX_ATTEMPTS = MAX_ATTEMPTS;

/** Devuelve el TTL de los códigos en milisegundos */
export const OTP_TTL_MS = config.otpTtlMinutes * 60 * 1000;