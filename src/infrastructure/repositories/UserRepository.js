/**
 * OmniCash - Infraestructura
 * Repositorio de Usuarios: guarda y recupera usuarios de la base de datos
 * (SQLite en desarrollo, PostgreSQL en producción).
 * Todos los métodos son ASÍNCRONOS por compatibilidad con el driver
 * de PostgreSQL; la capa de aplicación siempre los llama con await.
 */

import { getDb } from '../database/connection.js';
import { User } from '../../domain/entities/User.js';
import { NotFoundError } from '../../domain/errors/DomainError.js';

/** Mapea una fila SQL a una entidad de dominio User */
function mapToEntity(row) {
  if (!row) return null;
  return new User({
    id: Number(row.id),
    name: row.name,
    apellidoPaterno: row.apellido_paterno,
    apellidoMaterno: row.apellido_materno,
    nombres: row.nombres,
    direccion: row.direccion,
    email: row.email,
    backupEmail: row.backup_email,
    dni: row.dni,
    phone: row.phone,
    whatsapp: row.whatsapp,
    passwordHash: row.password_hash,
    role: row.role,
    state: row.state,
    emailVerified: Boolean(row.email_verified),
    totpSecret: row.totp_secret,
    totpEnabled: Boolean(row.totp_enabled),
    loginAttempts: Number(row.login_attempts),
    blockedUntil: row.blocked_until,
    createdAt: row.created_at,
  });
}

export const UserRepository = {
  /** Busca un usuario por su correo electrónico (recuperación de cuenta). */
  async findByEmail(email) {
    const db = await getDb();
    const row = await db.prepare('SELECT * FROM users WHERE email = ? ORDER BY id ASC').get(email);
    return mapToEntity(row);
  },

  /** Devuelve TODAS las cuentas con un correo (varias cuentas pueden compartir correo). */
  async findAllByEmail(email) {
    const db = await getDb();
    const rows = await db.prepare('SELECT * FROM users WHERE email = ? ORDER BY id ASC').all(email);
    return rows.map(mapToEntity);
  },

  /** Cuenta cuántas cuentas usan un correo (límite de 3 por correo). */
  async countByEmail(email) {
    const db = await getDb();
    const row = await db.prepare('SELECT COUNT(*) AS n FROM users WHERE email = ?').get(email);
    return Number(row.n);
  },

  /** Busca un usuario por su ID. */
  async findById(id) {
    const db = await getDb();
    const row = await db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id));
    return mapToEntity(row);
  },

  /** Inserta un usuario nuevo en la base de datos. */
  async insert(user) {
    const db = await getDb();
    const result = await db.prepare(`
      INSERT INTO users (name, apellido_paterno, apellido_materno, nombres, direccion, email, backup_email, dni, phone, whatsapp, password_hash, role, state, email_verified, totp_secret, totp_enabled, login_attempts, blocked_until, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.fullName, user.apellidoPaterno ?? '', user.apellidoMaterno ?? '', user.nombres ?? '',
      user.direccion ?? '', user.email, user.backupEmail ?? '', user.dni ?? '', user.phone ?? '',
      user.whatsapp ?? '', user.passwordHash, user.role, user.state,
      user.emailVerified ? 1 : 0, user.totpSecret, user.totpEnabled ? 1 : 0,
      user.loginAttempts, user.blockedUntil, user.createdAt
    );
    return this.findById(Number(result.lastInsertRowid));
  },

  /** Actualiza los campos mutables de un usuario. */
  async update(user) {
    const db = await getDb();
    await db.prepare(`
      UPDATE users SET name = ?, apellido_paterno = ?, apellido_materno = ?, nombres = ?, direccion = ?,
        email = ?, backup_email = ?, dni = ?, phone = ?, whatsapp = ?, state = ?, role = ?,
        email_verified = ?, totp_secret = ?, totp_enabled = ?,
        login_attempts = ?, blocked_until = ?
      WHERE id = ?
    `).run(
      user.fullName, user.apellidoPaterno, user.apellidoMaterno, user.nombres, user.direccion,
      user.email, user.backupEmail ?? '', user.dni, user.phone, user.whatsapp ?? '',
      user.state, user.role,
      user.emailVerified ? 1 : 0, user.totpSecret, user.totpEnabled ? 1 : 0,
      user.loginAttempts, user.blockedUntil, Number(user.id)
    );
  },

  /** Busca un usuario por su DNI (recuperación de cuenta, regla RENIEC). */
  async findByDni(dni) {
    const db = await getDb();
    const row = await db.prepare('SELECT * FROM users WHERE dni = ?').get(dni);
    return mapToEntity(row);
  },

  /** Cambia la contraseña de un usuario. */
  async cambiarContrasena(id, nuevoHash) {
    const db = await getDb();
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(nuevoHash, Number(id));
  },

  /** Reinicia el contador de intentos fallidos y el bloqueo temporal. */
  async reiniciarIntentosFallidos(id) {
    const db = await getDb();
    await db.prepare('UPDATE users SET login_attempts = 0, blocked_until = NULL WHERE id = ?').run(Number(id));
  },

  /**
   * Cuenta las CUENTAS DE CLIENTE creadas con un DNI (máximo 2 por persona).
   * Las cuentas de administradores y trabajadores NO cuentan: son personal
   * del banco, no clientes.
   */
  async countByDni(dni) {
    const db = await getDb();
    const row = await db.prepare('SELECT COUNT(*) AS n FROM users WHERE dni = ? AND role = ?').get(dni, 'CLIENTE');
    return Number(row.n);
  },

  /** Lista usuarios con paginación (para paneles de administración). */
  async findAll({ limit = 100, offset = 0, role = null } = {}) {
    const db = await getDb();
    if (role) {
      const rows = await db.prepare(
        'SELECT * FROM users WHERE role = ? ORDER BY id DESC LIMIT ? OFFSET ?'
      ).all(role, limit, offset);
      return rows.map(mapToEntity);
    }
    const rows = await db.prepare(
      'SELECT * FROM users ORDER BY id DESC LIMIT ? OFFSET ?'
    ).all(limit, offset);
    return rows.map(mapToEntity);
  },

  /** Cuenta usuarios totales (métricas del dashboard admin). */
  async count(role = null) {
    const db = await getDb();
    if (role) {
      const row = await db.prepare('SELECT COUNT(*) AS n FROM users WHERE role = ?').get(role);
      return Number(row.n);
    }
    const row = await db.prepare('SELECT COUNT(*) AS n FROM users').get();
    return Number(row.n);
  },

  /** Elimina un usuario y sus datos asociados (solo admin supremo). */
  async remove(id) {
    const db = await getDb();
    await db.prepare('DELETE FROM users WHERE id = ?').run(Number(id));
  },
};

/** Para reunir con cuenta dentro del mismo módulo sin dependencia circular */
export async function ensureUserExists(id) {
  const db = await getDb();
  const row = await db.prepare('SELECT id FROM users WHERE id = ?').get(Number(id));
  if (!row) {
    throw new NotFoundError('Usuario no encontrado');
  }
}