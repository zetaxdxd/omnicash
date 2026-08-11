/**
 * OmniCash - Aplicación
 * Caso de uso: Retiro en cajero automático.
 * Simula un cajero (por ejemplo, un cajero de la red de otro banco):
 * - Aplica una comisión por usar cajero ajeno (configurable).
 * - Aplica un límite diario de retiro (configurable).
 * - La operación es atómica: saldo, comisión y registro juntos.
 */

import { config } from '../../infrastructure/config.js';
import { AccountRepository } from '../../infrastructure/repositories/AccountRepository.js';
import { TransactionRepository } from '../../infrastructure/repositories/TransactionRepository.js';
import { AuditRepository } from '../../infrastructure/repositories/AuditRepository.js';
import { Transaction, TRANSACTION_TYPES } from '../../domain/entities/Transaction.js';
import { BusinessRuleViolationError } from '../../domain/errors/DomainError.js';

/**
 * Retira créditos de la cuenta del cliente usando un cajero genérico.
 * Se calcula la comisión, se verifica el límite diario y se valida el saldo.
 *
 * @param {object} input {userId, monto, autorId}
 * @returns {object} {saldoRestante, comision, totalDebitado}
 */
export async function retirarEnCajero({ userId, monto, autorId }) {
  const cuenta = await AccountRepository.findByUserId(userId);
  if (!cuenta) {
    throw new BusinessRuleViolationError('No tienes una cuenta bancaria activa');
  }

  cuenta.ensureOperativa();
  cuenta.validarMonto(monto);

  // 1. Cálculo de la comisión por uso de cajero de la red
  const comision = round2(monto * config.atmFee);
  const total = round2(monto + comision);

  // 2. Límite diario de retiro en cajeros
  const inicioDelDia = new Date();
  inicioDelDia.setHours(0, 0, 0, 0);
  const retiradoHoy = await TransactionRepository.sumWithdrawalsSince(cuenta.id, inicioDelDia.toISOString());
  if (round2(retiradoHoy + monto) > config.atmDailyLimit) {
    throw new BusinessRuleViolationError(
      `Superas el límite diario de ${config.atmDailyLimit} créditos en cajeros`
    );
  }

  // 3. Verificación de fondos (regla de dominio) y débito atómico
  cuenta.retirar(total);
  await AccountRepository.update(cuenta);

  await TransactionRepository.insert(new Transaction({
    accountId: cuenta.id,
    type: TRANSACTION_TYPES.RETIRO_CAJERO,
    amount: monto,
    description: `Retiro en cajero (incluye comisión de ${comision} créditos)`,
  }));

  await AuditRepository.log({
    actorId: autorId,
    action: 'RETIRO_CAJERO',
    detail: `Retiro de ${monto} créditos con comisión ${comision}`,
  });

  return { saldoRestante: cuenta.balance, comision, totalDebitado: total };
}

/** Redondea a 2 decimales (seguridad aritmética para dinero) */
function round2(n) {
  return Math.round(n * 100) / 100;
}