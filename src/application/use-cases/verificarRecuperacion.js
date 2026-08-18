/**
 * OmniCash - Aplicación
 * Caso de uso: Verificar el código OTP de recuperación (paso 1.5).
 *
 * Comprueba que el DNI + correo principal son correctos y que el código
 * enviado al correo es válido, SIN cambiar la contraseña todavía. Solo
 * después de este paso la interfaz muestra el campo de "nueva contraseña".
 * El código no se quema aquí (lo hace confirmarRecuperacion al fijar la clave).
 */

import { BusinessRuleViolationError, ForbiddenError } from '../../domain/errors/DomainError.js';
import { UserRepository } from '../../infrastructure/repositories/UserRepository.js';
import { VerificationCodeRepository } from '../../infrastructure/repositories/VerificationCodeRepository.js';
import { normalizarDni } from '../../infrastructure/security/peru.js';
import { verificarCodigo, codigoVigente, OTP_MAX_ATTEMPTS } from '../../infrastructure/security/otp.js';
import { PASSWORD_RECOVERY_PURPOSE } from './solicitarRecuperacion.js';

/**
 * @param {object} input {dni, email, codigo}
 * @returns {object} {verificado: true}
 */
export async function verificarRecuperacion({ dni, email, codigo }) {
  const dniNormalizado = normalizarDni(dni) ?? String(dni ?? '').trim();
  const emailNormalizado = String(email ?? '').trim().toLowerCase();

  // Respuesta genérica anti-enumeración
  const usuario = await UserRepository.findByDni(dniNormalizado);
  const errorGenerico = new ForbiddenError(
    'Si el DNI y el correo coinciden, puedes verificar tu código'
  );
  if (!usuario || usuario.email !== emailNormalizado) {
    throw errorGenerico;
  }

  const fila = await VerificationCodeRepository.findLatest(emailNormalizado, PASSWORD_RECOVERY_PURPOSE);
  if (!codigoVigente(fila)) {
    throw new ForbiddenError(
      fila && fila.attempts >= OTP_MAX_ATTEMPTS
        ? 'Demasiados intentos. Solicita un código nuevo'
        : 'El código expiró o ya fue usado. Solicita uno nuevo'
    );
  }
  if (!verificarCodigo(String(codigo ?? ''), fila.code_hash)) {
    await VerificationCodeRepository.registrarIntento(fila.id);
    throw new BusinessRuleViolationError('El código ingresado es incorrecto');
  }

  return { verificado: true };
}
