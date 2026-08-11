/**
 * OmniCash - Dominio
 * Entidad Transacción: registro INMUTABLE de cada movimiento de dinero.
 * Un banco moderno nunca borra una transacción: solo registra.
 * Por eso aquí no hay métodos que modifiquen; solo construcción y lectura.
 */

/** Tipos de transacción soportados por OmniCash */
export const TRANSACTION_TYPES = Object.freeze({
  DEPOSITO: 'DEPOSITO',               // Entrada de dinero a la cuenta (ventanilla)
  DEPOSITO_YAPE: 'DEPOSITO_YAPE',     // Entrada de dinero por Yape (confirmada por el admin)
  RETIRO_CAJERO: 'RETIRO_CAJERO',     // Salida de dinero por cajero automático
  TRANSFERENCIA_ENVIADA: 'TRANSFERENCIA_ENVIADA', // Salida por transferencia
  TRANSFERENCIA_RECIBIDA: 'TRANSFERENCIA_RECIBIDA', // Entrada por transferencia
});

/**
 * Clase de dominio Transacción.
 * Inmutable: una vez creada representa un hecho ocurrido.
 */
export class Transaction {
  /**
   * @param {object} data Datos de la transacción
   */
  constructor({ id = null, accountId, type, amount, description = '', referenceId = null, createdAt = null } = {}) {
    this.id = id;
    this.accountId = accountId;
    this.type = type;
    this.amount = amount;
    this.description = description;
    this.referenceId = referenceId; // Para vincular pares (ej: transferencia enviada/recibida)
    this.createdAt = createdAt ?? new Date().toISOString();
    this.validate();
  }

  /** Valida reglas mínimas de la transacción */
  validate() {
    if (!this.accountId) throw new Error('La transacción requiere una cuenta');
    if (!Object.values(TRANSACTION_TYPES).includes(this.type)) {
      throw new Error(`Tipo de transacción inválido: ${this.type}`);
    }
    if (typeof this.amount !== 'number' || this.amount <= 0) {
      throw new Error('El monto de la transacción debe ser mayor a cero');
    }
  }

  /** Firma digital de la transacción para trazabilidad */
  toJSON() {
    return {
      id: this.id,
      accountId: this.accountId,
      type: this.type,
      amount: this.amount,
      description: this.description,
      referenceId: this.referenceId,
      createdAt: this.createdAt,
    };
  }
}