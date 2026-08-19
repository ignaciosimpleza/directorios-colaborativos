// Vercel Serverless Function — capa de datos sobre Turso (libSQL).
//
// Lee las credenciales desde las variables de entorno de Vercel:
//   - TURSO_DATABASE_URL   (ej: libsql://tu-base-tu-org.turso.io)
//   - TURSO_AUTH_TOKEN     (token generado con: turso db tokens create <db>)
//   - EDIT_PASSWORD        (opcional) si está seteada, se exige para escribir
//
// El token de Turso vive solo en el servidor, nunca llega al navegador.

import { createClient } from '@libsql/client/web';
import { bloqueaPorLogin, grupoPorDefecto } from './_auth.js';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Crea las tablas si no existen (una sola vez por cold-start).
let schemaReady;
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = client.batch([
      `CREATE TABLE IF NOT EXISTS config (
        group_id TEXT PRIMARY KEY,
        group_name TEXT,
        cadence_days INTEGER,
        novedades_ratio INTEGER,
        tecnica_ratio INTEGER,
        meeting_day_of_week INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS companies (
        group_id TEXT NOT NULL,
        id INTEGER NOT NULL,
        name TEXT,
        color TEXT,
        active INTEGER DEFAULT 1,
        matrix TEXT,
        reps TEXT,
        sort_order INTEGER DEFAULT 0,
        PRIMARY KEY (group_id, id)
      )`,
      `CREATE TABLE IF NOT EXISTS meetings (
        group_id TEXT NOT NULL,
        date TEXT NOT NULL,
        assignment TEXT,
        obs TEXT,
        topic TEXT,
        fixed INTEGER DEFAULT 0,
        PRIMARY KEY (group_id, date)
      )`,
      // Almacén genérico de contenido editable del dashboard (blobs JSON por sección)
      `CREATE TABLE IF NOT EXISTS content (
        group_id TEXT NOT NULL,
        key TEXT NOT NULL,
        data TEXT,
        PRIMARY KEY (group_id, key)
      )`,
    ], 'write').catch(err => { schemaReady = null; throw err; });
  }
  return schemaReady;
}

function requireAuth(password) {
  const expected = process.env.EDIT_PASSWORD;
  if (!expected) {
    const err = new Error('Falta configurar EDIT_PASSWORD en Vercel: sin esa clave nadie puede editar.');
    err.status = 500;
    throw err;
  }
  if (password !== expected) {
    const err = new Error('No autorizado');
    err.status = 401;
    throw err;
  }
}

const MEETING_UPSERT =
  `INSERT INTO meetings (group_id, date, assignment, obs, topic, fixed)
   VALUES (?, ?, ?, ?, ?, ?)
   ON CONFLICT(group_id, date) DO UPDATE SET
     assignment = excluded.assignment,
     obs        = excluded.obs,
     topic      = excluded.topic,
     fixed      = excluded.fixed`;

const COMPANY_UPSERT =
  `INSERT INTO companies (group_id, id, name, color, active, matrix, reps, sort_order)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(group_id, id) DO UPDATE SET
     name       = excluded.name,
     color      = excluded.color,
     active     = excluded.active,
     matrix     = excluded.matrix,
     reps       = excluded.reps,
     sort_order = excluded.sort_order`;

const meetingArgs = (gid, m) =>
  [gid, m.date, m.assignment ?? '', m.obs ?? '', m.topic ?? '', m.fixed ? 1 : 0];

const companyArgs = (gid, c) =>
  [gid, c.id, c.name ?? '', c.color ?? '', c.active ? 1 : 0,
   JSON.stringify(c.matrix ?? []), JSON.stringify(c.reps ?? []), c.sort_order ?? 0];

