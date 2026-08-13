/**
 * OmniCash - Aplicación
 * Caso de uso: Gestión de usuarios por el administrador.
 * Permite al admin supremo y a los trabajadores:
 * - Bloquear / desbloquear cuentas de clientes (seguridad).
 * - Crear trabajadores del banco.
 * - Eliminar usuarios (solo admin supremo, con protecciones).
 */

import { ROLES } from '../../domain/entities/User.js';
import { UserRepository } from '../../infrastructure/repositories/UserRepository.js';
import { AccountRepository } from '../../infrastructure/repositories/AccountRepository.js';
import { AuditRepository } from '../../infrastructure/repositories/AuditRepository.js';
import { PasswordService } from '../../infrastructure/security/password.js';
import { normalizarDni } from '../../infrastructure/security/peru.js';
import { consultarDni, identidadCoincide } from '../../infrastructure/reniec/consultaDni.js';
import { config } from '../../infrastructure/config.js';
import { User } from '../../domain/entities/User.js';
import { NotFoundError, ForbiddenError, BusinessRuleViolationError, ConflictError } from '../../domain/errors/DomainError.js';

/**
 * Bloquea o desbloquea la cuenta de un usuario.
 * @param {object} input {targetUserId, nuevoEstado, autorRole, autorId}
 * @returns {object} usuario actualizado
 */
export async function cambiarEstadoUsuario({ targetUserId, nuevoEstado, autorRole, autorId }) {
  // Solo admin puede bloquear/desbloquear a otros; trabajadores no gestionan estados
  if (autorRole !== ROLES.ADMIN) {
    throw new ForbiddenError('Solo el administrador puede bloquear o desbloquear cuentas');
  }

  const usuario = await UserRepository.findById(targetUserId);
  if (!usuario) throw new NotFoundError('Usuario no encontrado');

  // Protección: nadie puede autobloquearse ni bloquear al administrador supremo
  if (usuario.id === autorId) {
    throw new BusinessRuleViolationError('No puedes modificar tu propia cuenta');
  }
  if (usuario.isAdmin) {
    throw new ForbiddenError('No puedes modificar la cuenta del administrador supremo');
  }

  if (nuevoEstado === 'ACTIVO') usuario.desbloquear();
  else usuario.bloquear();

  await UserRepository.update(usuario);

  // Si se bloquea, se congela la cuenta bancaria asociada (inmoviliza fondos)
  const cuenta = await AccountRepository.findByUserId(usuario.id);
  if (cuenta) {
    if (nuevoEstado === 'ACTIVO') cuenta.descongelar();
    else cuenta.congelar();
    await AccountRepository.update(cuenta);
  }

  await AuditRepository.log({
    actorId: autorId,
    action: nuevoEstado === 'ACTIVO' ? 'DESBLOQUEO' : 'BLOQUEO',
    detail: `Usuario ${usuario.email} ${nuevoEstado === 'ACTIVO' ? 'desbloqueado' : 'bloqueado'}`,
  });

  return { usuario: usuario.toPublicJSON() };
}

/**
 * Crea un trabajador del banco (empleado con rol TRABAJADOR).
 * Solo el administrador supremo puede contratar personal.
 * El trabajador entrega DNI y datos KYC (contrastados con RENIEC),
 * para que el banco mantenga su expediente completo.
 * @param {object} input {name, email, password, whatsapp, dni, apellidoPaterno, apellidoMaterno, nombres, autorRole, autorId}
 * @returns {object} usuario creado
 */
