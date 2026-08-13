/**
 * OmniCash - Infraestructura
 * Repositorio de Sesiones: persistencia de tokens opacos de sesión.
 * Solo se almacena el hash SHA-256 del token (nunca el token en claro).
 * Métodos ASÍNCRONOS.
 */

import { getDb } from '../database/connection.js';
import { hashToken } from '../security/sessions.js';
import { SESSION_TTL_MS } from '../config.js';

/** Mapea una fila SQL a un objeto de sesión */
function mapToEntity(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    tokenHash: row.token_hash,
    purpose: row.purpose,
    userAgent: row.user_agent,
    ip: row.ip,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    usedAt: row.used_at,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
  };
}

export const SessionRepository = {
  /** Crea una sesión nueva a partir de un token en claro (se guarda su hash). */
  async insert({ token, userId, purpose = 'LOGIN', userAgent = null, ip = null, expiresAt }) {
    const db = await getDb();
    const result = await db.prepare(`
      INSERT INTO sessions (user_id, token_hash, purpose, user_agent, ip, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(Number(userId), hashToken(token), purpose, userAgent, ip, expiresAt, new Date().toISOString());
    return this.findById(Number(result.lastInsertRowid));
  },

  /** Busca una sesión activa por su token en claro (por el hash). */
  async findByToken(token) {
    const db = await getDb();
    const row = await db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(hashToken(token));
    return mapToEntity(row);
  },

  /** Busca una sesión por su ID (para revocación). */
  async findById(id) {
    const db = await getDb();
    const row = await db.prepare('SELECT * FROM sessions WHERE id = ?').get(Number(id));
    return mapToEntity(row);
  },

  /** Lista sesiones activas de un usuario (dashboard de seguridad). */
  async findActivasByUser(userId) {
    const db = await getDb();
    const rows = await db.prepare(`
      SELECT * FROM sessions
      WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
      ORDER BY created_at DESC
    `).all(Number(userId), new Date().toISOString());
    return rows.map(mapToEntity);
  },

  /** Revoca una sesión por su ID (si pertenece al usuario). */
  async revoke(id, userId) {
    const db = await getDb();
    const result = await db.prepare(`
      UPDATE sessions SET revoked_at = ?
      WHERE id = ? AND user_id = ? AND revoked_at IS NULL
    `).run(new Date().toISOString(), Number(id), Number(userId));
    return result.changes > 0;
  },

  /** Revoca todas las sesiones de un usuario, opcionalmente exceptuando una. */
  async revokeAll(userId, exceptoId = null) {
    const db = await getDb();
    if (exceptoId) {
      await db.prepare(`
        UPDATE sessions SET revoked_at = ?
        WHERE user_id = ? AND id != ? AND revoked_at IS NULL
      `).run(new Date().toISOString(), Number(userId), Number(exceptoId));
    } else {
      await db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
        .run(new Date().toISOString(), Number(userId));
    }
  },

  /** Marca una sesión como usada (tokens temporales de un solo uso). */
  async markUsed(id) {
    const db = await getDb();
    await db.prepare('UPDATE sessions SET used_at = ? WHERE id = ?')
      .run(new Date().toISOString(), Number(id));
  },

  /**
   * Actualiza la última actividad de una sesión y RENUEVA su vencimiento
   * (expiración deslizante).
   */
  async touch(id) {
    const db = await getDb();
    const vence = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await db.prepare('UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE id = ?')
      .run(new Date().toISOString(), vence, Number(id));
  },

  /** Elimina sesiones expiradas o revocadas (limpieza periódica). */
  async limpiarVencidas() {
    const db = await getDb();
    await db.prepare('DELETE FROM sessions WHERE expires_at < ? OR revoked_at IS NOT NULL')
      .run(new Date().toISOString());
  },

  /** Elimina TODAS las sesiones de un usuario (al borrar la cuenta). */
  async eliminarPorUsuario(userId) {
    const db = await getDb();
    await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(Number(userId));
  },
};