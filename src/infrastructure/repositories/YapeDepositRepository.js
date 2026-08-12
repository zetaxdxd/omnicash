/**
 * OmniCash - Infraestructura
 * Repositorio de Depósitos por Yape (dinero real).
 * El depósito nace PENDIENTE (el cliente envió el Yape) y el administrador
 * lo ACREDITA o RECHAZA tras confirmar que el dinero llegó a su Yape.
 * Métodos ASÍNCRONOS.
 */

import { getDb } from '../database/connection.js';

/** Devuelve la fila con nombres legibles (para listados) */
function conAlias(fila) {
  if (!fila) return null;
  return {
    id: Number(fila.id),
    userId: Number(fila.user_id),
    accountId: Number(fila.account_id),
    amount: Number(fila.amount),
    payerPhone: fila.payer_phone,
    operacion: fila.operacion,
    externalRef: fila.external_ref ?? '',
    state: fila.state,
    confirmedBy: fila.confirmed_by ? Number(fila.confirmed_by) : null,
    confirmedAt: fila.confirmed_at,
    createdAt: fila.created_at,
    // Datos del cliente (solo si la consulta los incluye)
    clienteNombre: fila.cliente_nombre,
    clienteDni: fila.cliente_dni,
    clienteEmail: fila.cliente_email,
  };
}

export const YapeDepositRepository = {
  /** Estados posibles de un depósito */
  STATES: Object.freeze({ PENDIENTE: 'PENDIENTE', ACREDITADO: 'ACREDITADO', RECHAZADO: 'RECHAZADO' }),

  /** Crea una solicitud de depósito PENDIENTE. */
  async insert({ userId, accountId, amount, payerPhone = '', operacion = '', externalRef = null }) {
    const db = await getDb();
    const result = await db.prepare(`
      INSERT INTO yape_deposits (user_id, account_id, amount, payer_phone, operacion, external_ref, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(Number(userId), Number(accountId), amount, payerPhone, operacion, externalRef ?? '', new Date().toISOString());
    const fila = await db.prepare('SELECT * FROM yape_deposits WHERE id = ?')
      .get(Number(result.lastInsertRowid));
    return conAlias(fila);
  },

  /** Busca un depósito por su referencia externa (webhook de Mercado Pago). */
  async findByExternalRef(externalRef) {
    const db = await getDb();
    const fila = await db.prepare('SELECT * FROM yape_deposits WHERE external_ref = ?').get(externalRef);
    return conAlias(fila);
  },

  /** Guarda la referencia externa tras generar el QR (el id del depósito ya se conoce). */
  async guardarExternalRef(id, externalRef) {
    const db = await getDb();
    await db.prepare('UPDATE yape_deposits SET external_ref = ? WHERE id = ?').run(externalRef, Number(id));
    return this.findById(id);
  },

  async findById(id) {
    const db = await getDb();
    const fila = await db.prepare('SELECT * FROM yape_deposits WHERE id = ?').get(Number(id));
    return conAlias(fila);
  },

  /** Últimos depósitos del usuario (para su historial) */
  async findByUserId(userId, limite = 10) {
    const db = await getDb();
    const filas = await db.prepare(`
      SELECT * FROM yape_deposits WHERE user_id = ?
      ORDER BY id DESC LIMIT ?
    `).all(Number(userId), limite);
    return filas.map(conAlias);
  },

  /** ¿El usuario tiene una solicitud sin resolver? (una a la vez) */
  async countPendientes(userId) {
    const db = await getDb();
    const fila = await db.prepare(`
      SELECT COUNT(*) AS n FROM yape_deposits
      WHERE user_id = ? AND state = 'PENDIENTE'
    `).get(Number(userId));
    return Number(fila.n);
  },

  /** Depósitos PENDIENTE con datos del cliente (panel del admin) */
  async listarPendientes() {
    const db = await getDb();
    const filas = await db.prepare(`
      SELECT d.*, u.name AS cliente_nombre, u.dni AS cliente_dni, u.email AS cliente_email
      FROM yape_deposits d JOIN users u ON u.id = d.user_id
      WHERE d.state = 'PENDIENTE'
      ORDER BY d.id ASC
    `).all();
    return filas.map(conAlias);
  },

  /** Suma de monto ACREDITADO desde una fecha (para tope diario) */
  async sumAcreditadosDesde(accountId, desde) {
    const db = await getDb();
    const fila = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total FROM yape_deposits
      WHERE account_id = ? AND state = 'ACREDITADO' AND created_at > ?
    `).get(Number(accountId), desde);
    return Number(fila.total);
  },

  /** Resuelve el depósito (ACREDITADO o RECHAZADO) indicando quién lo hizo */
  async resolver(id, state, confirmUserId) {
    const db = await getDb();
    await db.prepare(`
      UPDATE yape_deposits
      SET state = ?, confirmed_by = ?, confirmed_at = ?
      WHERE id = ?
    `).run(state, confirmUserId ?? null, new Date().toISOString(), Number(id));
    return this.findById(id);
  },
};