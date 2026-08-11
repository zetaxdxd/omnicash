/**
 * OmniCash - Infraestructura
 * Repositorio de Transacciones: persistencia del registro contable.
 * Nunca se actualiza ni borra una transacción (inmutabilidad bancaria).
 * Métodos ASÍNCRONOS.
 */

import { getDb } from '../database/connection.js';
import { Transaction } from '../../domain/entities/Transaction.js';

/** Mapea una fila SQL a una entidad Transaction */
function mapToEntity(row) {
  if (!row) return null;
  return new Transaction({
    id: Number(row.id),
    accountId: Number(row.account_id),
    type: row.type,
    amount: Number(row.amount),
    description: row.description,
    referenceId: row.reference_id ? Number(row.reference_id) : null,
    createdAt: row.created_at,
  });
}

export const TransactionRepository = {
  /** Registra una transacción nueva en el libro mayor. */
  async insert(tx) {
    const db = await getDb();
    const result = await db.prepare(`
      INSERT INTO transactions (account_id, type, amount, description, reference_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(tx.accountId, tx.type, tx.amount, tx.description, tx.referenceId, tx.createdAt);
    return this.findById(Number(result.lastInsertRowid));
  },

  /** Busca una transacción por id. */
  async findById(id) {
    const db = await getDb();
    const row = await db.prepare('SELECT * FROM transactions WHERE id = ?').get(Number(id));
    return mapToEntity(row);
  },

  /** Historial de transacciones de una cuenta (más recientes primero). */
  async findByAccount(accountId, limit = 50) {
    const db = await getDb();
    const rows = await db.prepare(`
      SELECT * FROM transactions
      WHERE account_id = ?
      ORDER BY id DESC
      LIMIT ?
    `).all(Number(accountId), limit);
    return rows.map(mapToEntity);
  },

  /** Lista todas las transacciones del banco (vista de administración). */
  async findAll(limit = 200) {
    const db = await getDb();
    const rows = await db.prepare('SELECT * FROM transactions ORDER BY id DESC LIMIT ?').all(limit);
    return rows.map(mapToEntity);
  },

  /** Suma de retiros de una cuenta desde una fecha (límite diario del cajero). */
  async sumWithdrawalsSince(accountId, since) {
    const db = await getDb();
    const row = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM transactions
      WHERE account_id = ? AND type = 'RETIRO_CAJERO' AND created_at >= ?
    `).get(Number(accountId), since);
    return Number(row.total);
  },
};