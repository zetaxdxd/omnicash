/**
 * OmniCash - Infraestructura
 * Servicio de tokens JWT: emisión y verificación de sesiones.
 * El token transporta la identidad del usuario autenticado.
 */

import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { UnauthorizedError } from '../../domain/errors/DomainError.js';

export const JwtService = {
  /**
   * Emite un token de sesión para un usuario.
   * @param {object} payload {id, role} del usuario
   * @returns {string} Token JWT firmado
   */
  sign({ id, role }) {
    return jwt.sign({ id, role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
  },

  /**
   * Verifica y decodifica un token.
   * @param {string} token
   * @returns {object} Payload decodificado {id, role}
   * @throws {UnauthorizedError} Si el token es inválido o expiró
   */
  verify(token) {
    try {
      return jwt.verify(token, config.jwtSecret);
    } catch {
      throw new UnauthorizedError();
    }
  },
};