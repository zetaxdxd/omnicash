/**
 * OmniCash - Aplicación
 * Caso de uso: Consultar estado de la cuenta del cliente.
 * Retorna el saldo, la CCI y el historial de movimientos.
 */

import { AccountRepository } from '../../infrastructure/repositories/AccountRepository.js';
import { TransactionRepository } from '../../infrastructure/repositories/TransactionRepository.js';
import { BusinessRuleViolationError } from '../../domain/errors/DomainError.js';

/**
 * Obtiene el resumen financiero del cliente autenticado.
 * @param {object} input {userId}
 * @returns {object} {cuenta, saldo, transacciones}
 */
export async function consultarCuenta({ userId }) {
  const cuenta = await AccountRepository.findByUserId(userId);
  if (!cuenta) {
    throw new BusinessRuleViolationError('No tienes una cuenta bancaria activa');
  }

  const transacciones = await TransactionRepository.findByAccount(cuenta.id, 50);

  return {
    cuenta: {
      cci: cuenta.cci,
      balance: cuenta.balance,
      state: cuenta.state,
      createdAt: cuenta.createdAt,
    },
    transacciones: transacciones.map(t => t.toJSON()),
  };
}