/**
 * OmniCash - Infraestructura
 * Esquemas de base de datos para ambos drivers (SQLite local / PostgreSQL prod).
 *
 * Los dos esquemas representan EXACTAMENTE el mismo modelo; solo cambia
 * la sintaxis de cada motor (PRAGMA vs SERIAL, AUTOINCREMENT, etc.).
 */

/** DDL para SQLite (desarrollo local) */
export const SCHEMA_SQLITE = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT    NOT NULL,
  apellido_paterno  TEXT    NOT NULL,
  apellido_materno  TEXT    NOT NULL,
  nombres           TEXT    NOT NULL,
  direccion         TEXT    NOT NULL,
  email             TEXT    NOT NULL,
  backup_email      TEXT    NOT NULL DEFAULT '',
  dni               TEXT    NOT NULL,
  phone             TEXT    NOT NULL,
  whatsapp          TEXT    NOT NULL DEFAULT '',
  password_hash     TEXT    NOT NULL,
  role              TEXT    NOT NULL DEFAULT 'CLIENTE',
  state             TEXT    NOT NULL DEFAULT 'ACTIVO',
  email_verified    INTEGER NOT NULL DEFAULT 0,
  totp_secret       TEXT,
  totp_enabled      INTEGER NOT NULL DEFAULT 0,
  login_attempts    INTEGER NOT NULL DEFAULT 0,
  blocked_until     TEXT,
  created_at        TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  cci         TEXT    NOT NULL UNIQUE,
  balance     REAL    NOT NULL DEFAULT 0,
  state       TEXT    NOT NULL DEFAULT 'ACTIVA',
  created_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id   INTEGER NOT NULL REFERENCES accounts(id),
  type         TEXT    NOT NULL,
  amount       REAL    NOT NULL,
  description  TEXT    NOT NULL DEFAULT '',
  reference_id INTEGER,
  created_at   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  token_hash   TEXT    NOT NULL UNIQUE,
  purpose      TEXT    NOT NULL DEFAULT 'LOGIN',
  user_agent   TEXT,
  ip           TEXT,
  expires_at   TEXT    NOT NULL,
  revoked_at   TEXT,
  used_at      TEXT,
  last_used_at TEXT,
  created_at   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS pending_registrations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT    NOT NULL UNIQUE,
  data_json  TEXT    NOT NULL,
  expires_at TEXT    NOT NULL,
  created_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT    NOT NULL,
  purpose    TEXT    NOT NULL,
  code_hash  TEXT    NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT    NOT NULL,
  used_at    TEXT,
  created_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    INTEGER,
  action      TEXT    NOT NULL,
  detail      TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS yape_deposits (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  account_id   INTEGER NOT NULL REFERENCES accounts(id),
  amount       REAL    NOT NULL,
  payer_phone  TEXT    NOT NULL DEFAULT '',
  operacion    TEXT    NOT NULL DEFAULT '',
  external_ref TEXT    NOT NULL DEFAULT '',
  state        TEXT    NOT NULL DEFAULT 'PENDIENTE',
  confirmed_by INTEGER REFERENCES users(id),
  confirmed_at TEXT,
  created_at   TEXT    NOT NULL
);

-- Red de cajeros aliados (retiro sin tarjeta con código de un solo uso)
CREATE TABLE IF NOT EXISTS atm_network (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo      TEXT    NOT NULL UNIQUE,
  nombre      TEXT    NOT NULL,
  distrito    TEXT    NOT NULL,
  direccion   TEXT    NOT NULL,
  horario     TEXT    NOT NULL DEFAULT '24/7',
  estado      TEXT    NOT NULL DEFAULT 'OPERATIVO',
  created_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS atm_withdrawals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  account_id   INTEGER NOT NULL REFERENCES accounts(id),
  atm_id       INTEGER NOT NULL REFERENCES atm_network(id),
  amount       REAL    NOT NULL,
  code_hash    TEXT    NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  expires_at   TEXT    NOT NULL,
  state        TEXT    NOT NULL DEFAULT 'PENDIENTE',
  completed_by INTEGER REFERENCES users(id),
  completed_at TEXT,
  created_at   TEXT    NOT NULL
);

-- Rentabilidad diaria visible ("tu dinero no duerme")
CREATE TABLE IF NOT EXISTS interest_accruals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id  INTEGER NOT NULL REFERENCES accounts(id),
  amount      REAL    NOT NULL,
  fecha       TEXT    NOT NULL,
  created_at  TEXT    NOT NULL,
  UNIQUE(account_id, fecha)
);

-- Alcancías (metas de ahorro con jarra + redondeo automático)
CREATE TABLE IF NOT EXISTS goals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  account_id   INTEGER NOT NULL REFERENCES accounts(id),
  nombre       TEXT    NOT NULL,
  objetivo     REAL    NOT NULL,
  color        TEXT    NOT NULL DEFAULT '#F4600D',
  icono        TEXT    NOT NULL DEFAULT '🎯',
  ahorrado     REAL    NOT NULL DEFAULT 0,
  es_redondeo  INTEGER NOT NULL DEFAULT 0,
  state        TEXT    NOT NULL DEFAULT 'ACTIVA',
  completed_at TEXT,
  created_at   TEXT    NOT NULL
);

