/**
 * OmniCash - Infraestructura
 * Repositorio de Registros Pendientes de Apertura de Cuenta.
 * Guarda los datos de identidad del cliente ANTES de crear el usuario:
 * el usuario se crea solo cuando el código OTP es verificado.
 * Métodos ASÍNCRONOS.
 */

import { getDb } from '../database/connection.js';

function mapToEntity(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    email: row.email,
    data: JSON.parse(row.data_json),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export const PendingRegistrationRepository = {
  /** Guarda (o reemplaza) el registro pendiente de un correo. */
  async upsert({ email, data, expiresAt }) {
    const db = await getDb();
    await db.prepare(`
      INSERT INTO pending_registrations (email, data_json, expires_at, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET data_json = excluded.data_json, expires_at = excluded.expires_at, created_at = excluded.created_at
    `).run(email, JSON.stringify(data), expiresAt, new Date().toISOString());
    return this.findByEmail(email);
  },

  /** Busca el registro pendiente de un correo. */
  async findByEmail(email) {
    const db = await getDb();
    const row = await db.prepare(`
      SELECT * FROM pending_registrations WHERE email = ?
    `).get(email);
    return mapToEntity(row);
  },

  /** Elimina el registro pendiente (tras verificar o expirar). */
  async eliminar(email) {
    const db = await getDb();
    await db.prepare('DELETE FROM pending_registrations WHERE email = ?').run(email);
  },

  /** Elimina registros pendientes vencidos (limpieza). */
  async limpiarVencidos() {
    const db = await getDb();
    await db.prepare('DELETE FROM pending_registrations WHERE expires_at < ?').run(new Date().toISOString());
  },
};
