/**
 * OmniCash - Aplicación
 * Caso de uso: Recarga de dinero real con QR de Mercado Pago.
 *
 * El cliente escanea un QR con su app Yape (las billeteras aceptan los
 * QR de Mercado Pago) y el pago llega al Yape/vendedor del banco.
 * Mercado Pago notifica al webhook y el saldo se acredita SOLO.
 *
 * 1 sol pagado = 1 crédito. Topes: máximo por operación y acumulado diario.
 */

import { AccountRepository } from '../../infrastructure/repositories/AccountRepository.js';
import { YapeDepositRepository } from '../../infrastructure/repositories/YapeDepositRepository.js';
import { TransactionRepository } from '../../infrastructure/repositories/TransactionRepository.js';
import { AuditRepository } from '../../infrastructure/repositories/AuditRepository.js';
import { NotFoundError, BusinessRuleViolationError, ForbiddenError } from '../../domain/errors/DomainError.js';
import { Transaction, TRANSACTION_TYPES } from '../../domain/entities/Transaction.js';
import { config } from '../../infrastructure/config.js';
import { generarQr } from '../../infrastructure/mercadopago/mp.js';

/**
 * @param {object} input {userId, monto}
 * @returns {object} {referencia, monto, qrData}
 */
export async function solicitarRecargaQr({ userId, monto }) {
  const montoNum = Number(monto);

  if (!config.mpAccessToken) {
    throw new BusinessRuleViolationError(
      'El banco aún no configura Mercado Pago para recibir recargas (MP_ACCESS_TOKEN)'
    );
  }

  const cuenta = await AccountRepository.findByUserId(userId);
  if (!cuenta) {
    throw new BusinessRuleViolationError('No tienes una cuenta bancaria activa');
  }
  cuenta.ensureOperativa();
  cuenta.validarMonto(montoNum);

  // 0. Expirar recargas pendientes vencidas del usuario (libera el cupo)
  await YapeDepositRepository.expirarVencidos(userId, config.recargaQrTtlMinutos * 60 * 1000);

  // 1. Solo una recarga pendiente a la vez
  if (await YapeDepositRepository.countPendientes(userId) > 0) {
    throw new BusinessRuleViolationError(
      'Ya tienes una recarga pendiente. Espera a que se confirme'
    );
  }

  // 2. Tope por operación
  if (montoNum > config.yapeMaxAmount) {
    throw new BusinessRuleViolationError(
      `El monto máximo por recarga es de ${config.yapeMaxAmount} soles`
    );
  }

  // 3. Tope diario acumulado (solo lo ya acreditado)
  const inicioDelDia = new Date();
  inicioDelDia.setHours(0, 0, 0, 0);
  const acreditadoHoy = await YapeDepositRepository.sumAcreditadosDesde(cuenta.id, inicioDelDia.toISOString());
  if (acreditadoHoy + montoNum > config.yapeDailyLimit) {
    throw new BusinessRuleViolationError(
      `Superas el tope diario de ${config.yapeDailyLimit} soles por recargas`
    );
  }

  // 4. Registra la solicitud PENDIENTE y genera el QR de la caja del cliente
  const depositado = await YapeDepositRepository.insert({
    userId,
    accountId: cuenta.id,
    amount: montoNum,
    payerPhone: 'QR',
    operacion: 'MERCADO_PAGO',
  });

  let qr;
  try {
    qr = await generarQr({ userId, depositId: depositado.id, amount: montoNum });
  } catch (error) {
    await YapeDepositRepository.resolver(depositado.id, YapeDepositRepository.STATES.RECHAZADO, null);
    throw new BusinessRuleViolationError(`No se pudo generar el QR: ${error.message}`);
  }

  // 5. Guarda la referencia externa para reconocer el pago en el webhook
  await YapeDepositRepository.guardarExternalRef(depositado.id, qr.externalReference);

  await AuditRepository.log({
    actorId: userId,
    action: 'RECARGA_QR_SOLICITADA',
    detail: `Recarga por QR #${depositado.id} de ${montoNum} soles (external ${qr.externalReference})`,
  });

  const ttlMs = config.recargaQrTtlMinutos * 60 * 1000;
  return {
    referencia: depositado.id,
    monto: montoNum,
    inStoreOrderId: qr.inStoreOrderId,
    qrData: qr.qrData,
    estado: YapeDepositRepository.STATES.PENDIENTE,
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    ttlMs,
  };
}