-- La Tanda: ahorro grupal con pozo rotativo
CREATE TABLE IF NOT EXISTS tandas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre      TEXT    NOT NULL,
  creator_id  INTEGER NOT NULL REFERENCES users(id),
  cuota       REAL    NOT NULL,
  integrantes INTEGER NOT NULL,
  turno       INTEGER NOT NULL DEFAULT 1,
  pozo        REAL    NOT NULL DEFAULT 0,
  state       TEXT    NOT NULL DEFAULT 'RECLUTANDO',
  created_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS tanda_members (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tanda_id   INTEGER NOT NULL REFERENCES tandas(id),
  user_id    INTEGER NOT NULL REFERENCES users(id),
  turno      INTEGER NOT NULL,
  state      TEXT    NOT NULL DEFAULT 'ACTIVO',
  created_at TEXT    NOT NULL,
  UNIQUE(tanda_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_accounts_user   ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_tx_account      ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_tx_created      ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_created   ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user   ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_codes_email     ON verification_codes(email);
CREATE INDEX IF NOT EXISTS idx_yape_state      ON yape_deposits(state);
CREATE INDEX IF NOT EXISTS idx_yape_user       ON yape_deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_yape_external_ref ON yape_deposits(external_ref);
CREATE INDEX IF NOT EXISTS idx_atm_user        ON atm_withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_atm_state       ON atm_withdrawals(state);
CREATE INDEX IF NOT EXISTS idx_accruals_account ON interest_accruals(account_id);
CREATE INDEX IF NOT EXISTS idx_goals_user      ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_tandas_state    ON tandas(state);
CREATE INDEX IF NOT EXISTS idx_tanda_members_tanda ON tanda_members(tanda_id);
`;

/** DDL para PostgreSQL (producción) */
export const SCHEMA_POSTGRES = [
  `CREATE TABLE IF NOT EXISTS users (
  id                BIGSERIAL PRIMARY KEY,
  name              TEXT      NOT NULL,
  apellido_paterno  TEXT      NOT NULL,
  apellido_materno  TEXT      NOT NULL,
  nombres           TEXT      NOT NULL,
  direccion         TEXT      NOT NULL,
  email             TEXT      NOT NULL UNIQUE,
  backup_email      TEXT      NOT NULL DEFAULT '',
  dni               TEXT      NOT NULL,
  phone             TEXT      NOT NULL,
  whatsapp          TEXT      NOT NULL DEFAULT '',
  password_hash     TEXT      NOT NULL,
  role              TEXT      NOT NULL DEFAULT 'CLIENTE',
  state             TEXT      NOT NULL DEFAULT 'ACTIVO',
  email_verified    BOOLEAN   NOT NULL DEFAULT FALSE,
  totp_secret       TEXT,
  totp_enabled      BOOLEAN   NOT NULL DEFAULT FALSE,
  login_attempts    INTEGER   NOT NULL DEFAULT 0,
  blocked_until     TEXT,
  created_at        TEXT      NOT NULL
)`,

  `CREATE TABLE IF NOT EXISTS accounts (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT    NOT NULL REFERENCES users(id),
  cci         TEXT      NOT NULL UNIQUE,
  balance     DOUBLE PRECISION NOT NULL DEFAULT 0,
  state       TEXT      NOT NULL DEFAULT 'ACTIVA',
  created_at  TEXT      NOT NULL
)`,

  `CREATE TABLE IF NOT EXISTS transactions (
  id           BIGSERIAL PRIMARY KEY,
  account_id   BIGINT    NOT NULL REFERENCES accounts(id),
  type         TEXT      NOT NULL,
  amount       DOUBLE PRECISION NOT NULL,
  description  TEXT      NOT NULL DEFAULT '',
  reference_id TEXT,
  created_at   TEXT      NOT NULL
)`,

  `CREATE TABLE IF NOT EXISTS sessions (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT    NOT NULL REFERENCES users(id),
  token_hash   TEXT      NOT NULL UNIQUE,
  purpose      TEXT      NOT NULL DEFAULT 'LOGIN',
  user_agent   TEXT,
  ip           TEXT,
  expires_at   TEXT      NOT NULL,
  revoked_at   TEXT,
  used_at      TEXT,
  last_used_at TEXT,
  created_at   TEXT      NOT NULL
)`,

  `CREATE TABLE IF NOT EXISTS pending_registrations (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT      NOT NULL UNIQUE,
  data_json  TEXT      NOT NULL,
  expires_at TEXT      NOT NULL,
  created_at TEXT      NOT NULL
)`,

  `CREATE TABLE IF NOT EXISTS verification_codes (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT      NOT NULL,
  purpose    TEXT      NOT NULL,
  code_hash  TEXT      NOT NULL,
  attempts   INTEGER   NOT NULL DEFAULT 0,
  expires_at TEXT      NOT NULL,
  used_at    TEXT,
  created_at TEXT      NOT NULL
)`,

  `CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    BIGINT,
  action      TEXT      NOT NULL,
  detail      TEXT      NOT NULL DEFAULT '',
  created_at  TEXT      NOT NULL
)`,

  `CREATE TABLE IF NOT EXISTS yape_deposits (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT    NOT NULL REFERENCES users(id),
  account_id   BIGINT    NOT NULL REFERENCES accounts(id),
  amount       DOUBLE PRECISION NOT NULL,
  payer_phone  TEXT      NOT NULL DEFAULT '',
  operacion    TEXT      NOT NULL DEFAULT '',
  external_ref TEXT      NOT NULL DEFAULT '',
  state        TEXT      NOT NULL DEFAULT 'PENDIENTE',
  confirmed_by BIGINT    REFERENCES users(id),
  confirmed_at TEXT,
  created_at   TEXT      NOT NULL
)`,

  `CREATE TABLE IF NOT EXISTS atm_network (
  id          BIGSERIAL PRIMARY KEY,
  codigo      TEXT      NOT NULL UNIQUE,
  nombre      TEXT      NOT NULL,
  distrito    TEXT      NOT NULL,
  direccion   TEXT      NOT NULL,
  horario     TEXT      NOT NULL DEFAULT '24/7',
  estado      TEXT      NOT NULL DEFAULT 'OPERATIVO',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,

  `CREATE TABLE IF NOT EXISTS atm_withdrawals (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT    NOT NULL REFERENCES users(id),
  account_id   BIGINT    NOT NULL REFERENCES accounts(id),
  atm_id       BIGINT    NOT NULL REFERENCES atm_network(id),
  amount       DOUBLE PRECISION NOT NULL,
  code_hash    TEXT      NOT NULL,
  attempts     INTEGER   NOT NULL DEFAULT 0,
  expires_at   TIMESTAMPTZ NOT NULL,
  state        TEXT      NOT NULL DEFAULT 'PENDIENTE',
  completed_by BIGINT    REFERENCES users(id),
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,

  `CREATE TABLE IF NOT EXISTS interest_accruals (
  id          BIGSERIAL PRIMARY KEY,
  account_id  BIGINT    NOT NULL REFERENCES accounts(id),
  amount      DOUBLE PRECISION NOT NULL,
  fecha       TEXT      NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, fecha)
)`,

  `CREATE TABLE IF NOT EXISTS goals (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT    NOT NULL REFERENCES users(id),
  account_id   BIGINT    NOT NULL REFERENCES accounts(id),
  nombre       TEXT      NOT NULL,
  objetivo     DOUBLE PRECISION NOT NULL,
  color        TEXT      NOT NULL DEFAULT '#F4600D',
  icono        TEXT      NOT NULL DEFAULT '🎯',
  ahorrado     DOUBLE PRECISION NOT NULL DEFAULT 0,
  es_redondeo  BOOLEAN   NOT NULL DEFAULT FALSE,
  state        TEXT      NOT NULL DEFAULT 'ACTIVA',
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,

  `CREATE TABLE IF NOT EXISTS tandas (
  id          BIGSERIAL PRIMARY KEY,
  nombre      TEXT      NOT NULL,
  creator_id  BIGINT    NOT NULL REFERENCES users(id),
  cuota       DOUBLE PRECISION NOT NULL,
  integrantes INTEGER   NOT NULL,
  turno       INTEGER   NOT NULL DEFAULT 1,
  pozo        DOUBLE PRECISION NOT NULL DEFAULT 0,
  state       TEXT      NOT NULL DEFAULT 'RECLUTANDO',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,

  `CREATE TABLE IF NOT EXISTS tanda_members (
  id         BIGSERIAL PRIMARY KEY,
  tanda_id   BIGINT    NOT NULL REFERENCES tandas(id),
  user_id    BIGINT    NOT NULL REFERENCES users(id),
  turno      INTEGER   NOT NULL,
  state      TEXT      NOT NULL DEFAULT 'ACTIVO',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tanda_id, user_id)
)`,

  `ALTER TABLE yape_deposits ADD COLUMN IF NOT EXISTS external_ref TEXT NOT NULL DEFAULT ''`,

  `CREATE INDEX IF NOT EXISTS idx_yape_external_ref ON yape_deposits(external_ref)`,

  `CREATE INDEX IF NOT EXISTS idx_accounts_user   ON accounts(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tx_account      ON transactions(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tx_created      ON transactions(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_created   ON audit_log(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user   ON sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_codes_email     ON verification_codes(email)`,
`CREATE INDEX IF NOT EXISTS idx_yape_state      ON yape_deposits(state)`,
  `CREATE INDEX IF NOT EXISTS idx_yape_user       ON yape_deposits(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_yape_external_ref ON yape_deposits(external_ref)`,
  `CREATE INDEX IF NOT EXISTS idx_atm_user        ON atm_withdrawals(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_atm_state       ON atm_withdrawals(state)`,
  `CREATE INDEX IF NOT EXISTS idx_accruals_account ON interest_accruals(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_goals_user      ON goals(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tandas_state    ON tandas(state)`,
  `CREATE INDEX IF NOT EXISTS idx_tanda_members_tanda ON tanda_members(tanda_id)`,
];