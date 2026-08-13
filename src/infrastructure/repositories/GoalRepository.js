/**
 * OmniCash - Infraestructura
 * Repositorio de Alcancías (metas de ahorro con redondeo automático).
 * Operaciones asíncronas sobre la tabla goals.
 */

import { getDb } from '../database/connection.js';

function mapGoal(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    accountId: Number(row.account_id),
    nombre: row.nombre,
    objetivo: Number(row.objetivo),
    color: row.color,
    icono: row.icono,
    ahorrado: Number(row.ahorrado),
    esRedondeo: Number(row.es_redondeo),
    state: row.state,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export const GoalRepository = {
  /** Busca alcancias por usuario */
  async findByUserId(userId) {
    const db = await getDb();
    const rows = await db.prepare(
      'SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC'
    ).all(Number(userId));
    return rows.map(mapGoal);
  },

  /** Busca una alcancia por ID */
  async findById(id) {
    const db = await getDb();
    const row = await db.prepare('SELECT * FROM goals WHERE id = ?').get(Number(id));
    return mapGoal(row);
  },

  /** Crea una nueva alcancia (meta de ahorro) */
  async create({ userId, accountId, nombre, objetivo, color = '#F4600D', icono = '🎯' }) {
    const db = await getDb();
    const result = await db.prepare(
      'INSERT INTO goals (user_id, account_id, nombre, objetivo, color, icono, ahorrado, state, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, \"ACTIVA\", ?)'
    ).run(Number(userId), Number(accountId), nombre, Number(objetivo), color, icono, new Date().toISOString());
    return this.findById(Number(result.lastInsertRowid));
  },

  /** Aporta dinero a una alcancia (incrementa ahorrado) */
  async aportar({ goalId, monto }) {
    const db = await getDb();
    // Validar monto positivo
    if (typeof monto !== 'number' || monto <= 0) throw new Error('Monto inválido');

    // Actualizar ahorrado y verificar si se alcanzó el objetivo
    await db.prepare(
      'UPDATE goals SET ahorrado = ahorrado + ?, state = CASE WHEN ahorrado + ? >= objetivo THEN "COMPLETADA" ELSE state END WHERE id = ?'
    ).run(Number(monto), Number(monto), Number(goalId));

    return this.findById(Number(goalId));
  },

  /** Retira dinero de una alcancia (decrementa ahorrado, no permite quedarse negativo) */
  async retirar({ goalId, monto }) {
    if (typeof monto !== 'number' || monto <= 0) throw new Error('Monto inválido');

    const db = await getDb();
    // Primero obtener el ahorro actual
    const goal = await this.findById(Number(goalId));
    if (!goal) throw new Error('Alcancia no encontrada');

    if (monto > goal.ahorrado) throw new Error('Saldo insuficiente en la alcancia');

    // Descontar
    await db.prepare(
      'UPDATE goals SET ahorrado = ahorrado - ? WHERE id = ?'
    ).run(Number(monto), Number(goalId));

    return this.findById(Number(goalId));
  },
};