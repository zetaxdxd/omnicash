/**
 * OmniCash - Aplicación
 * Caso de uso: Solicitar depósito por Yape (dinero real).
 *
 * El cliente pide cargar créditos: la app le indica a qué número Yape
 * del banco debe enviar el dinero (YAPE_MERCHANT_PHONE) y cuánto.
 * El depósito se ACREDITA DE INMEDIATO (el cliente confirma con su propia
 * contraseña + OTP). El administrador NO aprueba: en producción habría
 * demasiadas operaciones para dar click una por una, así que el saldo
 * sube solo. El registro queda en auditoría para seguimiento.
 *
 * 1 sol Yape = 1 crédito. Topes: máximo por operación y acumulado diario.
 */

import { AccountRepository } from '../../infrastructure/repositories/AccountRepository.js';
import { YapeDepositRepository } from '../../infrastructure/repositories/YapeDepositRepository.js';
import { TransactionRepository } from '../../infrastructure/repositories/TransactionRepository.js';
import { AuditRepository } from '../../infrastructure/repositories/AuditRepository.js';
import { Transaction, TRANSACTION_TYPES } from '../../domain/entities/Transaction.js';
import { BusinessRuleViolationError } from '../../domain/errors/DomainError.js';
import { config } from '../../infrastructure/config.js';

/**
 * @param {object} input {userId, monto, payerPhone, operacion}
 * @returns {object} {referencia, monto, yapeCelular, yapeNombre, estado, saldo, mensaje}
 */
export async function solicitarDepositoYape({ userId, monto, payerPhone, operacion }) {
  const montoNum = Number(monto);

  if (!config.yapeMerchantPhone) {
    throw new BusinessRuleViolationError(
      'El banco aún no configura su número Yape para recibir dinero (YAPE_MERCHANT_PHONE)'
    );
  }

  const cuenta = await AccountRepository.findByUserId(userId);
  if (!cuenta) {
    throw new BusinessRuleViolationError('No tienes una cuenta bancaria activa');
  }
  cuenta.ensureOperativa();
  cuenta.validarMonto(montoNum);

  // 1. Solo una solicitud en curso a la vez (evita solapamientos)
  if (await YapeDepositRepository.countPendientes(userId) > 0) {
    throw new BusinessRuleViolationError(
      'Ya tienes una solicitud en curso. Espera a que se procese'
    );
  }

  // 2. Tope por operación
  if (montoNum > config.yapeMaxAmount) {
    throw new BusinessRuleViolationError(
      `El monto máximo por depósito Yape es de ${config.yapeMaxAmount} soles`
    );
  }

  // 3. Tope diario acumulado (lo ya acreditado)
  const inicioDelDia = new Date();
  inicioDelDia.setHours(0, 0, 0, 0);
  const acreditadoHoy = await YapeDepositRepository.sumAcreditadosDesde(cuenta.id, inicioDelDia.toISOString());
  if (acreditadoHoy + montoNum > config.yapeDailyLimit) {
    throw new BusinessRuleViolationError(
      `Superas el tope diario de ${config.yapeDailyLimit} soles por Yape`
    );
  }

  // 4. Datos de identificación del pago: el código de aprobación que Yape
  // muestra al cliente cuando completa el envío (como piden los bancos)
  const celular = String(payerPhone ?? '').replace(/\D/g, '');
  if (celular && !/^9\d{8}$/.test(celular)) {
    throw new BusinessRuleViolationError('El celular Yape debe tener 9 dígitos y empezar con 9');
  }
  const nroOperacion = String(operacion ?? '').trim();
  if (!nroOperacion) {
    throw new BusinessRuleViolationError('El código de aprobación es obligatorio');
  }
  if (nroOperacion.length < 4) {
    throw new BusinessRuleViolationError('El código de aprobación debe tener al menos 4 caracteres');
  }
  const aprobacion = nroOperacion.slice(0, 40);

  // 5. Registra la solicitud
  const depositado = await YapeDepositRepository.insert({
    userId,
    accountId: cuenta.id,
    amount: montoNum,
    payerPhone: celular,
    operacion: aprobacion,
  });

  // 6. Acreditación automática (sin aprobación del admin)
  const acreditadoHoy2 = await YapeDepositRepository.sumAcreditadosDesde(cuenta.id, inicioDelDia.toISOString());
  if (acreditadoHoy2 + montoNum > config.yapeDailyLimit) {
    await YapeDepositRepository.resolver(depositado.id, YapeDepositRepository.STATES.RECHAZADO, null);
    throw new BusinessRuleViolationError(
      `Acreditar superaría el tope diario de ${config.yapeDailyLimit} soles`
    );
  }

  cuenta.depositar(montoNum);
  await AccountRepository.update(cuenta);

  await TransactionRepository.insert(new Transaction({
    accountId: cuenta.id,
    type: TRANSACTION_TYPES.DEPOSITO_YAPE,
    amount: montoNum,
    description: `Yape real (ref. #${depositado.id}, op. ${aprobacion})`,
  }));

  const resuelto = await YapeDepositRepository.resolver(
    depositado.id,
    YapeDepositRepository.STATES.ACREDITADO,
    null
  );

  await AuditRepository.log({
    actorId: userId,
    action: 'YAPE_ACREDITADO',
    detail: `Depósito Yape #${depositado.id} de ${montoNum} soles acreditado automáticamente`,
  });

  return {
    referencia: depositado.id,
    monto: montoNum,
    yapeCelular: config.yapeMerchantPhone,
    yapeNombre: config.yapeMerchantName,
    estado: YapeDepositRepository.STATES.ACREDITADO,
    saldo: cuenta.balance,
    mensaje: `Envía ${montoNum} soles por Yape a ${config.yapeMerchantPhone}. Tu saldo ya fue acreditado`,
  };
}