/**
 * Acredita una recarga cuando Mercado Pago confirma el pago (webhook).
 * @param {object} input {externalReference, amount, paymentId}
 * @returns {object} {estado, referencia?, saldo?}
 */
export async function acreditarRecargaQr({ externalReference, amount, paymentId }) {
  const depositado = await YapeDepositRepository.findByExternalRef(externalReference);
  if (!depositado) {
    throw new NotFoundError(`Recarga no encontrada (${externalReference})`);
  }
  if (depositado.state !== YapeDepositRepository.STATES.PENDIENTE) {
    // Idempotente: el pago ya fue procesado
    return { estado: depositado.state, referencia: depositado.id };
  }

  // Tope de vigencia del QR: si pasaron más de recargaQrTtlMinutos, se deshace
  const ttlMs = config.recargaQrTtlMinutos * 60 * 1000;
  if (Date.now() - new Date(depositado.createdAt).getTime() > ttlMs) {
    await YapeDepositRepository.resolver(depositado.id, YapeDepositRepository.STATES.RECHAZADO, null);
    throw new BusinessRuleViolationError('La recarga expiró (más de 2 minutos). Genera un nuevo QR');
  }

  if (Math.abs(Number(depositado.amount) - Number(amount)) > 0.01) {
    throw new BusinessRuleViolationError(
      `El monto pagado (${amount}) no coincide con la recarga solicitada (${depositado.amount})`
    );
  }

  // Topes diarios vigentes al momento de acreditar
  const cuenta = await AccountRepository.findById(depositado.accountId);
  if (!cuenta) throw new NotFoundError('Cuenta del cliente no encontrada');
  cuenta.ensureOperativa();
  cuenta.validarMonto(depositado.amount);

  const inicioDelDia = new Date();
  inicioDelDia.setHours(0, 0, 0, 0);
  const acreditadoHoy = await YapeDepositRepository.sumAcreditadosDesde(cuenta.id, inicioDelDia.toISOString());
  if (acreditadoHoy + depositado.amount > config.yapeDailyLimit) {
    // Sin poder acreditar, se rechaza y el dinero queda en el MP del banco
    await YapeDepositRepository.resolver(depositado.id, YapeDepositRepository.STATES.RECHAZADO, null);
    throw new BusinessRuleViolationError(
      `Acreditar superaría el tope diario de ${config.yapeDailyLimit} soles. El pago fue rechazado`
    );
  }

  cuenta.depositar(depositado.amount);
  await AccountRepository.update(cuenta);

  await TransactionRepository.insert(new Transaction({
    accountId: cuenta.id,
    type: TRANSACTION_TYPES.DEPOSITO_YAPE,
    amount: depositado.amount,
    description: `Recarga QR Mercado Pago (ref. #${depositado.id}, pago ${paymentId})`,
  }));

  const resuelto = await YapeDepositRepository.resolver(depositado.id, YapeDepositRepository.STATES.ACREDITADO, null);

  await AuditRepository.log({
    actorId: depositado.userId,
    action: 'RECARGA_QR_ACREDITADA',
    detail: `Recarga por QR #${depositado.id} de ${depositado.amount} soles acreditada automáticamente (pago MP ${paymentId})`,
  });

  return { estado: resuelto.state, referencia: depositado.id, saldo: cuenta.balance };
}

/**
 * Expira (deshace) una recarga QR pendiente del propio usuario.
 * Usado por el temporizador del frontend cuando pasan los 2 minutos.
 * @param {object} input {userId, depositId}
 * @returns {object} {estado, referencia}
 */
export async function expirarRecargaQr({ userId, depositId }) {
  const depositado = await YapeDepositRepository.findById(Number(depositId));
  if (!depositado) throw new NotFoundError('Recarga no encontrada');
  if (depositado.userId !== Number(userId)) throw new ForbiddenError('No autorizado');
  if (depositado.state !== YapeDepositRepository.STATES.PENDIENTE) {
    return { estado: depositado.state, referencia: depositado.id };
  }
  const resuelto = await YapeDepositRepository.resolver(
    depositado.id,
    YapeDepositRepository.STATES.RECHAZADO,
    null
  );
  await AuditRepository.log({
    actorId: userId,
    action: 'RECARGA_QR_EXPIRADA',
    detail: `Recarga por QR #${depositado.id} expirada manualmente por el usuario`,
  });
  return { estado: resuelto.state, referencia: depositado.id };
}