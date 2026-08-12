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
 * @param {object} input {name, email, password, whatsapp, autorRole, autorId}
 * @returns {object} usuario creado
 */
export async function crearTrabajador({ name, email, password, whatsapp = '', autorRole, autorId }) {
  if (autorRole !== ROLES.ADMIN) {
    throw new ForbiddenError('Solo el administrador supremo puede crear trabajadores');
  }

  const emailNormalizado = String(email).trim().toLowerCase();
  if (await UserRepository.findByEmail(emailNormalizado)) {
    throw new ConflictError('Ya existe una cuenta con ese correo');
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
  });
  const guardado = await UserRepository.insert(usuario);

  await AuditRepository.log({
    actorId: autorId,
    action: 'CREAR_TRABAJADOR',
    detail: `Nuevo trabajador: ${emailNormalizado}`,
  });

  return { usuario: guardado.toPublicJSON() };
}

/**
 * Elimina permanentemente a un cliente, su cuenta y sus movimientos.
 * Solo admin supremo. Protecciones: no eliminarse a sí mismo,
 * no eliminar administradores ni trabajadores.
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
  if (usuario.isAdmin || usuario.isTrabajador) {
    throw new ForbiddenError('Solo puedes eliminar cuentas de clientes');
  }

  await UserRepository.remove(targetUserId);

  await AuditRepository.log({
    actorId: autorId,
    action: 'ELIMINAR_USUARIO',
    detail: `Cliente eliminado: ${usuario.email}`,
  });

  return { eliminado: true, email: usuario.email };
}