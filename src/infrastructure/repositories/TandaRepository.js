/**
 * OmniCash - Infraestructura
 * Repositorio de La Tanda: ahorro grupal con pozo rotativo.
 * Operaciones asíncronas sobre las tablas tandas y tanda_members.
 */

import { getDb } from '../database/connection.js';

function mapTanda(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    nombre: row.nombre,
    pozoActual: Number(row.pozo_actual),
    pozoInicial: Number(row.pozo_inicial),
    estado: row.estado,
    createdAt: row.created_at,
  };
}

function mapTandaMember(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    tandaId: Number(row.tanda_id),
    userId: Number(row.user_id),
    role: row.role,
    joinedAt: row.joined_at,
  };
}

export const TandaRepository = {
  /** Lista todas las tandas */
  async findAll() {
    const db = await getDb();
    const rows = await db.prepare('SELECT * FROM tandas ORDER BY created_at DESC').all();
    return rows.map(mapTanda);
  },

  /** Busca una tanda por ID */
  async findById(id) {
    const db = await getDb();
    const row = await db.prepare('SELECT * FROM tandas WHERE id = ?').get(Number(id));
    return mapTanda(row);
  },

  /** Crea una nueva tanda */
  async create({ nombre, pozoInicial, userId }) {
    const db = await getDb();
    const result = await db.prepare(
      'INSERT INTO tandas (nombre, pozo_inicial, pozo_actual, estado, created_at) VALUES (?, ?, ?, "ACTIVA", ?)'
    ).run(nombre, Number(pozoInicial), Number(pozoInicial), new Date().toISOString());
    const tandaId = Number(result.lastInsertRowid);

    // El creador se convierte automáticamente en organizador
    await db.prepare(
      'INSERT INTO tanda_members (tanda_id, user_id, role, joined_at) VALUES (?, ?, "ORGANIZADOR", ?)'
    ).run(tandaId, Number(userId), new Date().toISOString());

    return this.findById(tandaId);
  },

  /** Busca miembros de una tanda */
  async findMembers(tandaId) {
    const db = await getDb();
    const rows = await db.prepare(
      'SELECT * FROM tanda_members WHERE tanda_id = ? ORDER BY role DESC, joined_at'
    ).all(Number(tandaId));
    return rows.map(mapTandaMember);
  },

  /** Unirse a una tanda (como participante) */
  async unirse({ tandaId, userId }) {
    const db = await getDb();
    // Verificar que la tanda existe y está ACTIVA
    const tanda = await this.findById(tandaId);
    if (!tanda) throw new Error('Tanda no encontrada');
    if (tanda.estado !== 'ACTIVA') throw new Error('La tanda no está activa');

    // Verificar si el usuario ya es miembro
    const existente = await db.prepare(
      'SELECT * FROM tanda_members WHERE tanda_id = ? AND user_id = ?'
    ).get(Number(tandaId), Number(userId));
    if (existente) throw new Error('Ya eres miembro de esta tanda');

    // Agregar como participante
    await db.prepare(
      'INSERT INTO tanda_members (tanda_id, user_id, role, joined_at) VALUES (?, ?, "PARTICIPANTE", ?)'
    ).run(tandaId, Number(userId), new Date().toISOString());

    return this.findMembers(tandaId);
  },

  /** Inicia el ciclo de la tanda (primera rotación del pozo) */
  async iniciarCiclo({ tandaId }) {
    const db = await getDb();
    // Cambiar estado a EN_CURSO y registrar el inicio del ciclo
    await db.prepare(
      'UPDATE tandas SET estado = "EN_CURSO" WHERE id = ?'
    ).run(Number(tandaId));

    // Aquí se podría lógica adicional: asignar pozo, etc.
    return this.findById(tandaId);
  },
};