/**
 * OmniCash - Infraestructura
 * Repositorio de Auditoría: registro de acciones sensibles.
 * Cada operación importante (login, bloqueo, transferencia, retiro)
 * deja una traza inmutable. Métodos ASÍNCRONOS.
 */

import { getDb } from '../database/connection.js';

export const AuditRepository = {
  /** Registra una acción en el log de auditoría. */
  async log({ actorId = null, action, detail = '' }) {
    const db = await getDb();
    await db.prepare(`
      INSERT INTO audit_log (actor_id, action, detail, created_at)
      VALUES (?, ?, ?, ?)
    `).run(actorId ?? null, action, detail, new Date().toISOString());
  },

  /** Obtiene las últimas entradas del log de auditoría con el actor. */
  async recent(limit = 100) {
    const db = await getDb();
    const rows = await db.prepare(`
      SELECT a.*, u.name AS actor_name, u.email AS actor_email
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.actor_id
      ORDER BY a.id DESC
      LIMIT ?
    `).all(limit);
    return rows;
  },

  /** Obtiene las entradas del log de los últimos N días (historial del banco). */
  async recentDesde(dias, limit = 1000) {
    const db = await getDb();
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
    const rows = await db.prepare(`
      SELECT a.*, u.name AS actor_name, u.email AS actor_email
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.created_at >= ?
      ORDER BY a.id DESC
      LIMIT ?
    `).all(desde, limit);
    return rows;
  },

  /** Filtra auditoría por tipo de acción. */
  async findByAction(action, limit = 100) {
    const db = await getDb();
    const rows = await db.prepare('SELECT * FROM audit_log WHERE action = ? ORDER BY id DESC LIMIT ?')
      .all(action, limit);
    return rows;
  },
};