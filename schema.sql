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
