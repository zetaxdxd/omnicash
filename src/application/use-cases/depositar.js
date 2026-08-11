/**
 * OmniCash - Aplicación
 * Caso de uso: Depositar créditos.
 * El administrador o un trabajador puede abonar dinero/créditos
 * iniciales a la cuenta de un cliente (por ejemplo, un depósito en ventanilla).
 */

import { AccountRepository } from '../../infrastructure/repositories/AccountRepository.js';
import { TransactionRepository } from '../../infrastructure/repositories/TransactionRepository.js';
import { AuditRepository } from '../../infrastructure/repositories/AuditRepository.js';
import { Transaction, TRANSACTION_TYPES } from '../../domain/entities/Transaction.js';
import { NotFoundError, BusinessRuleViolationError } from '../../domain/errors/DomainError.js';

/**
 * Realiza un depósito de créditos en una cuenta.
 * @param {object} input {cci, monto, autorId}
 * @returns {object} {cuenta, transaccion} estado actualizado
 */
export async function depositar({ cci, monto, autorId }) {
  const cuenta = await AccountRepository.findByCci(cci);
  if (!cuenta) {
    throw new NotFoundError('No existe ninguna cuenta con esa CCI');
  }

  cuenta.ensureOperativa();
  cuenta.validarMonto(monto);

  // Regla de negocio: depósito máximo por operación (anti-lavado simple)
  const DEPOSITO_MAXIMO = 100000; // créditos
  if (monto > DEPOSITO_MAXIMO) {
    throw new BusinessRuleViolationError(
      `El depósito máximo por operación es de ${DEPOSITO_MAXIMO} créditos`
    );
  }

  cuenta.depositar(monto);
  await AccountRepository.update(cuenta);

  const transaccion = await TransactionRepository.insert(new Transaction({
    accountId: cuenta.id,
    type: TRANSACTION_TYPES.DEPOSITO,
    amount: monto,
    description: `Depósito de ${monto} créditos`,
  }));

  await AuditRepository.log({
    actorId: autorId,
    action: 'DEPOSITO',
    detail: `Depósito de ${monto} créditos a la cuenta ${cci}`,
  });

  return { cuenta: { id: cuenta.id, cci: cuenta.cci, balance: cuenta.balance, state: cuenta.state } };
}