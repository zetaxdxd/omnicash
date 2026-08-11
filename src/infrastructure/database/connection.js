/**
 * OmniCash - Infraestructura
 * Conexión a la base de datos con DOBLE driver:
 *
 * - SQLite (node:sqlite): para desarrollo local. La API es síncrona y se
 *   envuelve en promesas para mantener una sola interfaz async.
 * - PostgreSQL (pg): para PRODUCCIÓN (Render + Neon). Base persistente
 *   que no se borra al redesplegar, a diferencia del disco efímero.
 *
 * Elección del driver: si existe DATABASE_URL se usa PostgreSQL;
 * si no, SQLite local (DB_PATH o data/omnicash.db).
 *
 * Ambos drivers exponen la misma interfaz asíncrona:
 *   db.exec(sql)                       -> Promise<void>
 *   db.prepare(sql).get(...params)     -> Promise<row|undefined>
 *   db.prepare(sql).all(...params)     -> Promise<row[]>
 *   db.prepare(sql).run(...params)     -> Promise<{lastInsertRowid, changes}>
 *   db.batch(sqls)                     -> Promise<void>
 *   db.close()                         -> Promise<void>
 */

import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';
import { SCHEMA_POSTGRES, SCHEMA_SQLITE } from './schema.js';

/** true si estamos en producción con PostgreSQL */
export const usaPostgres = Boolean(config.databaseUrl);

// ============================================================
// DRIVER SQLITE (desarrollo local)
// ============================================================
function crearDriverSqlite() {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  const raw = new DatabaseSync(config.dbPath);
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const preparar = (sql) => ({
    get: async (...p) => raw.prepare(sql).get(...p),
    all: async (...p) => raw.prepare(sql).all(...p),
    run: async (...p) => raw.prepare(sql).run(...p),
  });

  return {
    nombre: 'sqlite',
    exec: async (sql) => { raw.exec(sql); },
    batch: async (sqls) => { for (const s of sqls) raw.exec(s); },
    prepare: preparar,
    close: async () => raw.close(),
  };
}

// ============================================================
// DRIVER POSTGRESQL (producción)
// ============================================================

/**
 * Convierte los placeholders `?` de SQLite al estilo $1, $2... de PostgreSQL
 * (siempre que no estén dentro de comillas simples de un texto SQL).
 */
function convertirPlaceholders(sql) {
  let salida = '';
  let i = 0;
  let n = 0;
  let enComilla = false;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'") {
      enComilla = !enComilla;
      salida += c;
    } else if (c === '?' && !enComilla) {
      n += 1;
      salida += `$${n}`;
    } else {
      salida += c;
    }
    i += 1;
  }
  return { sql: salida, cantidad: n };
}

function crearDriverPostgres({ pool, baseSql }) {
  /** Envuelve el resultado de una query en la forma del driver de SQLite */
  function formatearResultado(result) {
    if (!result) return { lastInsertRowid: 0n, changes: 0 };
    const rows = result.rows ?? [];
    let changes = 0;
    if (result.rowCount !== null && result.rowCount !== undefined) changes = result.rowCount;
    else if (Array.isArray(rows)) changes = rows.length;
    return { lastInsertRowid: rows?.[0]?.id ?? 0n, changes, rows };
  }

  /**
   * Ejecuta SQL de INSERT/UPDATE/DELETE devolviendo {lastInsertRowid, changes}.
   * Para los INSERT se usa "RETURNING id": así obtenemos el id igual que
   * SQLite (lastInsertRowid).
   */
  async function ejecutarEscritura(statementSql, params) {
    let sql = statementSql;
    if (/^\s*insert\s/i.test(sql) && !/returning\s/i.test(sql)) {
      sql = `${sql.replace(/;\s*$/, '')} RETURNING id`;
    }
    const { sql: convertido, cantidad } = convertirPlaceholders(sql);
    const resultado = await pool.query(convertido, params.slice(0, cantidad));
    const { rows, changes } = formatearResultado(resultado);
    const fila = rows?.[0];
    return {
      lastInsertRowid: fila && 'id' in fila ? BigInt(fila.id) : 0n,
      changes,
    };
  }

  const preparar = (sql) => ({
    get: async (...p) => {
      const { sql: convertido, cantidad } = convertirPlaceholders(sql);
      const resultado = await pool.query(convertido, p.slice(0, cantidad));
      return resultado.rows?.[0] ?? undefined;
    },
    all: async (...p) => {
      const { sql: convertido, cantidad } = convertirPlaceholders(sql);
      const resultado = await pool.query(convertido, p.slice(0, cantidad));
      return resultado.rows ?? [];
    },
    run: (...p) => ejecutarEscritura(sql, p),
  });

  /** Separa el DDL múltiple en sentencias individuales ignorando comentarios */
  function dividirSentencias(sql) {
    return sql
      .split(';')
      .map((s) => s.replace(/--.*$/gm, '').trim())
      .filter((s) => s.length > 0);
  }

  return {
    nombre: 'postgres',
    exec: async (sql) => {
      for (const sentencia of dividirSentencias(sql)) {
        const { sql: convertido } = convertirPlaceholders(sentencia);
        await pool.query(convertido);
      }
    },
    batch: async (sqls) => {
      for (const s of sqls) {
        for (const sentencia of dividirSentencias(s)) {
          const { sql: convertido } = convertirPlaceholders(sentencia);
          await pool.query(convertido);
        }
      }
    },
    prepare: preparar,
    close: async () => pool.end(),
    pool,
    baseSql,
  };
}

// ============================================================
// INSTANCIA ÚNICA
// ============================================================

/** Crea y exporta la instancia de la base de datos según configuración */
export async function crearConexion() {
  if (usaPostgres) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });
    const driver = crearDriverPostgres({ pool, baseSql: SCHEMA_POSTGRES });
    await driver.batch(SCHEMA_POSTGRES);
    return driver;
  }

  const driver = crearDriverSqlite();
  await driver.exec(SCHEMA_SQLITE);
  return driver;
}

let instancia = null;
let promesaInstancia = null;

/** Devuelve la instancia única (inicialización diferida con cache) */
export function getDb() {
  if (instancia) return Promise.resolve(instancia);
  if (promesaInstancia) return promesaInstancia;
  promesaInstancia = crearConexion().then((d) => {
    instancia = d;
    return d;
  });
  return promesaInstancia;
}

/**
 * API POR DEFECTO usada por los repositorios.
 * NOTA: ahora es ASÍNCRONO. En producción usaremos siempre
 * `await getDb()` antes de cada operación.
 */
export const db = {
  getDriver: () => getDb(),
  /** Conveniencia: acceso directo tras inicializar (uso interno) */
  _raw: null,
  async init() {
    const d = await getDb();
    db._raw = d;
    return d;
  },
};

/**
 * Inicializa la conexión al arrancar la app.
 * Devuelve el driver listo.
 */
export async function initDatabase() {
  const d = await getDb();
  db._raw = d;
  return d;
}