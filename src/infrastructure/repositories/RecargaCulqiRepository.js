/**
 * OmniCash - Infraestructura
 * Repositorio de recargas por Yape vía Culqi (billeteras móviles).
 * La recarga nace PENDIENTE (orden Culqi creada) y se ACREDITA o RECHAZA
 * cuando Culqi confirma el pago por webhook. Métodos ASÍNCRONOS.
 */

import { getDb } from '../database/connection.js';

function conAlias(fila) {
  if (!fila) return null;
  return {
    id: Number(fila.id),
    userId: Number(fila.user_id),
    accountId: Number(fila.account_id),
    amount: Number(fila.amount),
    culqiOrderId: fila.culqi_order_id ?? '',
    state: fila.state,
    confirmedAt: fila.confirmed_at,
    createdAt: fila.created_at,
  };
}

export const RecargaCulqiRepository = {
  STATES: Object.freeze({ PENDIENTE: 'PENDIENTE', ACREDITADO: 'ACREDITADO', RECHAZADO: 'RECHAZADO' }),

  /** Crea la recarga PENDIENTE (aún sin la orden de Culqi). */
  async insert({ userId, accountId, amount }) {
    const db = await getDb();
    const result = await db.prepare(`
      INSERT INTO recarga_culqi (user_id, account_id, amount, created_at)
      VALUES (?, ?, ?, ?)
    `).run(Number(userId), Number(accountId), amount, new Date().toISOString());
    const fila = await db.prepare('SELECT * FROM recarga_culqi WHERE id = ?').get(Number(result.lastInsertRowid));
    return conAlias(fila);
  },

  /** Guarda el id de la orden de Culqi tras crearla. */
  async guardarOrderId(id, orderId) {
    const db = await getDb();
    await db.prepare('UPDATE recarga_culqi SET culqi_order_id = ? WHERE id = ?').run(orderId, Number(id));
    return this.findById(id);
  },

  /** Busca por el id de la orden Culqi (webhook). */
  async findByOrderId(orderId) {
    const db = await getDb();
    const fila = await db.prepare('SELECT * FROM recarga_culqi WHERE culqi_order_id = ?').get(orderId);
    return conAlias(fila);
  },

  async findById(id) {
    const db = await getDb();
    const fila = await db.prepare('SELECT * FROM recarga_culqi WHERE id = ?').get(Number(id));
    return conAlias(fila);
  },

  /** ¿El usuario tiene una recarga sin resolver? (una a la vez) */
  async countPendientes(userId) {
    const db = await getDb();
    const fila = await db.prepare(`
      SELECT COUNT(*) AS n FROM recarga_culqi WHERE user_id = ? AND state = 'PENDIENTE'
    `).get(Number(userId));
    return Number(fila.n);
  },

  /** Marca RECHAZADO las recargas PENDIENTE más antiguas que ttlMs. */
  async expirarVencidos(userId, ttlMs) {
    const db = await getDb();
    const filas = await db.prepare(
      `SELECT * FROM recarga_culqi WHERE user_id = ? AND state = 'PENDIENTE'`
    ).all(Number(userId));
    const ahora = Date.now();
    for (const f of filas) {
      if (ahora - new Date(f.created_at).getTime() > ttlMs) {
        await db.prepare(
          `UPDATE recarga_culqi SET state = 'RECHAZADO', confirmed_at = ? WHERE id = ?`
        ).run(new Date().toISOString(), f.id);
      }
    }
  },

  /** Suma de monto ACREDITADO desde una fecha (tope diario). */
  async sumAcreditadosDesde(accountId, desde) {
    const db = await getDb();
    const fila = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total FROM recarga_culqi
      WHERE account_id = ? AND state = 'ACREDITADO' AND created_at > ?
    `).get(Number(accountId), desde);
    return Number(fila.total);
  },

  /** Resuelve la recarga (ACREDITADO o RECHAZADO). */
  async resolver(id, state) {
    const db = await getDb();
    await db.prepare(`
      UPDATE recarga_culqi SET state = ?, confirmed_at = ? WHERE id = ?
    `).run(state, new Date().toISOString(), Number(id));
    return this.findById(id);
  },
};
