/**
 * OmniCash - Infraestructura
 * Repositorio de Cuentas: persistencia de cuentas bancarias.
 * Todos los métodos son ASÍNCRONOS (compatibles con PostgreSQL).
 */

import { getDb } from '../database/connection.js';
import { Account } from '../../domain/entities/Account.js';
import { NotFoundError } from '../../domain/errors/DomainError.js';

/** Mapea una fila SQL a una entidad Account */
function mapToEntity(row) {
  if (!row) return null;
  return new Account({
    id: Number(row.id),
    userId: Number(row.user_id),
    cci: row.cci,
    balance: Number(row.balance),
    state: row.state,
    createdAt: row.created_at,
  });
}

export const AccountRepository = {
  /** Busca la cuenta del cliente por el ID de su usuario. */
  async findByUserId(userId) {
    const db = await getDb();
    const row = await db.prepare('SELECT * FROM accounts WHERE user_id = ?').get(Number(userId));
    return mapToEntity(row);
  },

  /** Busca una cuenta por su CCI (20 dígitos con verificadores). */
  async findByCci(cci) {
    const db = await getDb();
    const row = await db.prepare('SELECT * FROM accounts WHERE cci = ?').get(cci);
    return mapToEntity(row);
  },

  /** Busca una cuenta por su ID interno. */
  async findById(id) {
    const db = await getDb();
    const row = await db.prepare('SELECT * FROM accounts WHERE id = ?').get(Number(id));
    return mapToEntity(row);
  },

  /** Crea una cuenta nueva. */
  async insert(account) {
    const db = await getDb();
    const result = await db.prepare(`
      INSERT INTO accounts (user_id, cci, balance, state, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(account.userId, account.cci, account.balance, account.state, account.createdAt);
    return this.findById(Number(result.lastInsertRowid));
  },

  /** Guarda el saldo y estado de una cuenta (post-depósito, post-retiro...). */
  async update(account) {
    const db = await getDb();
    await db.prepare(`
      UPDATE accounts SET balance = ?, state = ? WHERE id = ?
    `).run(account.balance, account.state, Number(account.id));
  },

  /** Lista todas las cuentas (panel de administración). */
  async findAll() {
    const db = await getDb();
    const rows = await db.prepare('SELECT * FROM accounts ORDER BY id DESC').all();
    return rows.map(mapToEntity);
  },

  /** Conteo de cuentas abiertas (métricas del dashboard). */
  async count() {
    const db = await getDb();
    const row = await db.prepare('SELECT COUNT(*) AS n FROM accounts').get();
    return Number(row.n);
  },

  /** Total de créditos depositados en todo el banco. */
  async totalAssets() {
    const db = await getDb();
    const row = await db.prepare('SELECT COALESCE(SUM(balance), 0) AS total FROM accounts').get();
    return Number(row.total);
  },
};

/** Busca la cuenta de un usuario y lanza error 404 si no existe */
export async function getAccountOrThrow(userId) {
  const account = await AccountRepository.findByUserId(userId);
  if (!account) throw new NotFoundError('El usuario no tiene una cuenta bancaria');
  return account;
}