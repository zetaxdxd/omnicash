/**
 * OmniCash - Dominio
 * Entidad Cuenta: la cuenta bancaria del cliente donde se guardan los créditos.
 * Aquí viven las reglas de negocio del dinero:
 * abrir cuenta, depositar, retirar y verificar fondos.
 *
 * v2: la cuenta se numera con una CCI de 20 dígitos (estándar interbancario
 * peruano): 3 dígitos de banco + 5 de agencia + 10 de cuenta + 2 verificadores.
 */

import { BusinessRuleViolationError } from '../errors/DomainError.js';
import { generarCci } from '../../infrastructure/security/peru.js';

/** Estados de una cuenta bancaria */
export const ACCOUNT_STATES = Object.freeze({
  ACTIVA: 'ACTIVA',
  CONGELADA: 'CONGELADA', // Solo el administrador puede congelar/descongelar
});

/**
 * Clase de dominio Cuenta.
 * Usa créditos como moneda (una unidad = 1 crédito).
 */
export class Account {
  /**
   * @param {object} data Datos de la cuenta
   * @param {string|null} data.id Identificador de la cuenta
   * @param {string} data.userId Dueño de la cuenta (FK a User.id)
   * @param {string} data.cci Número CCI de 20 dígitos (único)
   * @param {number} data.balance Saldo en créditos (nunca negativo)
   * @param {string} data.state Estado de la cuenta
   * @param {string} data.createdAt Fecha de creación ISO
   */
  constructor({ id = null, userId, cci, balance = 0, state = ACCOUNT_STATES.ACTIVA, createdAt = null } = {}) {
    this.id = id;
    this.userId = userId;
    this.cci = cci;
    this.balance = balance;
    this.state = state;
    this.createdAt = createdAt ?? new Date().toISOString();
    this.validate();
  }

  /** Valida reglas mínimas de la cuenta */
  validate() {
    if (!this.userId) throw new Error('La cuenta debe pertenecer a un usuario');
    if (!this.cci) throw new Error('La cuenta debe tener un número CCI');
    if (typeof this.balance !== 'number' || this.balance < 0) {
      throw new Error('El saldo no puede ser negativo');
    }
  }

  /** Genera un número CCI de 20 dígitos con dígitos de verificación */
  static generarCci() {
    return generarCci();
  }

  /** Abona créditos a la cuenta (depósito, transferencia recibida) */
  depositar(monto) {
    this.validarMonto(monto);
    this.balance += monto;
  }

  /**
   * Retira créditos de la cuenta (transferencia enviada, retiro en cajero).
   * Aplica la regla de negocio más importante: NO sobregirar.
   */
  retirar(monto) {
    this.validarMonto(monto);
    if (monto > this.balance) {
      throw new BusinessRuleViolationError('Saldo insuficiente para realizar la operación');
    }
    this.balance -= monto;
  }

  /** Valida que un monto sea un número positivo válido */
  validarMonto(monto) {
    if (typeof monto !== 'number' || !Number.isFinite(monto)) {
      throw new BusinessRuleViolationError('El monto debe ser un número válido');
    }
    if (monto <= 0) {
      throw new BusinessRuleViolationError('El monto debe ser mayor a cero');
    }
  }

  /** Congela la cuenta (solo administrador) */
  congelar() {
    this.state = ACCOUNT_STATES.CONGELADA;
  }

  /** Descongela la cuenta (solo administrador) */
  descongelar() {
    this.state = ACCOUNT_STATES.ACTIVA;
  }

  /** Verifica que la cuenta pueda operar */
  ensureOperativa() {
    if (this.state !== ACCOUNT_STATES.ACTIVA) {
      throw new BusinessRuleViolationError('La cuenta está congelada, contacta al banco');
    }
  }
}
