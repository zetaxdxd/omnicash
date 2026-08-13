/**
 * OmniCash - Aplicación
 * Casos de uso para Alcancías 3D (metas de ahorro con redondeo automático).
 */

import { AccountRepository } from '../../infrastructure/repositories/AccountRepository.js';
import { GoalRepository } from '../../infrastructure/repositories/GoalRepository.js';
import { TransactionRepository } from '../../infrastructure/repositories/TransactionRepository.js';
import { TRANSACTION_TYPES } from '../../domain/entities/Transaction.js';
import { BusinessRuleViolationError } from '../../domain/errors/DomainError.js';
import { config } from '../../infrastructure/config.js';

/** Crea una nueva alcancia (meta de ahorro) para el usuario autenticado. */
export async function crearAlcancia({ nombre, objetivo, accountId }) {
  const cuenta = await AccountRepository.findById(accountId);
  if (!cuenta) throw new BusinessRuleViolationError('Cuenta bancaria no encontrada');
  cuenta.ensureOperativa();

  const alcancia = await GoalRepository.create({
    userId: cuenta.userId,
    accountId: cuenta.id,
    nombre,
    objetivo: Number(objetivo),
  });

  return { mensaje: 'Alcancia creada correctamente', alcancia };
}

/** Aporta dinero a una alcancia (descuenta la cuenta y registra la transacción). */
export async function aportarAlcancia({ goalId, monto }) {
  const goal = await GoalRepository.findById(Number(goalId));
  if (!goal) throw new BusinessRuleViolationError('Alcancia no encontrada');

  // Descontar del saldo de la cuenta asociada
  const cuenta = await AccountRepository.findById(Number(goal.accountId));
  if (!cuenta) throw new BusinessRuleViolationError('Cuenta de la alcancia no encontrada');
  cuenta.ensureOperativa();
  cuenta.retirar(monto);
  await AccountRepository.update(cuenta);

  // Registrar aportación en la alcancia (ahorrado++)
  const actualizada = await GoalRepository.aportar({ goalId, monto });

  // Registrar transacción ALCANCIA_APORTE
  await TransactionRepository.insert(new Transaction({
    accountId: cuenta.id,
    type: TRANSACTION_TYPES.ALCANCIA_APORTE,
    amount: monto,
    description: `Aportación a alcancia "${goal.nombre}" de ${monto} créditos`,
  }));

  return {
    mensaje: 'Aportación registrada correctamente',
    alcancia: actualizada,
    saldoCuenta: cuenta.balance,
  };
}

/** Retira dinero de una alcancia (devuelve el monto a la cuenta). */
export async function sacarDeAlcancia({ goalId, monto }) {
  const goal = await GoalRepository.findById(Number(goalId));
  if (!goal) throw new BusinessRuleViolationError('Alcancia no encontrada');

  // Validar que no se retire más de lo ahorrado
  if (monto > goal.ahorrado) throw new BusinessRuleViolationError('No puedes retirar más de lo ahorrado en la alcancia');

  // Descontar de la alcancia
  const actualizada = await GoalRepository.retirar({ goalId, monto });

  // Sumar el monto al saldo de la cuenta asociada
  const cuenta = await AccountRepository.findById(Number(goal.accountId));
  if (!cuenta) throw new BusinessRuleViolationError('Cuenta de la alcancia no encontrada');
  cuenta.depositar(monto);
  await AccountRepository.update(cuenta);

  // Registrar transacción ALCANCIA_RETIRO
  await TransactionRepository.insert(new Transaction({
    accountId: cuenta.id,
    type: TRANSACTION_TYPES.ALCANCIA_RETIRO,
    amount: monto,
    description: `Retiro de alcancia "${goal.nombre}" de ${monto} créditos`,
  }));

  return {
    mensaje: 'Retiro de alcancia completado',
    alcancia: actualizada,
    saldoCuenta: cuenta.balance,
  };
}