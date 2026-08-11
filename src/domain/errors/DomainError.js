/**
 * OmniCash - Dominio
 * Errores de dominio: representan reglas de negocio violadas.
 * Son la forma en que la capa de aplicación comunica problemas
 * del negocio (saldo insuficiente, usuario no encontrado, etc.)
 * sin acoplarse a detalles de HTTP ni de la base de datos.
 */

/** Error base de toda regla de negocio violada */
export class DomainError extends Error {
  /**
   * @param {string} message Mensaje descriptivo para el usuario final
   * @param {number} statusCode Código HTTP sugerido para el error (default 400)
   */
  constructor(message, statusCode = 400) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = true; // error esperado, no un fallo del sistema
  }
}

/** Se lanza cuando un usuario o cuenta no existe */
export class NotFoundError extends DomainError {
  constructor(message = 'Recurso no encontrado') {
    super(message, 404);
  }
}

/** Se lanza cuando las credenciales son inválidas (login) */
export class InvalidCredentialsError extends DomainError {
  constructor(message = 'Correo o contraseña incorrectos') {
    super(message, 401);
  }
}

/** Se lanza cuando el token de sesión no es válido o expiró */
export class UnauthorizedError extends DomainError {
  constructor(message = 'Sesión no válida o expirada') {
    super(message, 401);
  }
}

/** Se lanza cuando un usuario no tiene permiso para la acción */
export class ForbiddenError extends DomainError {
  constructor(message = 'No tienes permisos para realizar esta acción') {
    super(message, 403);
  }
}

/** Se lanza cuando un recurso que debe ser único ya existe (ej: correo registrado) */
export class ConflictError extends DomainError {
  constructor(message = 'El recurso ya existe') {
    super(message, 409);
  }
}

/** Se lanza al violar reglas de negocio (saldo insuficiente, montos inválidos, límites) */
export class BusinessRuleViolationError extends DomainError {
  constructor(message = 'Operación no permitida') {
    super(message, 422);
  }
}