export default async function handler(req, res) {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    return res.status(500).json({
      error: 'Faltan las variables de entorno TURSO_DATABASE_URL y/o TURSO_AUTH_TOKEN en Vercel.'
    });
  }

  try {
    await ensureSchema();

    // ---------- LECTURA ----------
    if (req.method === 'GET') {
      const groupId = req.query.group_id || grupoPorDefecto();
      // Si el grupo exige login, el calendario tampoco se sirve sin sesión
      if (await bloqueaPorLogin(req, res, groupId)) return;
      const [cfg, cos, mtg, cnt] = await Promise.all([
        client.execute({ sql: 'SELECT * FROM config WHERE group_id = ?', args: [groupId] }),
        client.execute({ sql: 'SELECT * FROM companies WHERE group_id = ? ORDER BY sort_order ASC', args: [groupId] }),
        client.execute({ sql: 'SELECT * FROM meetings WHERE group_id = ? ORDER BY date ASC', args: [groupId] }),
        client.execute({ sql: 'SELECT key, data FROM content WHERE group_id = ?', args: [groupId] }),
      ]);
      const content = {};
      for (const r of cnt.rows) {
        try { content[r.key] = JSON.parse(r.data); } catch { content[r.key] = null; }
      }
      return res.status(200).json({
        // Valores que puede traer el entorno de Vercel, para no tener ningún id
        // escrito en el HTML. Lo que se guarda en Configuración tiene prioridad.
        env: { baseFileId: process.env.BASE_FILE_ID || '' },
        config: cfg.rows[0] || null,
        companies: cos.rows.map(r => ({
          id: r.id, name: r.name, color: r.color, active: !!r.active,
          matrix: JSON.parse(r.matrix || '[true,true,true,true,true]'),
          reps: JSON.parse(r.reps || '[]'),
          sort_order: r.sort_order,
        })),
        meetings: mtg.rows.map(r => ({
          date: r.date, assignment: r.assignment,
          obs: r.obs || '', topic: r.topic || '', fixed: !!r.fixed,
        })),
        content,
      });
    }

    // ---------- ESCRITURA ----------
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { action, group_id: groupId = 'default', password } = body;
      requireAuth(password);

      switch (action) {
        case 'saveConfig': {
          const c = body.config || {};
          await client.execute({
            sql: `INSERT INTO config (group_id, group_name, cadence_days, novedades_ratio, tecnica_ratio, meeting_day_of_week)
                  VALUES (?, ?, ?, ?, ?, ?)
                  ON CONFLICT(group_id) DO UPDATE SET
                    group_name          = excluded.group_name,
                    cadence_days        = excluded.cadence_days,
                    novedades_ratio     = excluded.novedades_ratio,
                    tecnica_ratio       = excluded.tecnica_ratio,
                    meeting_day_of_week = excluded.meeting_day_of_week`,
            args: [groupId, c.group_name ?? '', c.cadence_days ?? 42, c.novedades_ratio ?? 1, c.tecnica_ratio ?? 1, c.meeting_day_of_week ?? 3],
          });
          return res.status(200).json({ ok: true });
        }

        case 'saveMeeting': {
          await client.execute({ sql: MEETING_UPSERT, args: meetingArgs(groupId, body.meeting || {}) });
          return res.status(200).json({ ok: true });
        }

        case 'saveAllMeetings': {
          const meetings = body.meetings || [];
          if (meetings.length) {
            await client.batch(meetings.map(m => ({ sql: MEETING_UPSERT, args: meetingArgs(groupId, m) })), 'write');
          }
          return res.status(200).json({ ok: true, count: meetings.length });
        }

        case 'deleteAllMeetings': {
          await client.execute({ sql: 'DELETE FROM meetings WHERE group_id = ?', args: [groupId] });
          return res.status(200).json({ ok: true });
        }

        case 'saveCompany': {
          await client.execute({ sql: COMPANY_UPSERT, args: companyArgs(groupId, body.company || {}) });
          return res.status(200).json({ ok: true });
        }

        case 'saveAllCompanies': {
          const companies = body.companies || [];
          if (companies.length) {
            await client.batch(companies.map(c => ({ sql: COMPANY_UPSERT, args: companyArgs(groupId, c) })), 'write');
          }
          return res.status(200).json({ ok: true, count: companies.length });
        }

        case 'deleteCompany': {
          await client.execute({ sql: 'DELETE FROM companies WHERE group_id = ? AND id = ?', args: [groupId, body.id] });
          return res.status(200).json({ ok: true });
        }

        case 'deleteMeeting': {
          await client.execute({ sql: 'DELETE FROM meetings WHERE group_id = ? AND date = ?', args: [groupId, body.date] });
          return res.status(200).json({ ok: true });
        }

        case 'saveContent': {
          const key = String(body.key || '');
          if (!key) return res.status(400).json({ error: 'Falta "key"' });
          await client.execute({
            sql: `INSERT INTO content (group_id, key, data) VALUES (?, ?, ?)
                  ON CONFLICT(group_id, key) DO UPDATE SET data = excluded.data`,
            args: [groupId, key, JSON.stringify(body.data ?? null)],
          });
          return res.status(200).json({ ok: true });
        }

        // Qué hay en la base a la que está conectado ESTE despliegue.
        // Cuando un sitio apunta a una base equivocada se ve vacío y no dice
        // nada, y desde afuera no hay forma de distinguir «no hay datos» de
        // «estás mirando la base que no es». Devuelve nombres de grupo y
        // cuánto tiene cada uno; ningún dato de las empresas y ninguna
        // credencial: de la base, solo el servidor al que se conecta.
        case 'grupos': {
          const [cnt, cfg, cos, mtg] = await Promise.all([
            client.execute('SELECT group_id, COUNT(*) AS n FROM content GROUP BY group_id'),
            client.execute('SELECT group_id, group_name FROM config'),
            client.execute('SELECT group_id, COUNT(*) AS n FROM companies GROUP BY group_id'),
            client.execute('SELECT group_id, COUNT(*) AS n FROM meetings GROUP BY group_id'),
          ]);
          const grupos = {};
          const tomar = (id) => (grupos[id] = grupos[id] || { group_id: id, nombre: '', claves: 0, empresas: 0, reuniones: 0 });
          for (const r of cnt.rows) tomar(r.group_id).claves = Number(r.n);
          for (const r of cfg.rows) tomar(r.group_id).nombre = r.group_name || '';
          for (const r of cos.rows) tomar(r.group_id).empresas = Number(r.n);
          for (const r of mtg.rows) tomar(r.group_id).reuniones = Number(r.n);
          let servidor = '';
          try { servidor = new URL(process.env.TURSO_DATABASE_URL || '').host; } catch { servidor = '(no se pudo leer)'; }
          return res.status(200).json({
            servidor,
            esteGrupo: grupoPorDefecto(),
            grupos: Object.values(grupos).sort((a, b) => a.group_id.localeCompare(b.group_id)),
          });
        }

        default:
          return res.status(400).json({ error: `Acción desconocida: ${action}` });
      }
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (e) {
    console.error('API /api/db error:', e);
    return res.status(e.status || 500).json({ error: e.message || 'Error del servidor' });
  }
}
