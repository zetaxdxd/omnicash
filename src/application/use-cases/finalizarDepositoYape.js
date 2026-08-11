/**
 * OmniCash - Aplicación
 * Caso de uso: Finalizar la resolución de un depósito Yape (paso 2).
 *
 * Valida el código OTP enviado al correo del administrador y resuelve
 * la solicitud: ACREDITAR (el dinero ya llegó al Yape del banco) o
 * RECHAZAR. Solo al acreditar se abona el saldo de la cuenta.
 */

import { NotFoundError, BusinessRuleViolationError, ForbiddenError } from '../../domain/errors/DomainError.js';
import { UserRepository } from '../../infrastructure/repositories/UserRepository.js';
import { AccountRepository } from '../../infrastructure/repositories/AccountRepository.js';
import { TransactionRepository } from '../../infrastructure/repositories/TransactionRepository.js';
import { AuditRepository } from '../../infrastructure/repositories/AuditRepository.js';
import { YapeDepositRepository } from '../../infrastructure/repositories/YapeDepositRepository.js';
import { VerificationCodeRepository } from '../../infrastructure/repositories/VerificationCodeRepository.js';
import { Transaction, TRANSACTION_TYPES } from '../../domain/entities/Transaction.js';
import { verificarCodigo, codigoVigente, OTP_MAX_ATTEMPTS } from '../../infrastructure/security/otp.js';
import { YAPE_CONFIRM_PURPOSE, } from './autorizarDepositoYape.js';
import { config } from '../../infrastructure/config.js';

/** Acciones de resolución posibles */
export const ACCIONES = Object.freeze({ ACREDITAR: 'ACREDITAR', RECHAZAR: 'RECHAZAR' });

/**
 * Paso 2: valida el OTP y resuelve el depósito.
 * @param {object} input {adminUserId, depositId, codigo, accion}
 * @returns {object} {estado, referencia, saldo?}
 */
export async function finalizarDepositoYape({ adminUserId, depositId, codigo, accion }) {
  const admin = await UserRepository.findById(adminUserId);
  const depositado = await YapeDepositRepository.findById(Number(depositId));

  if (!admin) throw new NotFoundError('Administrador no encontrado');
  if (!depositado) throw new NotFoundError('Depósito Yape no encontrado');
  if (depositado.state !== YapeDepositRepository.STATES.PENDIENTE) {
    throw new BusinessRuleViolationError('Este depósito ya fue resuelto');
  }
  if (![ACCIONES.ACREDITAR, ACCIONES.RECHAZAR].includes(accion)) {
    throw new BusinessRuleViolationError('Acción inválida');
  }

  // 1. Valida el código de confirmación (expiración, intentos, un solo uso)
  const fila = await VerificationCodeRepository.findLatest(admin.email, YAPE_CONFIRM_PURPOSE);
  if (!codigoVigente(fila)) {
    throw new ForbiddenError(
      fila && fila.attempts >= OTP_MAX_ATTEMPTS
        ? 'Demasiados intentos. Vuelve a iniciar la confirmación'
        : 'El código expiró o ya fue usado. Vuelve a iniciar la confirmación'
    );
  }
  if (!verificarCodigo(String(codigo ?? ''), fila.code_hash)) {
    await VerificationCodeRepository.registrarIntento(fila.id);
    throw new BusinessRuleViolationError('El código de confirmación es incorrecto');
  }
  await VerificationCodeRepository.marcarUsado(fila.id);
  await VerificationCodeRepository.invalidarActivos(admin.email, YAPE_CONFIRM_PURPOSE);

  // 2. Si es ACREDITAR: respeta de nuevo los topes y abona a la cuenta
  let saldo = null;
  if (accion === ACCIONES.ACREDITAR) {
    const cuenta = await AccountRepository.findById(depositado.accountId);
    if (!cuenta) throw new NotFoundError('Cuenta del cliente no encontrada');
    cuenta.ensureOperativa();
    cuenta.validarMonto(depositado.amount);

    const inicioDelDia = new Date();
    inicioDelDia.setHours(0, 0, 0, 0);
    const acreditadoHoy = await YapeDepositRepository.sumAcreditadosDesde(cuenta.id, inicioDelDia.toISOString());
    if (acreditadoHoy + depositado.amount > config.yapeDailyLimit) {
      throw new BusinessRuleViolationError(
        `Acreditar este depósito superaría el tope diario de ${config.yapeDailyLimit} soles`
      );
    }

    cuenta.depositar(depositado.amount);
    await AccountRepository.update(cuenta);

    await TransactionRepository.insert(new Transaction({
      accountId: cuenta.id,
      type: TRANSACTION_TYPES.DEPOSITO_YAPE,
      amount: depositado.amount,
      description: `Yape real confirmado (ref. #${depositado.id}, op. ${depositado.operacion || 'sin código'})`,
    }));
    saldo = cuenta.balance;
  }

  // 3. Resuelve la solicitud y audita
  const resuelto = await YapeDepositRepository.resolver(
    depositado.id,
    accion === ACCIONES.ACREDITAR
      ? YapeDepositRepository.STATES.ACREDITADO
      : YapeDepositRepository.STATES.RECHAZADO,
    adminUserId
  );

  await AuditRepository.log({
    actorId: adminUserId,
    action: accion === ACCIONES.ACREDITAR ? 'YAPE_ACREDITADO' : 'YAPE_RECHAZADO',
    detail: `${accion === ACCIONES.ACREDITAR ? 'Acreditado' : 'Rechazado'} depósito Yape #${depositado.id} de ${depositado.amount} soles`,
  });

  return {
    estado: resuelto.state,
    referencia: depositado.id,
    monto: depositado.amount,
    saldo,
  };
}