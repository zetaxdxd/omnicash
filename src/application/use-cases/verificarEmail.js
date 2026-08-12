/**
 * OmniCash - Aplicación
 * Caso de uso: Verificar el correo del cliente con su código OTP.
 *
 * Es el paso que ACTIVA la cuenta bancaria: recién aquí se CREA el usuario
 * (con los datos guardados en espera durante el registro) y se genera la
 * CCI de 20 dígitos con dígitos de verificación. Si el código no es
 * correcto, el usuario nunca llega a existir en la base de datos.
 */

import { NotFoundError, BusinessRuleViolationError, ForbiddenError } from '../../domain/errors/DomainError.js';
import { UserRepository } from '../../infrastructure/repositories/UserRepository.js';
import { AccountRepository } from '../../infrastructure/repositories/AccountRepository.js';
import { VerificationCodeRepository } from '../../infrastructure/repositories/VerificationCodeRepository.js';
import { PendingRegistrationRepository } from '../../infrastructure/repositories/PendingRegistrationRepository.js';
import { AuditRepository } from '../../infrastructure/repositories/AuditRepository.js';
import { User, ROLES } from '../../domain/entities/User.js';
import { Account } from '../../domain/entities/Account.js';
import { verificarCodigo, codigoVigente, OTP_MAX_ATTEMPTS } from '../../infrastructure/security/otp.js';

/**
 * Verifica el código enviado al correo y recién entonces crea el usuario
 * y su cuenta bancaria con los datos de la solicitud en espera.
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

  // El código es válido: recupera los datos de la solicitud en espera
  const pendiente = await PendingRegistrationRepository.findByEmail(emailNormalizado);
  if (!pendiente || new Date(pendiente.expiresAt) <= new Date()) {
    throw new ForbiddenError(
      'Tu solicitud de registro venció. Vuelve a llenar el formulario'
    );
  }
  const datos = pendiente.data;

  // Unicidad definitiva (por si acaso se registró con este correo en el ínterin)
  const existente = await UserRepository.findByEmail(emailNormalizado);
  if (existente) {
    throw new BusinessRuleViolationError('Ya existe una cuenta con este correo electrónico');
  }

  // Marca el código usado y CREA el usuario + su cuenta bancaria
  await VerificationCodeRepository.marcarUsado(fila.id);
  await VerificationCodeRepository.invalidarActivos(emailNormalizado, 'EMAIL_VERIFY');

  const usuario = new User({
    apellidoPaterno: datos.apellidoPaterno,
    apellidoMaterno: datos.apellidoMaterno,
    nombres: datos.nombres,
    direccion: datos.direccion,
    email: emailNormalizado,
    backupEmail: datos.backupEmail,
    dni: datos.dni,
    phone: datos.phone,
    passwordHash: datos.passwordHash,
    role: ROLES.CLIENTE,
    emailVerified: true,
  });
  const guardado = await UserRepository.insert(usuario);

  // Apertura definitiva de la cuenta bancaria (solo para clientes)
  let cuenta = null;
  if (usuario.isCliente) {
    let cci;
    do {
      cci = Account.generarCci();
    } while (await AccountRepository.findByCci(cci));
    cuenta = await AccountRepository.insert(new Account({ userId: guardado.id, cci, balance: 0 }));
  }

  // La solicitud en espera ya cumplió su función
  await PendingRegistrationRepository.eliminar(emailNormalizado);

  await AuditRepository.log({
    actorId: guardado.id,
    action: 'EMAIL_VERIFICADO',
    detail: `Correo verificado y cuenta activada: ${emailNormalizado}`,
  });

  return {
    verificado: true,
    usuario: guardado.toPublicJSON(),
    cuenta: cuenta ? { cci: cuenta.cci, balance: cuenta.balance, state: cuenta.state } : null,
  };
}
