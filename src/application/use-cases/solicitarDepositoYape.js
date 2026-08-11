/**
 * OmniCash - Aplicación
 * Caso de uso: Solicitar depósito por Yape (dinero real).
 *
 * El cliente pide cargar créditos: la app le indica a qué número Yape
 * del banco debe enviar el dinero (YAPE_MERCHANT_PHONE) y cuánto.
 * La solicitud queda PENDIENTE hasta que el administrador confirme
 * (en su Yape llegó el dinero) y la ACREDITE con contraseña + OTP.
 *
 * 1 sol Yape = 1 crédito. Topes: máximo por operación y acumulado diario.
 */

import { AccountRepository } from '../../infrastructure/repositories/AccountRepository.js';
import { YapeDepositRepository } from '../../infrastructure/repositories/YapeDepositRepository.js';
import { AuditRepository } from '../../infrastructure/repositories/AuditRepository.js';
import { BusinessRuleViolationError } from '../../domain/errors/DomainError.js';
import { config } from '../../infrastructure/config.js';

/**
 * @param {object} input {userId, monto, payerPhone, operacion}
 * @returns {object} {referencia, monto, yapeCelular, yapeNombre, mensaje}
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

  // 1. Solo una solicitud pendiente a la vez (evita spam y confusiones)
  if (await YapeDepositRepository.countPendientes(userId) > 0) {
    throw new BusinessRuleViolationError(
      'Ya tienes una solicitud pendiente de confirmación. Espera a que se confirme o rechace'
    );
  }

  // 2. Tope por operación
  if (montoNum > config.yapeMaxAmount) {
    throw new BusinessRuleViolationError(
      `El monto máximo por depósito Yape es de ${config.yapeMaxAmount} soles`
    );
  }

  // 3. Tope diario acumulado (solo lo ya acreditado: lo pendiente aún no es dinero real)
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

  await AuditRepository.log({
    actorId: userId,
    action: 'YAPE_SOLICITADO',
    detail: `Solicitud de depósito Yape #${depositado.id} por ${montoNum} soles a la cuenta ${cuenta.cci}`,
  });

  return {
    referencia: depositado.id,
    monto: montoNum,
    yapeCelular: config.yapeMerchantPhone,
    yapeNombre: config.yapeMerchantName,
    estado: YapeDepositRepository.STATES.PENDIENTE,
    mensaje: `Envía ${montoNum} soles por Yape a ${config.yapeMerchantPhone} y guarda el código de aprobación que Yape te muestre`,
  };
}