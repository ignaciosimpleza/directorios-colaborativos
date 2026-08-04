// Sesiones y control de acceso (compartido por las funciones de /api).
//
// Modelo acordado con el grupo: cada empresa se registra con UNA cuenta y la
// comparte con su equipo. El registro es autogestionado, pero la cuenta nace
// «pendiente» y no ve nada hasta que el equipo del grupo la autoriza a mano.
//
// Variables de entorno usadas:
//   - TURSO_DATABASE_URL / TURSO_AUTH_TOKEN  (base)
//   - EDIT_PASSWORD                          (clave de administración del sitio)

import { createClient } from '@libsql/client/web';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

let schemaReady;
export function ensureAuthSchema() {
  if (!schemaReady) {
    schemaReady = db.batch([
      `CREATE TABLE IF NOT EXISTS users (
        group_id   TEXT NOT NULL,
        email      TEXT NOT NULL,
        nombre     TEXT,
        empresa    TEXT,
        pass_hash  TEXT,
        salt       TEXT,
        estado     TEXT DEFAULT 'pendiente',
        reset_token TEXT,
        reset_exp   TEXT,
        created_at  TEXT,
        PRIMARY KEY (group_id, email)
      )`,
      `CREATE TABLE IF NOT EXISTS sessions (
        token      TEXT PRIMARY KEY,
        group_id   TEXT,
        email      TEXT,
        created_at TEXT,
        expires_at TEXT
      )`,
      // Misma tabla que usa /api/db (acá se guarda auth_config)
      `CREATE TABLE IF NOT EXISTS content (
        group_id TEXT NOT NULL,
        key      TEXT NOT NULL,
        data     TEXT,
        PRIMARY KEY (group_id, key)
      )`,
      `CREATE TABLE IF NOT EXISTS access_log (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id TEXT,
        email    TEXT,
        evento   TEXT,
        ts       TEXT,
        ua       TEXT
      )`,
    ], 'write').catch(err => { schemaReady = null; throw err; });
  }
  return schemaReady;
}

export const ahora = () => new Date().toISOString();
export const normEmail = e => String(e || '').trim().toLowerCase();

// ── Contraseñas: scrypt con sal por usuario ──
export function hashPassword(password, salt) {
  const s = salt || randomBytes(16).toString('hex');
  return { salt: s, hash: scryptSync(String(password), s, 64).toString('hex') };
}

export function passwordOk(password, salt, hash) {
  if (!salt || !hash) return false;
  const calc = Buffer.from(scryptSync(String(password), salt, 64).toString('hex'));
  const guardado = Buffer.from(String(hash));
  return calc.length === guardado.length && timingSafeEqual(calc, guardado);
}

export const nuevoToken = () => randomBytes(32).toString('hex');

// El token del navegador viaja en Authorization: Bearer …
// (el sitio se embebe en un iframe de simpleza.com.ar, donde las cookies de
// terceros no son confiables).
export function tokenDeRequest(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  if (m) return m[1].trim();
  return String(req.query?.token || '') || '';
}

export async function sesionDe(req) {
  const token = tokenDeRequest(req);
  if (!token) return null;
  await ensureAuthSchema();
  const r = await db.execute({
    sql: `SELECT s.email, s.group_id, s.expires_at, u.estado, u.nombre, u.empresa
          FROM sessions s LEFT JOIN users u ON u.group_id = s.group_id AND u.email = s.email
          WHERE s.token = ?`,
    args: [token],
  });
  const row = r.rows[0];
  if (!row) return null;
  if (row.expires_at && row.expires_at < ahora()) {
    await db.execute({ sql: 'DELETE FROM sessions WHERE token = ?', args: [token] });
    return null;
  }
  if (row.estado !== 'autorizado') return null;
  return { email: row.email, groupId: row.group_id, nombre: row.nombre, empresa: row.empresa };
}

export const esAdmin = password =>
  !!process.env.EDIT_PASSWORD && password === process.env.EDIT_PASSWORD;

// ── ¿Este grupo exige login para leer? ──
// Se guarda en content.auth_config = { requireLogin: true }. Se cachea unos
// segundos para no pegarle a la base en cada request.
const cacheReq = { v: null, hasta: 0 };

export async function requiereLogin(groupId) {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) return false;
  const t = Date.now();
  if (cacheReq.v !== null && t < cacheReq.hasta) return cacheReq.v;
  try {
    const r = await db.execute({
      sql: `SELECT data FROM content WHERE group_id = ? AND key = 'auth_config'`,
      args: [groupId || 'grupo4'],
    });
    let val = false;
    if (r.rows[0]) { try { val = !!JSON.parse(r.rows[0].data).requireLogin; } catch {} }
    cacheReq.v = val;
    cacheReq.hasta = t + 30000;
    return val;
  } catch {
    return false;   // ante un error de base, no dejamos el sitio inaccesible
  }
}

export function invalidarCacheAcceso() { cacheReq.v = null; cacheReq.hasta = 0; }

// Portero de las funciones de lectura: si el grupo pide login y no hay sesión
// válida, corta con 401. Devuelve true si hay que cortar.
export async function bloqueaPorLogin(req, res, groupId) {
  if (!(await requiereLogin(groupId))) return false;
  const s = await sesionDe(req);
  if (s) return false;
  res.status(401).json({ error: 'Necesitás iniciar sesión para ver este contenido.', login: true });
  return true;
}
