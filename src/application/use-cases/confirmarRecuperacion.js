/**
 * OmniCash - Aplicación
 * Caso de uso: Confirmar recuperación de contraseña (paso 2).
 *
 * El cliente recibe el OTP en su CORREO PRINCIPAL (verificado en
 * solicitarRecuperacion y verificarRecuperacion). Si el código es válido,
 * se le permite elegir una nueva contraseña:
 * - Las sesiones en todos sus dispositivos se cierran.
 * - Si tenía intentos fallidos, se limpian para que pueda volver a entrar.
 * - Se le envía una alerta a su correo principal para saber que la
 *   contraseña cambió.
 */

import { ForbiddenError, BusinessRuleViolationError } from '../../domain/errors/DomainError.js';
import { UserRepository } from '../../infrastructure/repositories/UserRepository.js';
import { VerificationCodeRepository } from '../../infrastructure/repositories/VerificationCodeRepository.js';
import { SessionRepository } from '../../infrastructure/repositories/SessionRepository.js';
import { AuditRepository } from '../../infrastructure/repositories/AuditRepository.js';
import { PasswordService } from '../../infrastructure/security/password.js';
import { verificarCodigo, codigoVigente, OTP_MAX_ATTEMPTS } from '../../infrastructure/security/otp.js';
import { normalizarDni } from '../../infrastructure/security/peru.js';
import { enviarAlertaContrasenaCambiada } from '../../infrastructure/email/emailUsuarios.js';
import { PASSWORD_RECOVERY_PURPOSE } from './solicitarRecuperacion.js';

/**
 * Paso 2: valida el OTP del correo principal y aplica la nueva contraseña.
 * @param {object} input {dni, email, codigo, nuevaPassword}
 * @returns {object} {ok: true}
 */
export async function confirmarRecuperacion({ dni, email, codigo, nuevaPassword }) {
  const dniNormalizado = normalizarDni(dni) ?? String(dni ?? '').trim();
  const emailNormalizado = String(email ?? '').trim().toLowerCase();
  const claveNueva = String(nuevaPassword ?? '');

  const usuario = await UserRepository.findByDni(dniNormalizado);
  if (!usuario || usuario.email !== emailNormalizado) {
    throw new BusinessRuleViolationError(
      'No podemos verificar tus datos. Solicita el código nuevamente'
    );
  }

  // 1. El OTP debe haberse enviado al correo principal y estar vigente
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
  await VerificationCodeRepository.marcarUsado(fila.id);
  await VerificationCodeRepository.invalidarActivos(emailNormalizado, PASSWORD_RECOVERY_PURPOSE);

  // 2. La nueva contraseña debe cumplir la política de seguridad
  if (claveNueva.length === 0) {
    throw new BusinessRuleViolationError('Elige una contraseña nueva');
  }
  if (await PasswordService.verify(claveNueva, usuario.passwordHash)) {
    throw new BusinessRuleViolationError(
      'La contraseña nueva debe ser distinta a la anterior'
    );
  }

  // 3. Aplica el cambio: nueva contraseña, desbloqueo y cierre de sesiones
  const nuevoHash = await PasswordService.hash(claveNueva);
  await UserRepository.cambiarContrasena(usuario.id, nuevoHash);
  await UserRepository.reiniciarIntentosFallidos(usuario.id);
  await SessionRepository.revokeAll(usuario.id);

  await AuditRepository.log({
    actorId: usuario.id,
    action: 'CONTRASENA_RECUPERADA',
    detail: 'La contraseña fue restablecida mediante el código enviado al correo principal',
  });

  // 4. Alerta al correo principal
  await enviarAlertaContrasenaCambiada(usuario.email);

  return { ok: true };
}
