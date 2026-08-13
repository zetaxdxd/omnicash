/**
 * OmniCash - Infraestructura
 * Repositorio de Red de Cajeros y Retiros sin tarjeta.
 * Métodos ASÍNCRONOS.
 */

import { getDb } from '../database/connection.js';

function mapAtm(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    codigo: row.codigo,
    nombre: row.nombre,
    distrito: row.distrito,
    direccion: row.direccion,
    horario: row.horario,
    estado: row.estado,
    createdAt: row.created_at,
  };
}

function mapWithdrawal(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    accountId: Number(row.account_id),
    atmId: Number(row.atm_id),
    amount: Number(row.amount),
    codeHash: row.code_hash,
    attempts: Number(row.attempts),
    expiresAt: row.expires_at,
    state: row.state,
    completedBy: row.completed_by ? Number(row.completed_by) : null,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    // Datos adicionales (cuando se hace JOIN)
    atmNombre: row.atm_nombre,
    atmCodigo: row.atm_codigo,
    atmDireccion: row.atm_direccion,
    userNombre: row.user_nombre,
    userEmail: row.user_email,
    userDni: row.user_dni,
  };
}

export const AtmRepository = {
  // --- Red de cajeros (seed y listado) ---

  /** Inserta un cajero en la red (usado en seed) */
  async insertAtm({ codigo, nombre, distrito, direccion, horario = '24/7', estado = 'OPERATIVO' }) {
    const db = await getDb();
    const result = await db.prepare(`
      INSERT INTO atm_network (codigo, nombre, distrito, direccion, horario, estado, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(codigo, nombre, distrito, direccion, horario, estado, new Date().toISOString());
    return this.findAtmById(Number(result.lastInsertRowid));
  },

  /** Busca cajero por ID */
  async findAtmById(id) {
    const db = await getDb();
    const row = await db.prepare('SELECT * FROM atm_network WHERE id = ?').get(Number(id));
    return mapAtm(row);
  },

  /** Busca cajero por código */
  async findAtmByCodigo(codigo) {
    const db = await getDb();
    const row = await db.prepare('SELECT * FROM atm_network WHERE codigo = ?').get(codigo);
    return mapAtm(row);
  },

  /** Lista todos los cajeros operativos */
  async listarCajeros() {
    const db = await getDb();
    const rows = await db.prepare(`
      SELECT * FROM atm_network WHERE estado = 'OPERATIVO' ORDER BY nombre
    `).all();
    return rows.map(mapAtm);
  },

  /** Cuenta cajeros para seed */
  async countCajeros() {
    const db = await getDb();
    const row = await db.prepare('SELECT COUNT(*) as c FROM atm_network').get();
    return Number(row.c);
  },

  // --- Retiros sin tarjeta (código de un solo uso) ---

  /** Crea una solicitud de retiro pendiente con código hash */
  async insertWithdrawal({ userId, accountId, atmId, amount, codeHash, expiresAt }) {
    const db = await getDb();
    const result = await db.prepare(`
      INSERT INTO atm_withdrawals (user_id, account_id, atm_id, amount, code_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(Number(userId), Number(accountId), Number(atmId), amount, codeHash, expiresAt, new Date().toISOString());
    return this.findWithdrawalById(Number(result.lastInsertRowid));
  },

  /** Busca retiro por ID */
  async findWithdrawalById(id) {
    const db = await getDb();
    const row = await db.prepare('SELECT * FROM atm_withdrawals WHERE id = ?').get(Number(id));
    return mapWithdrawal(row);
  },

  /** Busca retiro por hash del código */
  async findWithdrawalByCodeHash(codeHash) {
    const db = await getDb();
    const row = await db.prepare('SELECT * FROM atm_withdrawals WHERE code_hash = ?').get(codeHash);
    return mapWithdrawal(row);
  },

  /** Retiros pendientes del usuario (máximo uno a la vez) */
  async countPendientes(userId) {
    const db = await getDb();
    const row = await db.prepare(`
      SELECT COUNT(*) as n FROM atm_withdrawals
      WHERE user_id = ? AND state = 'PENDIENTE' AND expires_at > ?
    `).get(Number(userId), new Date().toISOString());
    return Number(row.n);
  },

  /** Suma de retiros COMPLETADOS hoy para límite diario */
  async sumCompletadosHoy(accountId) {
    const db = await getDb();
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);
    const row = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM atm_withdrawals
      WHERE account_id = ? AND state = 'COMPLETADO' AND created_at >= ?
    `).get(Number(accountId), inicioDia.toISOString());
    return Number(row.total);
  },

  /** Marca retiro como completado por el cajero */
  async completar(withdrawalId, completadoPor) {
    const db = await getDb();
    await db.prepare(`
      UPDATE atm_withdrawals
      SET state = 'COMPLETADO', completed_by = ?, completed_at = ?
      WHERE id = ?
    `).run(Number(completadoPor), new Date().toISOString(), Number(withdrawalId));
    return this.findWithdrawalById(withdrawalId);
  },

  /** Marca retiro como expirado/cancelado */
  async expirar(withdrawalId) {
    const db = await getDb();
    await db.prepare(`
      UPDATE atm_withdrawals SET state = 'EXPIRADO' WHERE id = ?
    `).run(Number(withdrawalId));
    return this.findWithdrawalById(withdrawalId);
  },

  /** Incrementa intentos de código */
  async incrementarIntentos(withdrawalId) {
    const db = await getDb();
    await db.prepare(`
      UPDATE atm_withdrawals SET attempts = attempts + 1 WHERE id = ?
    `).run(Number(withdrawalId));
    return this.findWithdrawalById(withdrawalId);
  },

  /** Historial de retiros del cliente */
  async historialCliente(userId, limite = 20) {
    const db = await getDb();
    const rows = await db.prepare(`
      SELECT w.*, a.nombre as atm_nombre, a.codigo as atm_codigo, a.direccion as atm_direccion
      FROM atm_withdrawals w
      JOIN atm_network a ON a.id = w.atm_id
      WHERE w.user_id = ?
      ORDER BY w.id DESC LIMIT ?
    `).all(Number(userId), limite);
    return rows.map(mapWithdrawal);
  },

  /** Lista retiros PENDIENTES no expirados (panel cajero/admin) */
  async listarPendientes() {
    const db = await getDb();
    const rows = await db.prepare(`
      SELECT w.*, a.nombre as atm_nombre, a.codigo as atm_codigo, a.direccion as atm_direccion,
             u.name as user_nombre, u.email as user_email, u.dni as user_dni
      FROM atm_withdrawals w
      JOIN atm_network a ON a.id = w.atm_id
      JOIN users u ON u.id = w.user_id
      WHERE w.state = 'PENDIENTE' AND w.expires_at > ?
      ORDER BY w.created_at ASC
    `).all(new Date().toISOString());
    return rows.map(mapWithdrawal);
  },

  /** Limpia retiros PENDIENTES expirados (job de mantenimiento) */
  async limpiarExpirados() {
    const db = await getDb();
    await db.prepare(`
      UPDATE atm_withdrawals SET state = 'EXPIRADO'
      WHERE state = 'PENDIENTE' AND expires_at <= ?
    `).run(new Date().toISOString());
  },
};