/**
 * OmniCash - Infraestructura
 * Repositorio de Rentabilidad Diaria (interest_accruals).
 * Métodos ASÍNCRONOS.
 */

import { getDb } from '../database/connection.js';

function mapAccrual(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    accountId: Number(row.account_id),
    amount: Number(row.amount),
    fecha: row.fecha,
    createdAt: row.created_at,
  };
}

export const InterestRepository = {
  /** Inserta o ignora el abono de interés diario (idempotente por unique account_id+fecha) */
  async insert({ accountId, amount, fecha }) {
    const db = await getDb();
    try {
      const result = await db.prepare(`
        INSERT INTO interest_accruals (account_id, amount, fecha, created_at)
        VALUES (?, ?, ?, ?)
      `).run(Number(accountId), amount, fecha, new Date().toISOString());
      return this.findByAccountAndFecha(accountId, fecha);
    } catch (e) {
      if (e.message?.includes('UNIQUE') || e.message?.includes('unique')) {
        return this.findByAccountAndFecha(accountId, fecha);
      }
      throw e;
    }
  },

  /** Busca abono por cuenta y fecha */
  async findByAccountAndFecha(accountId, fecha) {
    const db = await getDb();
    const row = await db.prepare(`
      SELECT * FROM interest_accruals WHERE account_id = ? AND fecha = ?
    `).get(Number(accountId), fecha);
    return mapAccrual(row);
  },

  /** Abono de hoy para una cuenta */
  async findHoy(accountId) {
    const hoy = new Date().toISOString().split('T')[0];
    return this.findByAccountAndFecha(accountId, hoy);
  },

  /** Total acumulado de intereses de una cuenta */
  async sumTotal(accountId) {
    const db = await getDb();
    const row = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM interest_accruals WHERE account_id = ?
    `).get(Number(accountId));
    return Number(row.total);
  },

  /** Historial de abonos de una cuenta */
  async historial(accountId, limite = 60) {
    const db = await getDb();
    const rows = await db.prepare(`
      SELECT * FROM interest_accruals WHERE account_id = ?
      ORDER BY fecha DESC LIMIT ?
    `).all(Number(accountId), limite);
    return rows.map(mapAccrual);
  },

  /** Cuentas que YA recibieron interés hoy (para job batch) */
  async cuentasYaProcesadasHoy() {
    const db = await getDb();
    const hoy = new Date().toISOString().split('T')[0];
    const rows = await db.prepare(`
      SELECT account_id FROM interest_accruals WHERE fecha = ?
    `).all(hoy);
    return rows.map(r => Number(r.account_id));
  },

  /** Total de interés repartido hoy (métrica admin) */
  async totalHoy() {
    const db = await getDb();
    const hoy = new Date().toISOString().split('T')[0];
    const row = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM interest_accruals WHERE fecha = ?
    `).get(hoy);
    return Number(row.total);
  },
};