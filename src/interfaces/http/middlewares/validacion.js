/**
 * OmniCash - Interfaces HTTP
 * Middleware de validación: funciones simples para validar
 * la entrada del cliente (body) con mensajes claros en español.
 */

import { BusinessRuleViolationError } from '../../../domain/errors/DomainError.js';

/**
 * Valida que un objeto tenga los campos obligatorios y los
 * tipos esperados según un esquema.
 *
 * @param {object} schema {campo: {required: bool, type: string, min?: number}}
 * @returns {Function} Middleware Express
 */
export function validarBody(schema) {
  return (req, res, next) => {
    const body = req.body ?? {};
    for (const [campo, reglas] of Object.entries(schema)) {
      const valor = body[campo];

      if (reglas.required && (valor === undefined || valor === null || valor === '')) {
        return next(new BusinessRuleViolationError(`El campo "${campo}" es obligatorio`));
      }
      if (valor !== undefined && valor !== null && valor !== '') {
        if (reglas.type === 'number') {
          const num = Number(valor);
          if (!Number.isFinite(num)) {
            return next(new BusinessRuleViolationError(`El campo "${campo}" debe ser un número`));
          }
          if (reglas.min !== undefined && num < reglas.min) {
            return next(new BusinessRuleViolationError(`El campo "${campo}" debe ser mayor o igual a ${reglas.min}`));
          }
          body[campo] = num; // normaliza a número
        }
        if (reglas.type === 'string' && typeof valor !== 'string') {
          return next(new BusinessRuleViolationError(`El campo "${campo}" debe ser texto`));
        }
        if (reglas.type === 'object' && (typeof valor !== 'object' || Array.isArray(valor))) {
          return next(new BusinessRuleViolationError(`El campo "${campo}" debe ser un objeto`));
        }
      }
    }
    next();
  };
}