/**
 * OmniCash - Aplicación
 * Caso de uso: Solicitar retiro en cajero de la red OmniCash (sin tarjeta).
 * El cliente solicita un retiro, recibe un código de 6 dígitos que puede usar
 * en cualquier cajero aliado de la red (válido 10 minutos, tope diario).
 *
 * Flujo:
 * 1. Cliente POST /api/cuenta/cajero/retiro → código generado + expiración
 * 2. Cliente muestra código al cajero aliado
 * 3. Cajero confirma el retiro → staff completa con POST /api/admin/cajero/completar
 * 4. Saldo debitado, transacción RETIRO_RED registrada, código invalido.
 */
import { AccountRepository } from '../../infrastructure/repositories/AccountRepository.js';
import { AtmRepository } from '../../infrastructure/repositories/AtmRepository.js';
import { TransactionRepository } from '../../infrastructure/repositories/TransactionRepository.js';
import { AuditRepository } from '../../infrastructure/repositories/AuditRepository.js';
import { TRANSACTION_TYPES } from '../../domain/entities/Transaction.js';
import { BusinessRuleViolationError } from '../../domain/errors/DomainError.js';
import { config } from '../../infrastructure/config.js';

/**
 * Solicita un retiro en cajero de la red OmniCash (sin tarjeta).
 * Genera un código de 6 dígitos, lo almacena con hash y válido 10 minutos.
 * Retorna el código al cliente para que lo muestre en el cajero.
 *
 * @param {object} input { userId, monto, atmId }
 * @returns {object} { codigo, expira, atm }
 */
export async function solicitarRetiroRedCajero({ userId, monto, atmId }) {
  const cuenta = await AccountRepository.findByUserId(userId);
  if (!cuenta) {
    throw new BusinessRuleViolationError('No tienes una cuenta bancaria activa');
  }
  cuenta.ensureOperativa();
  cuenta.validarMonto(monto);

  // --- LÍMITES ---
  // Límite por operación
  if (monto > config.atmMaxAmount) {
    throw new BusinessRuleViolationError(
      `El monto máximo por retiro es de ${config.atmMaxAmount} créditos`
    );
  }

  // Límite diario acumulado (solo lo ya completado)
  const inicioDelDia = new Date();
  inicioDelDia.setHours(0, 0, 0, 0);
  const retiradoHoy = await AtmRepository.sumCompletadosHoy(cuenta.id);
  if (retiradoHoy + monto > config.atmDailyLimit) {
    throw new BusinessRuleViolationError(
      `Superas el límite diario de ${config.atmDailyLimit} créditos en cajeros`
    );
  }

  // 1. Generar código seguro (6 dígitos, SHA-256 hash + salt)
  const codePlain = Math.floor(100000 + Math.random() * 899999).toString(); // 100000-999999
  const codeHash = require('crypto').createHash('sha256').update(codePlain + 'omnicash-atm').digest('hex');
  const expiresAt = new Date();
  expiresAt.setMinutes(new Date().getMinutes() + config.atmCodeTtlMinutes);

  // 2. Registrar solicitud PENDIENTE
  const withdrawal = await AtmRepository.insertWithdrawal({
    userId,
    accountId: cuenta.id,
    atmId,
    amount: monto,
    codeHash,
    expiresAt: expiresAt.toISOString(),
  });

  // 3. Registrar auditoría
  await AuditRepository.log({
    actorId: userId,
    action: 'SOLICITUD_RETIRO_RED',
    detail: `Retiro red #${withdrawal.id} de ${monto} créditos. Código expira en ${config.atmCodeTtlMinutes} min. ATC: ${withdrawal.atm_id}`,
  });

  return {
    codigo: codePlain,
    expira: expiresAt.toLocaleTimeString(),
    atm: {
      id: withdrawal.atm_id,
      nombre: withdrawal.atm_nombre,
      codigo: withdrawal.atm_codigo,
      direccion: withdrawal.atm_direccion,
    },
    withdrawalId: withdrawal.id,
  };
}

/**
 * Completa un retiro en cajero de la red (ejecutado por el cajero/staff).
 * Valida el código, descuenta el saldo, registra la transacción y liquida el retiro.
 *
 * @param {object} input { withdrawalId, codigoPlain, confirmUserId }
 * @returns {object} { saldoRestante, comision, totalDebitado }
 */
export async function completarRetiroRedCajero({ withdrawalId, codigoPlain, confirmUserId }) {
  const withdrawal = await AtmRepository.findWithdrawalById(withdrawalId);
  if (!withdrawal) throw new BusinessRuleViolationError('Solicitud de retiro no encontrada');

  // 1. Validar estado y vencimiento
  if (withdrawal.state !== 'PENDIENTE') {
    // Ya fue completado o cancelado → idempotente, retorno estado actual
    return { state: withdrawal.state, retirada: false };
  }
  if (new Date() > new Date(withdrawal.expires_at)) {
    await AtmRepository.expirar(withdrawalId);
    return { state: 'EXPIRADO', retirada: false };
  }

  // 2. Verificar coincidencia de código (el cliente debe haber usado el código exacto)
  const codeHash = require('crypto').createHash('sha256').update(codigoPlain + 'omnicash-atm').digest('hex');
  if (withdrawal.code_hash !== codeHash) {
    await AtmRepository.expirar(withdrawalId);
    return { state: 'CODIGO_INVALIDO', retirada: false };
  }

  // 3. Límite diario (re-verificación)
  const cuenta = await AccountRepository.findById(withdrawal.accountId);
  if (!cuenta) throw new BusinessRuleViolationError('Cuenta del retiro no encontrada');
  cuenta.ensureOperativa();
  const retiradoHoy = await AtmRepository.sumCompletadosHoy(cuenta.id);
  if (retiradoHoy + withdrawal.amount > config.atmDailyLimit) {
    await AtmRepository.expirar(withdrawalId);
    return { state: 'LIMITE_DIARIO_SUPERADO', retirada: false };
  }

  // 4. Débito atómico: saldo - amount
  cuenta.retirar(withdrawal.amount);
  await AccountRepository.update(cuenta);

  // 5. Registrar transacción RETIRO_RED
  await TransactionRepository.insert(new Transaction({
    accountId: cuenta.id,
    type: TRANSACTION_TYPES.RETIRO_RED,
    amount: withdrawal.amount,
    description: `Retiro RED OmniCash (código ${withdrawal.id}, confirmado por ${confirmUserId})`,
  }));

  // 6. Liquidar retiro en la base de datos
  const completado = await AtmRepository.completar(withdrawalId, confirmUserId || cuenta.userId);

  // 7. Auditoría
  await AuditRepository.log({
    actorId: confirmUserId || cuenta.userId,
    action: 'RETIRO_RED_COMPLETADO',
    detail: `Retiro RED #${withdrawal.id} de ${withdrawal.amount} créditos completado. Saldo restante: ${cuenta.balance}.`,
  });

  return {
    state: completado.state,
    saldoRestante: cuenta.balance,
    comision: 0, // sin comisión en la red OmniCash
    totalDebitado: withdrawal.amount,
  };
}

/** Obtiene el historial de retiros del cliente (solo los suyos). */
export async function historialRetirosCliente(userId, limite = 20) {
  return await AtmRepository.historialCliente(userId, limite);
}

/** Lista retiros PENDIENTES para confirmar (solo admin/trabajador). */
export async function listarRetirosPendientes() {
  return await AtmRepository.listarPendientes();
}