export async function crearTrabajador({
  name, email, password, whatsapp = '',
  dni, apellidoPaterno, apellidoMaterno, nombres,
  autorRole, autorId,
}) {
  if (autorRole !== ROLES.ADMIN) {
    throw new ForbiddenError('Solo el administrador supremo puede crear trabajadores');
  }

  const emailNormalizado = String(email).trim().toLowerCase();
  // El correo NO es único: varias cuentas pueden compartirlo (el trabajador
  // suele usar el correo del banco). Se rechaza solo si ya hay 3+ cuentas.
  if (await UserRepository.countByEmail(emailNormalizado) >= config.maxCuentasPorCorreo) {
    throw new ConflictError(
      `Ese correo ya está en uso por ${config.maxCuentasPorCorreo} cuentas: no se permite crear más con el mismo correo`
    );
  }

  // Datos de identidad del trabajador (expediente KYC del banco)
  const paterno = String(apellidoPaterno ?? '').trim();
  const materno = String(apellidoMaterno ?? '').trim();
  const pila = String(nombres ?? '').trim();
  if (paterno.length < 2 || materno.length < 2 || pila.length < 2) {
    throw new BusinessRuleViolationError(
      'Completa los apellidos paterno, materno y nombres del trabajador (mínimo 2 letras cada uno)'
    );
  }

  // DNI con dígito verificador
  const dniNormalizado = normalizarDni(dni);
  if (!dniNormalizado) {
    throw new BusinessRuleViolationError('DNI inválido: debe tener 8 dígitos (ej: 73148217)');
  }

  // Contraste con RENIEC: el trabajador es una persona real del padrón
  const identidad = await consultarDni(dniNormalizado.slice(0, 8));
  if (identidad && !identidadCoincide(identidad, { nombres: pila, apellidoPaterno: paterno, apellidoMaterno: materno })) {
    throw new BusinessRuleViolationError(
      'Los datos del trabajador no coinciden con el registro oficial del DNI (RENIEC). Revisa el autocompletado'
    );
  }

  // WhatsApp de trabajo: acepta 9 dígitos (se agrega el 51 del Perú) o 51 + 9 dígitos
  let whatsappNormalizado = String(whatsapp ?? '').replace(/\D/g, '');
  if (whatsappNormalizado && /^9\d{8}$/.test(whatsappNormalizado)) {
    whatsappNormalizado = '51' + whatsappNormalizado;
  }

  const passwordHash = await PasswordService.hash(String(password));
  const usuario = new User({
    name: String(name).trim(),
    email: emailNormalizado,
    passwordHash,
    role: ROLES.TRABAJADOR,
    whatsapp: whatsappNormalizado,
    dni: dniNormalizado,
    apellidoPaterno: paterno,
    apellidoMaterno: materno,
    nombres: pila,
    // El trabajador es contratado por el banco con identidad validada
    // (RENIEC): su correo se considera verificado desde el inicio
    emailVerified: true,
  });
  const guardado = await UserRepository.insert(usuario);

  await AuditRepository.log({
    actorId: autorId,
    action: 'CREAR_TRABAJADOR',
    detail: `Nuevo trabajador: ${emailNormalizado} (DNI ${dniNormalizado})` + (identidad ? ' · identidad validada contra RENIEC' : ' · modo offline (sin RENIEC)'),
  });

  return { usuario: guardado.toPublicJSON() };
}

/**
 * Elimina permanentemente a un usuario (cliente o trabajador), su cuenta y sus movimientos.
 * Solo admin supremo. Protecciones: no eliminarse a sí mismo,
 * no eliminar al administrador supremo.
 * @param {object} input {targetUserId, autorRole, autorId}
 * @returns {object} {eliminado: true}
 */
export async function eliminarUsuario({ targetUserId, autorRole, autorId }) {
  if (autorRole !== ROLES.ADMIN) {
    throw new ForbiddenError('Solo el administrador supremo puede eliminar usuarios');
  }

  const usuario = await UserRepository.findById(targetUserId);
  if (!usuario) throw new NotFoundError('Usuario no encontrado');

  if (usuario.id === autorId) {
    throw new BusinessRuleViolationError('No puedes eliminar tu propia cuenta');
  }

  // El admin supremo puede eliminar tanto clientes como trabajadores
  if (usuario.isAdmin) {
    throw new ForbiddenError('No puedes eliminar la cuenta del administrador supremo');
  }

  const rolLegible = usuario.role === ROLES.TRABAJADOR ? 'Trabajador' : 'Cliente';

  await UserRepository.remove(targetUserId);

  await AuditRepository.log({
    actorId: autorId,
    action: 'ELIMINAR_USUARIO',
    detail: `${rolLegible} eliminado: ${usuario.email} (rol: ${usuario.role})`,
  });

  return { eliminado: true, email: usuario.email, rol: usuario.role };
}