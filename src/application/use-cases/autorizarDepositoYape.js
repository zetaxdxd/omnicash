/**
 * OmniCash - Aplicación
 * Caso de uso: Autorizar la resolución de un depósito Yape (paso 1).
 *
 * El administrador debe demostrar que es él: contraseña + código OTP
 * enviado a su correo. Este caso valida la contraseña y emite el código.
 */

import { NotFoundError, BusinessRuleViolationError, ForbiddenError } from '../../domain/errors/DomainError.js';
import { UserRepository } from '../../infrastructure/repositories/UserRepository.js';
import { YapeDepositRepository } from '../../infrastructure/repositories/YapeDepositRepository.js';
import { VerificationCodeRepository } from '../../infrastructure/repositories/VerificationCodeRepository.js';
import { PasswordService } from '../../infrastructure/security/password.js';
import { generarCodigoOtp, hashearCodigo, OTP_TTL_MS } from '../../infrastructure/security/otp.js';
import { enviarCodigoConfirmacionYape } from '../../infrastructure/email/emailUsuarios.js';

/** Propósito del código: confirmación bancaria de depósitos Yape */
export const YAPE_CONFIRM_PURPOSE = 'YAPE_CONFIRM';
/** Máximo de códigos de confirmación emitidos seguidos (anti abuso) */
const MAX_AUTORIZACIONES = 5;

/**
 * Paso 1: valida la contraseña del admin y envía el OTP a su correo.
 * @param {object} input {adminUserId, depositId, password}
 * @returns {object} {requiereCodigo: true, correo, referencia}
 */
export async function autorizarDepositoYape({ adminUserId, depositId, password }) {
  const admin = await UserRepository.findById(adminUserId);
  const depositado = await YapeDepositRepository.findById(Number(depositId));

  if (!admin) throw new NotFoundError('Administrador no encontrado');
  if (!depositado) throw new NotFoundError('Depósito Yape no encontrado');
  if (depositado.state !== YapeDepositRepository.STATES.PENDIENTE) {
    throw new BusinessRuleViolationError('Este depósito ya fue resuelto');
  }
  if (!await PasswordService.verify(String(password ?? ''), admin.passwordHash)) {
    throw new ForbiddenError('Contraseña incorrecta');
  }

  // Entrega un código nuevo (invalida los anteriores del mismo propósito)
  const activos = await VerificationCodeRepository.countActivos(admin.email, YAPE_CONFIRM_PURPOSE);
  if (activos >= MAX_AUTORIZACIONES) {
    throw new BusinessRuleViolationError('Demasiadas confirmaciones en curso. Espera unos minutos');
  }
  await VerificationCodeRepository.invalidarActivos(admin.email, YAPE_CONFIRM_PURPOSE);

  const codigo = generarCodigoOtp();
  const { hash, salt } = hashearCodigo(codigo);
  const expira = new Date(Date.now() + OTP_TTL_MS).toISOString();
  await VerificationCodeRepository.insert({
    email: admin.email,
    purpose: YAPE_CONFIRM_PURPOSE,
    codeHash: `${salt}:${hash}`,
    expiresAt: expira,
  });

  await enviarCodigoConfirmacionYape(admin.email, { codigo, referencia: depositado.id, monto: depositado.amount });

  return {
    requiereCodigo: true,
    correo: admin.email,
    referencia: depositado.id,
    monto: depositado.amount,
  };
}