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

  /** Filtra auditoría por tipo de acción. */
  async findByAction(action, limit = 100) {
    const db = await getDb();
    const rows = await db.prepare('SELECT * FROM audit_log WHERE action = ? ORDER BY id DESC LIMIT ?')
      .all(action, limit);
    return rows;
  },
};