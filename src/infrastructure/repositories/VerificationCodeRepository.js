/**
 * OmniCash - Infraestructura
 * Repositorio de Códigos de Verificación (OTP).
 * Guarda solo el hash SHA-256 del código con su salt.
 * Métodos ASÍNCRONOS.
 */

import { getDb } from '../database/connection.js';

/** Mapea una fila SQL a un objeto plano con claves consistentes.
 *  Se incluyen BOTH formas (camelCase y snake_case) para compatibilidad
 *  con los use-cases que aún leen fila.code_hash / fila.expires_at. */
function mapToEntity(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    email: row.email,
    purpose: row.purpose,
    codeHash: row.code_hash,
    attempts: Number(row.attempts),
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    createdAt: row.created_at,
    // Formas SQL crudas (legado)
    code_hash: row.code_hash,
    expires_at: row.expires_at,
    used_at: row.used_at,
    created_at: row.created_at,
  };
}

export const VerificationCodeRepository = {
  /** Inserta un código de verificación nuevo. */
  async insert({ email, purpose, codeHash, expiresAt }) {
    const db = await getDb();
    const result = await db.prepare(`
      INSERT INTO verification_codes (email, purpose, code_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(email, purpose, codeHash, expiresAt, new Date().toISOString());
    return this.findById(Number(result.lastInsertRowid));
  },

  /** Busca la fila por su ID. */
  async findById(id) {
    const db = await getDb();
    const row = await db.prepare('SELECT * FROM verification_codes WHERE id = ?').get(Number(id));
    return mapToEntity(row);
  },

  /** Busca el código más reciente de un correo con un propósito. */
  async findLatest(email, purpose) {
    const db = await getDb();
    const row = await db.prepare(`
      SELECT * FROM verification_codes
      WHERE email = ? AND purpose = ?
      ORDER BY id DESC LIMIT 1
    `).get(email, purpose);
    return mapToEntity(row);
  },

  /** Cuenta códigos activos emitidos para un correo y propósito (limita reenvíos). */
  async countActivos(email, purpose) {
    const db = await getDb();
    const row = await db.prepare(`
      SELECT COUNT(*) AS n FROM verification_codes
      WHERE email = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?
    `).get(email, purpose, new Date().toISOString());
    return Number(row.n);
  },

  /** Incrementa el contador de intentos del código. */
  async registrarIntento(id) {
    const db = await getDb();
    await db.prepare('UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?').run(Number(id));
  },

  /** Marca el código como usado (un solo uso). */
  async marcarUsado(id) {
    const db = await getDb();
    await db.prepare('UPDATE verification_codes SET used_at = ? WHERE id = ?')
      .run(new Date().toISOString(), Number(id));
  },

  /** Invalida los códigos pendientes de un correo y propósito. */
  async invalidarActivos(email, purpose) {
    const db = await getDb();
    await db.prepare(`
      UPDATE verification_codes SET used_at = ?
      WHERE email = ? AND purpose = ? AND used_at IS NULL
    `).run(new Date().toISOString(), email, purpose);
  },
};