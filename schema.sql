-- Esquema de la base de datos en Turso (libSQL / SQLite)
-- La función /api/db.js también crea estas tablas automáticamente si no existen,
-- así que correr este archivo es OPCIONAL. Sirve como referencia.

CREATE TABLE IF NOT EXISTS config (
  group_id            TEXT PRIMARY KEY,
  group_name          TEXT,
  cadence_days        INTEGER,
  novedades_ratio     INTEGER,
  tecnica_ratio       INTEGER,
  meeting_day_of_week INTEGER
);

CREATE TABLE IF NOT EXISTS companies (
  group_id   TEXT NOT NULL,
  id         INTEGER NOT NULL,
  name       TEXT,
  color      TEXT,
  active     INTEGER DEFAULT 1,
  matrix     TEXT,                 -- JSON array, ej: [true,true,true,true,true]
  reps       TEXT,                 -- JSON array de representantes
  sort_order INTEGER DEFAULT 0,
  PRIMARY KEY (group_id, id)
);

CREATE TABLE IF NOT EXISTS meetings (
  group_id   TEXT NOT NULL,
  date       TEXT NOT NULL,        -- YYYY-MM-DD
  assignment TEXT,
  obs        TEXT,
  topic      TEXT,
  fixed      INTEGER DEFAULT 0,
  PRIMARY KEY (group_id, date)
);

-- Contenido operativo en JSON: drive_config (fuentes de Drive),
-- ui_config (qué se muestra) y auth_config (si el sitio pide cuenta).
CREATE TABLE IF NOT EXISTS content (
  group_id TEXT NOT NULL,
  key      TEXT NOT NULL,
  data     TEXT,
  PRIMARY KEY (group_id, key)
);

-- Acceso al sitio: una cuenta por empresa, autorizada a mano por el grupo.
CREATE TABLE IF NOT EXISTS users (
  group_id    TEXT NOT NULL,
  email       TEXT NOT NULL,
  nombre      TEXT,
  empresa     TEXT,
  pass_hash   TEXT,                -- scrypt
  salt        TEXT,
  estado      TEXT DEFAULT 'pendiente',   -- pendiente | autorizado | bloqueado
  reset_token TEXT,
  reset_exp   TEXT,
  created_at  TEXT,
  PRIMARY KEY (group_id, email)
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  group_id   TEXT,
  email      TEXT,
  created_at TEXT,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS access_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT,
  email    TEXT,
  evento   TEXT,
  ts       TEXT,
  ua       TEXT
);
