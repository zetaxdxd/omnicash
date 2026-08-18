/**
 * OmniCash - Aplicación
 * Caso de uso: Recarga de dinero real con Yape vía Culqi (Billeteras móviles).
 *
 * El cliente escanea un QR con su app Yape (lo muestra Culqi Checkout a
 * partir de una Order). Culqi notifica el pago por webhook y el saldo se
 * acredita SOLO.
 *
 * 1 sol pagado = 1 crédito. Culqi exige monto S/6 - S/500 para billeteras.
 */

import { AccountRepository } from '../../infrastructure/repositories/AccountRepository.js';
import { RecargaCulqiRepository } from '../../infrastructure/repositories/RecargaCulqiRepository.js';
import { TransactionRepository } from '../../infrastructure/repositories/TransactionRepository.js';
import { AuditRepository } from '../../infrastructure/repositories/AuditRepository.js';
import { UserRepository } from '../../infrastructure/repositories/UserRepository.js';
import { NotFoundError, BusinessRuleViolationError, ForbiddenError } from '../../domain/errors/DomainError.js';
import { Transaction, TRANSACTION_TYPES } from '../../domain/entities/Transaction.js';
import { config } from '../../infrastructure/config.js';
import { crearOrdenYape, obtenerOrden } from '../../infrastructure/culqi/culqi.js';

// Límites de Culqi para billeteras móviles (Yape / Plin): S/6 - S/500
const CULQI_MIN = 6;
const CULQI_MAX = 500;

/**
 * @param {object} input {userId, monto}
 * @returns {object} {referencia, orderId, monto, estado, expiresAt, ttlMs}
 */
export async function solicitarRecargaCulqi({ userId, monto }) {
  const montoNum = Number(monto);

  if (!config.culqiSecretKey) {
    throw new BusinessRuleViolationError(
      'El banco aún no configura Culqi para recargas con Yape (CULQI_SECRET_KEY)'
    );
  }
  if (montoNum < CULQI_MIN || montoNum > CULQI_MAX) {
    throw new BusinessRuleViolationError(
      `Culqi (Yape) exige un monto entre S/ ${CULQI_MIN} y S/ ${CULQI_MAX}`
    );
  }

  const cuenta = await AccountRepository.findByUserId(userId);
  if (!cuenta) throw new BusinessRuleViolationError('No tienes una cuenta bancaria activa');
  cuenta.ensureOperativa();

  // 0. Expirar recargas pendientes vencidas del usuario (libera el cupo)
  await RecargaCulqiRepository.expirarVencidos(userId, config.culqiOrderTtlMinutos * 60 * 1000);

  // 1. Solo una recarga pendiente a la vez
  if (await RecargaCulqiRepository.countPendientes(userId) > 0) {
    throw new BusinessRuleViolationError('Ya tienes una recarga pendiente. Espera a que se confirme');
  }

  // 2. Tope por operación (config general del banco)
  if (montoNum > config.yapeMaxAmount) {
    throw new BusinessRuleViolationError(`El monto máximo por recarga es de ${config.yapeMaxAmount} soles`);
  }

  // 3. Tope diario acumulado
  const inicioDelDia = new Date();
  inicioDelDia.setHours(0, 0, 0, 0);
  const acreditadoHoy = await RecargaCulqiRepository.sumAcreditadosDesde(cuenta.id, inicioDelDia.toISOString());
  if (acreditadoHoy + montoNum > config.yapeDailyLimit) {
    throw new BusinessRuleViolationError(`Superas el tope diario de ${config.yapeDailyLimit} soles por recargas`);
  }

  const usuario = await UserRepository.findById(userId);
  const orderNumber = `OC-${Date.now()}-${userId}`;
  const ttlSec = config.culqiOrderTtlMinutos * 60;

  // 4. Registra la solicitud PENDIENTE y crea la orden en Culqi
  const registro = await RecargaCulqiRepository.insert({ userId, accountId: cuenta.id, amount: montoNum });

  let orden;
  try {
    orden = await crearOrdenYape({
      montoSoles: montoNum,
      descripcion: `Recarga OmniCash ${montoNum} S/`,
      orderNumber,
      cliente: {
        firstName: usuario?.name ?? 'Cliente',
        lastName: `${usuario?.apellido_paterno ?? ''} ${usuario?.apellido_materno ?? ''}`.trim(),
        email: usuario?.email ?? 'cliente@omnicash.pe',
        phone: usuario?.phone ?? '',
      },
      expirationDateSec: Math.floor(Date.now() / 1000) + ttlSec,
      metadata: { referencia: String(registro.id), userId: String(userId) },
    });
  } catch (error) {
    await RecargaCulqiRepository.resolver(registro.id, RecargaCulqiRepository.STATES.RECHAZADO);
    throw new BusinessRuleViolationError(`No se pudo crear la orden Culqi: ${error.message}`);
  }

  await RecargaCulqiRepository.guardarOrderId(registro.id, orden.id);

  await AuditRepository.log({
    actorId: userId,
    action: 'RECARGA_CULQI_SOLICITADA',
    detail: `Recarga Culqi #${registro.id} de ${montoNum} soles (orden ${orden.id})`,
  });

  const ttlMs = config.culqiOrderTtlMinutos * 60 * 1000;
  return {
    referencia: registro.id,
    orderId: orden.id,
    monto: montoNum,
    estado: RecargaCulqiRepository.STATES.PENDIENTE,
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    ttlMs,
  };
}

