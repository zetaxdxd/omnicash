/**
 * OmniCash - Infraestructura
 * Servicio de contraseñas: hashing con bcryptjs.
 * Nunca se guarda la contraseña en texto plano: solo su hash.
 */

import bcrypt from 'bcryptjs';

/** Coste del algoritmo (10 = equilibrado entre seguridad y velocidad) */
const SALT_ROUNDS = 10;

export const PasswordService = {
  /**
   * Genera el hash seguro de una contraseña.
   * @param {string} plainPassword Contraseña en texto plano
   * @returns {Promise<string>} Hash bcrypt
   */
  hash(plainPassword) {
    return bcrypt.hash(plainPassword, SALT_ROUNDS);
  },

  /**
   * Compara una contraseña en texto plano contra su hash.
   * @param {string} plainPassword
   * @param {string} hash
   * @returns {Promise<boolean>}
   */
  verify(plainPassword, hash) {
    return bcrypt.compare(plainPassword, hash);
  },
};