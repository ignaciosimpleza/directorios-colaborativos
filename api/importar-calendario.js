// Vercel Serverless Function — traer el calendario del sitio anterior del grupo.
//
// Si el grupo venía llevando sus reuniones en otro sitio, esta función las lee
// de allá y las guarda acá: las fechas van a la tabla `meetings` y las reglas de
// la agenda al bloque `calendario` de la configuración del grupo.
//
// Corre en el servidor porque el navegador no puede leer el otro sitio (está en
// otro dominio) y porque el token de Turso no sale de acá.
//
// Se pide desde el sitio (Calendario → «Traer el calendario anterior»), en modo
// edición. La clave es la misma de siempre: EDIT_PASSWORD.

import { createClient } from '@libsql/client/web';
import { grupoPorDefecto } from './_auth.js';
import { traducirReuniones, traducirReglas } from './_importar.js';

// Cuál es el sitio anterior NO está escrito acá: lo dice la variable
// CALENDARIO_ANTERIOR_URL del proyecto en Vercel. Así el mismo código sirve para
// cualquier grupo, igual que el resto del sitio.
const origenConfigurado = () => String(process.env.CALENDARIO_ANTERIOR_URL || '').trim();

// Turso acepta lotes, pero no ilimitados: las reuniones van de a 100.
const LOTE = 100;

const MEETING_UPSERT =
  `INSERT INTO meetings (group_id, date, assignment, obs, topic, fixed)
   VALUES (?, ?, ?, ?, ?, ?)
   ON CONFLICT(group_id, date) DO UPDATE SET
     assignment = excluded.assignment,
     obs        = excluded.obs,
     topic      = excluded.topic,
     fixed      = excluded.fixed`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    return res.status(500).json({
      error: 'Faltan las variables de entorno TURSO_DATABASE_URL y/o TURSO_AUTH_TOKEN en Vercel.'
    });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const esperada = process.env.EDIT_PASSWORD;
  if (!esperada) {
    return res.status(500).json({ error: 'Falta configurar EDIT_PASSWORD en Vercel: sin esa clave nadie puede editar.' });
  }
  if (body.password !== esperada) return res.status(401).json({ error: 'No autorizado' });

  const groupId = body.group_id || grupoPorDefecto();
  const origen = origenConfigurado();
  if (!origen) {
    return res.status(400).json({
      error: 'Falta cargar CALENDARIO_ANTERIOR_URL en las variables de entorno del proyecto en Vercel, ' +
             'con la dirección del calendario anterior del grupo (por ejemplo https://…/api/data).'
    });
  }

  try {
    // ── 1. Leer el sitio anterior ──
    const r = await fetch(origen, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`El sitio anterior respondió ${r.status}`);
    const viejo = await r.json();
    if (!Array.isArray(viejo.meetings) || !viejo.meetings.length) {
      return res.status(502).json({ error: 'El sitio anterior no devolvió ninguna reunión.' });
    }

    const client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });

    // ── 2. Las empresas de este sitio, para traducirles el nombre ──
    const cfgRow = await client.execute({
      sql: `SELECT data FROM content WHERE group_id = ? AND key = 'config_grupo'`,
      args: [groupId],
    });
    let config = {};
    try { config = JSON.parse(cfgRow.rows[0]?.data || '{}') || {}; } catch { config = {}; }
    const empresas = Array.isArray(config.empresas) ? config.empresas : [];

    const { reuniones, sinEmpresa } = traducirReuniones(viejo.meetings, empresas);

    // ── 3. Guardar las fechas ──
    // Es un alta o actualización por fecha: no borra nada que ya esté cargado
    // acá y que el sitio anterior no tenga.
    for (let i = 0; i < reuniones.length; i += LOTE) {
      await client.batch(
        reuniones.slice(i, i + LOTE).map(m => ({
          sql: MEETING_UPSERT,
          args: [groupId, m.date, m.assignment, m.obs, m.topic, m.fixed ? 1 : 0],
        })),
        'write',
      );
    }

    // ── 4. Guardar las reglas de la agenda ──
    const reglas = traducirReglas(viejo.config);
    config.calendario = Object.assign({}, config.calendario, reglas);
    await client.execute({
      sql: `INSERT INTO content (group_id, key, data) VALUES (?, 'config_grupo', ?)
            ON CONFLICT(group_id, key) DO UPDATE SET data = excluded.data`,
      args: [groupId, JSON.stringify(config)],
    });

    return res.status(200).json({ ok: true, reuniones: reuniones.length, sinEmpresa, reglas });
  } catch (e) {
    console.error('API /api/importar-calendario error:', e);
    return res.status(e.status || 500).json({ error: e.message || 'Error del servidor' });
  }
}