/**
 * Acredita una recarga cuando Culqi confirma el pago (webhook).
 * @param {object} input {culqiOrderId}
 * @returns {object} {estado, referencia?, saldo?}
 */
export async function acreditarRecargaCulqi({ culqiOrderId }) {
  const registro = await RecargaCulqiRepository.findByOrderId(culqiOrderId);
  if (!registro) throw new NotFoundError(`Recarga Culqi no encontrada (${culqiOrderId})`);
  if (registro.state !== RecargaCulqiRepository.STATES.PENDIENTE) {
    return { estado: registro.state, referencia: registro.id };
  }

  // Fuente de verdad: re-consultar la orden en Culqi
  const orden = await obtenerOrden(culqiOrderId);
  if (!orden || orden.state !== 'paid') {
    return { estado: registro.state, referencia: registro.id, pagada: false };
  }

  // Tope de vigencia: si pasó el TTL, se deshace
  const ttlMs = config.culqiOrderTtlMinutos * 60 * 1000;
  if (Date.now() - new Date(registro.createdAt).getTime() > ttlMs) {
    await RecargaCulqiRepository.resolver(registro.id, RecargaCulqiRepository.STATES.RECHAZADO);
    throw new BusinessRuleViolationError('La recarga Culqi expiró. Genera un nuevo QR');
  }

  const cuenta = await AccountRepository.findById(registro.accountId);
  if (!cuenta) throw new NotFoundError('Cuenta del cliente no encontrada');
  cuenta.ensureOperativa();

  const inicioDelDia = new Date();
  inicioDelDia.setHours(0, 0, 0, 0);
  const acreditadoHoy = await RecargaCulqiRepository.sumAcreditadosDesde(cuenta.id, inicioDelDia.toISOString());
  if (acreditadoHoy + registro.amount > config.yapeDailyLimit) {
    await RecargaCulqiRepository.resolver(registro.id, RecargaCulqiRepository.STATES.RECHAZADO);
    throw new BusinessRuleViolationError(`Acreditar superaría el tope diario de ${config.yapeDailyLimit} soles`);
  }

  cuenta.depositar(registro.amount);
  await AccountRepository.update(cuenta);

  await TransactionRepository.insert(new Transaction({
    accountId: cuenta.id,
    type: TRANSACTION_TYPES.DEPOSITO_YAPE,
    amount: registro.amount,
    description: `Recarga Yape (Culqi) ref. #${registro.id}, orden ${culqiOrderId}`,
  }));

  const resuelto = await RecargaCulqiRepository.resolver(registro.id, RecargaCulqiRepository.STATES.ACREDITADO);

  await AuditRepository.log({
    actorId: registro.userId,
    action: 'RECARGA_CULQI_ACREDITADA',
    detail: `Recarga Culqi #${registro.id} de ${registro.amount} soles acreditada (orden ${culqiOrderId})`,
  });

  return { estado: resuelto.state, referencia: registro.id, saldo: cuenta.balance };
}

/**
 * Expira (deshace) una recarga Culqi pendiente del propio usuario.
 * @param {object} input {userId, id}
 */
export async function expirarRecargaCulqi({ userId, id }) {
  const registro = await RecargaCulqiRepository.findById(Number(id));
  if (!registro) throw new NotFoundError('Recarga no encontrada');
  if (registro.userId !== Number(userId)) throw new ForbiddenError('No autorizado');
  if (registro.state !== RecargaCulqiRepository.STATES.PENDIENTE) {
    return { estado: registro.state, referencia: registro.id };
  }
  const resuelto = await RecargaCulqiRepository.resolver(registro.id, RecargaCulqiRepository.STATES.RECHAZADO);
  await AuditRepository.log({
    actorId: userId,
    action: 'RECARGA_CULQI_EXPIRADA',
    detail: `Recarga Culqi #${registro.id} expirada manualmente por el usuario`,
  });
  return { estado: resuelto.state, referencia: registro.id };
}
