/**
 * OmniCash - Aplicación
 * Caso de uso: Aplicar rentabilidad diaria a una cuenta.
 * Calcula intereses sobre el saldo usando interestRateAnual y los registra
 * en la tabla interest_accruals, acreditando el monto al saldo.
 *
 * Fórmula: interés diario = balance * (interestRateAnual / 365)
 */
import { AccountRepository } from '../../infrastructure/repositories/AccountRepository.js';
import { BusinessRuleViolationError } from '../../domain/errors/DomainError.js';
import { TransactionRepository } from '../../infrastructure/repositories/TransactionRepository.js';
import { TRANSACTION_TYPES } from '../../domain/entities/Transaction.js';
import { config } from '../../infrastructure/config.js';
import { getDb } from '../../infrastructure/database/connection.js';

export async function aplicarRentabilidadDiaria({ accountId }) {
  const cuenta = await AccountRepository.findById(accountId);
  if (!cuenta) throw new BusinessRuleViolationError('Cuenta no encontrada');

  cuenta.ensureOperativa();

  // Interés diario = balance * (tasaAnual / 365)
  const tasaDiaria = config.interestRateAnual / 365;
  const interes = cuenta.balance * tasaDiaria;

  // 1. Abonar intereses al saldo
  cuenta.depositar(interes);

  // 2. Registrar en interest_accruals
  const hoy = new Date();
  const fechaISO = hoy.toISOString().split('T')[0]; // YYYY-MM-DD
  await getDb().prepare(`
    INSERT INTO interest_accruals (account_id, amount, fecha, created_at)
    VALUES (?, ?, ?, ?)
  `).run(Number(accountId), Number(interes), fechaISO, new Date().toISOString());

  // 3. Registrar transacción INTERES_DIARIO
  await TransactionRepository.insert(new Transaction({
    accountId: cuenta.id,
    type: TRANSACTION_TYPES.INTERES_DIARIO,
    amount: interes,
    description: `Interés diario ${config.interestRateAnual}% (saldo: ${cuenta.balance - interes} → ${cuenta.balance})`,
  }));

  // 4. Actualizar cuenta en la BD
  await AccountRepository.update(cuenta);

  return { interes, nuevoSaldo: cuenta.balance, tasaAnual: config.interestRateAnual };
}