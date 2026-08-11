/**
 * OmniCash - Aplicación
 * Caso de uso: Verificar el correo del cliente con su código OTP.
 * Es el paso que ACTIVA la cuenta bancaria: recién aquí se genera
 * la CCI de 20 dígitos con dígitos de verificación.
 */

import { NotFoundError, BusinessRuleViolationError, ForbiddenError } from '../../domain/errors/DomainError.js';
import { UserRepository } from '../../infrastructure/repositories/UserRepository.js';
import { AccountRepository } from '../../infrastructure/repositories/AccountRepository.js';
import { VerificationCodeRepository } from '../../infrastructure/repositories/VerificationCodeRepository.js';
import { AuditRepository } from '../../infrastructure/repositories/AuditRepository.js';
import { Account } from '../../domain/entities/Account.js';
import { verificarCodigo, codigoVigente, OTP_MAX_ATTEMPTS } from '../../infrastructure/security/otp.js';

/**
 * Verifica el código enviado al correo.
 * @param {object} input {email, codigo}
 * @returns {object} {verificado: true, usuario, cuenta}
 */
export async function verificarEmail({ email, codigo }) {
  const emailNormalizado = String(email ?? '').trim().toLowerCase();
  const fila = await VerificationCodeRepository.findLatest(emailNormalizado, 'EMAIL_VERIFY');

  if (!codigoVigente(fila)) {
    throw new ForbiddenError(
      fila && fila.attempts >= OTP_MAX_ATTEMPTS
        ? 'Demasiados intentos. Solicita un código nuevo'
        : 'El código expiró o ya fue usado. Solicita uno nuevo'
    );
  }

  // Intento fallido se cuenta para proteger contra fuerza bruta del código
  if (!verificarCodigo(String(codigo ?? ''), fila.code_hash)) {
    await VerificationCodeRepository.registrarIntento(fila.id);
    throw new BusinessRuleViolationError('El código ingresado es incorrecto');
  }

  const usuario = await UserRepository.findByEmail(emailNormalizado);
  if (!usuario) {
    throw new NotFoundError('Usuario no encontrado');
  }

  // Marca el código usado y verifica el correo
  await VerificationCodeRepository.marcarUsado(fila.id);
  await VerificationCodeRepository.invalidarActivos(emailNormalizado, 'EMAIL_VERIFY');
  usuario.marcarEmailVerificado();
  await UserRepository.update(usuario);

  // Apertura definitiva de la cuenta bancaria (solo para clientes)
  const cuentaExistente = await AccountRepository.findByUserId(usuario.id);
  let cuenta = cuentaExistente;
  if (!cuentaExistente && usuario.isCliente) {
    let cci;
    do {
      cci = Account.generarCci();
    } while (await AccountRepository.findByCci(cci));
    cuenta = await AccountRepository.insert(new Account({ userId: usuario.id, cci, balance: 0 }));
  }

  await AuditRepository.log({
    actorId: usuario.id,
    action: 'EMAIL_VERIFICADO',
    detail: `Correo verificado y cuenta activada: ${emailNormalizado}`,
  });

  return {
    verificado: true,
    usuario: usuario.toPublicJSON(),
    cuenta: cuenta ? { cci: cuenta.cci, balance: cuenta.balance, state: cuenta.state } : null,
  };
}