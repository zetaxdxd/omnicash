/**
 * OmniCash - Aplicación
 * Caso de uso: Transferencia entre cuentas (por CCI interbancaria).
 * La operación financiera central del banco:
 * - Verifica la CCI del destinatario (20 dígitos con dígitos de control).
 * - Verifica fondos del emisor (regla de dominio: no sobregirar).
 * - Registra DOS transacciones vinculadas (envío y recepción)
 *   con el mismo referenceId para trazabilidad completa.
 * - Si el monto supera el umbral sensible, la ruta HTTP exige
 *   reautenticación previa (middleware exigirReauth).
 */

import { AccountRepository } from '../../infrastructure/repositories/AccountRepository.js';
import { TransactionRepository } from '../../infrastructure/repositories/TransactionRepository.js';
import { AuditRepository } from '../../infrastructure/repositories/AuditRepository.js';
import { Transaction, TRANSACTION_TYPES } from '../../domain/entities/Transaction.js';
import { NotFoundError, BusinessRuleViolationError } from '../../domain/errors/DomainError.js';
import { validarCci } from '../../infrastructure/security/peru.js';

/**
 * Transfiere créditos de la cuenta del solicitante a otra cuenta OmniCash.
 *
 * @param {object} input {userId, destinoCci, monto}
 * @returns {object} {saldoRestante, monto, destinatario}
 */
export async function transferir({ userId, destinoCci, monto }) {
  const cuentaOrigen = await AccountRepository.findByUserId(userId);
  if (!cuentaOrigen) {
    throw new BusinessRuleViolationError('No tienes una cuenta bancaria activa');
  }
  cuentaOrigen.ensureOperativa();
  cuentaOrigen.validarMonto(monto);

  // Validación de la CCI destino (formato y dígitos de verificación)
  const cciDestino = String(destinoCci ?? '').trim();
  if (!validarCci(cciDestino)) {
    throw new BusinessRuleViolationError('La CCI destino no es válida. Debe tener 20 dígitos correctos');
  }

  const cuentaDestino = await AccountRepository.findByCci(cciDestino);
  if (!cuentaDestino) {
    throw new NotFoundError('No existe ninguna cuenta con esa CCI. Verifica el número destino');
  }

  // No se puede transferir a uno mismo (regla de negocio)
  if (cuentaDestino.id === cuentaOrigen.id) {
    throw new BusinessRuleViolationError('No puedes transferirte créditos a tu propia cuenta');
  }
  cuentaDestino.ensureOperativa();

  // Débito del origen (valida fondos) y abono al destino
  cuentaOrigen.retirar(monto);
  cuentaDestino.depositar(monto);

  // Persistencia de ambos saldos
  await AccountRepository.update(cuentaOrigen);
  await AccountRepository.update(cuentaDestino);

  // Registro contable en dos asientos vinculados por referenceId
  const referencia = `TR${Date.now()}`;
  const txSalida = await TransactionRepository.insert(new Transaction({
    accountId: cuentaOrigen.id,
    type: TRANSACTION_TYPES.TRANSFERENCIA_ENVIADA,
    amount: monto,
    description: `Transferencia a la CCI ${cciDestino}`,
    referenceId: referencia,
  }));
  await TransactionRepository.insert(new Transaction({
    accountId: cuentaDestino.id,
    type: TRANSACTION_TYPES.TRANSFERENCIA_RECIBIDA,
    amount: monto,
    description: `Transferencia recibida desde ${cuentaOrigen.cci}`,
    referenceId: referencia,
  }));

  await AuditRepository.log({
    actorId: userId,
    action: 'TRANSFERENCIA',
    detail: `Transferencia de ${monto} créditos hacia ${cciDestino}`,
  });

  return {
    saldoRestante: cuentaOrigen.balance,
    monto,
    destinatario: cciDestino,
    referencia,
    transaccionId: txSalida.id,
  };
}