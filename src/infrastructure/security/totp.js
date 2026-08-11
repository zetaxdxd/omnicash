/**
 * OmniCash - Infraestructura
 * Implementación de TOTP (RFC 6238) — el estándar usado por Google Authenticator,
 * Authy y demás aplicaciones de dos factores. Sin dependencias externas:
 * usa HMAC-SHA1 de node:crypto.
 *
 * - Secreto generado con aleatoriedad criptográfica (base32).
 * - Códigos de 6 dígitos con ventana de 30 segundos.
 * - Tolerancia de ±1 ventana para compensar relojes desfasados.
 * - Genera la URI otpauth:// para escanear con la app del usuario.
 */

import crypto from 'node:crypto';

/** Ventana de tiempo de cada código (segundos, estándar RFC 6238) */
const TIME_STEP = 30;
/** Número de dígitos del código */
const DIGITS = 6;
/** Ventanas de tolerancia hacia atrás y adelante */
const WINDOW_TOLERANCE = 1;

/** Alfabeto base32 (RFC 4648) */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Codifica un buffer en base32 (RFC 4648).
 * @param {Buffer} buffer
 * @returns {string} Texto en base32 sin padding
 */
function toBase32(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * Decodifica texto base32 a buffer.
 * @param {string} texto
 * @returns {Buffer}
 */
function fromBase32(texto) {
  const limpio = texto.toUpperCase().replace(/=+$/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of limpio) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error('Secreto base32 inválido');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Genera un secreto TOTP nuevo (20 bytes aleatorios en base32).
 * @returns {string} Secreto listo para configurar en la app
 */
export function generarSecretoTotp() {
  return toBase32(crypto.randomBytes(20));
}

/**
 * Calcula el código TOTP para un secreto en una marca de tiempo.
 * @param {string} secretoBase32 Secreto del usuario
 * @param {number} [tiempoMs=Date.now()] Instante (ms) — pruebas
 * @returns {string} Código de 6 dígitos
 */
export function calcularTotp(secretoBase32, tiempoMs = Date.now()) {
  const contador = Math.floor(tiempoMs / 1000 / TIME_STEP);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(contador));

  const hm = crypto.createHmac('sha1', fromBase32(secretoBase32)).update(buffer).digest();
  const offset = hm[hm.length - 1] & 0x0f;
  const binario = ((hm[offset] & 0x7f) << 24) | (hm[offset + 1] << 16) | (hm[offset + 2] << 8) | hm[offset + 3];
  return String(binario % 10 ** DIGITS).padStart(DIGITS, '0');
}

/**
 * Verifica un código TOTP contra el secreto, tolerando ±1 ventana.
 * @param {string} codigo Código ingresado por el usuario
 * @param {string} secretoBase32 Secreto del usuario
 * @returns {boolean} true si el código coincide
 */
export function verificarTotp(codigo, secretoBase32) {
  if (!/^\d{6}$/.test(String(codigo ?? ''))) return false;
  const ahora = Date.now();
  for (let ventana = -WINDOW_TOLERANCE; ventana <= WINDOW_TOLERANCE; ventana++) {
    const intento = String(calcularTotp(secretoBase32, ahora + ventana * TIME_STEP * 1000));
    if (intento === String(codigo)) return true;
  }
  return false;
}

/**
 * Genera la URI otpauth:// para escanear con una app de autenticación.
 * @param {string} secretoBase32
 * @param {string} email Correo del usuario (etiqueta de la cuenta)
 * @returns {string} URI de configuración
 */
export function otpauthUri(secretoBase32, email) {
  const label = encodeURIComponent(`OmniCash:${email}`);
  return `otpauth://totp/${label}?secret=${secretoBase32}&issuer=OmniCash&algorithm=SHA1&digits=${DIGITS}&period=${TIME_STEP}`;
}