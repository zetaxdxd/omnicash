/**
 * OmniCash - Interfaces HTTP
 * Middleware de manejo de errores centralizado.
 * Convierte errores de dominio a respuestas JSON limpias
 * y evita filtrar detalles internos al cliente.
 */

import { DomainError } from '../../../domain/errors/DomainError.js';

/** Ruta inexistente */
export function rutaNoEncontrada(req, res, next) {
  res.status(404).json({ error: 'Ruta no encontrada' });
}

/**
 * Captura cualquier error de la aplicación.
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function manejadorDeErrores(err, req, res, next) {
  // Errores de dominio: respuesta controlada con su código de estado
  if (err instanceof DomainError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Errores de validación de Express (JSON malformado, etc.)
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido en la petición' });
  }

  // Error inesperado: no exponer el detalle interno
  console.error('[OmniCash] Error no controlado:', err);
  return res.status(500).json({ error: 'Error interno del servidor' });
}