// Vercel Serverless Function — traer, UNA SOLA VEZ, el calendario que el grupo
// venía llevando en otro sitio.
//
// Copia las fechas a la tabla `meetings`, las reglas de la agenda al bloque
// `calendario` de la configuración, y las semanas del mes en las que cada
// empresa no puede presentar a su «cuándo no puede presentar».
//
// Corre en el servidor porque el otro sitio está en otro dominio (el navegador
// no puede leerlo) y porque el token de Turso no sale de acá.
//
// No pide clave y no hace falta: **solo funciona con el calendario vacío**. Si
// el grupo ya tiene aunque sea una reunión cargada, no toca nada y lo dice. Así
// no hay forma de que pise trabajo hecho, ni por error ni por un tercero.
//
// Es un archivo de mudanza: una vez hecha, se borra.

import { createClient } from '@libsql/client/web';
import { grupoPorDefecto } from './_auth.js';
import { traducirReuniones, traducirReglas, restriccionesDesdeMatriz, empresaDestino } from './_importar.js';

// De dónde se trae NO está escrito acá: lo dice la variable
// CALENDARIO_ANTERIOR_URL del proyecto en Vercel.
const origenConfigurado = () => String(process.env.CALENDARIO_ANTERIOR_URL || '').trim();

// Turso acepta lotes, pero no ilimitados: las reuniones van de a 100.
const LOTE = 100;

const MEETING_INSERT =
  `INSERT INTO meetings (group_id, date, assignment, obs, topic, fixed)
   VALUES (?, ?, ?, ?, ?, ?)
   ON CONFLICT(group_id, date) DO NOTHING`;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    return res.status(500).json({ error: 'Faltan TURSO_DATABASE_URL y/o TURSO_AUTH_TOKEN en Vercel.' });
  }
  const origen = origenConfigurado();
  if (!origen) {
    return res.status(400).json({
      error: 'Falta cargar CALENDARIO_ANTERIOR_URL en las variables de entorno del proyecto en Vercel, ' +
             'con la dirección del calendario anterior del grupo (por ejemplo https://…/api/data).'
    });
  }

  const groupId = req.query.group_id || grupoPorDefecto();

  try {
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });

    // ── 0. El seguro: solo sobre un calendario vacío ──
    const ya = await client.execute({
      sql: 'SELECT COUNT(*) AS n FROM meetings WHERE group_id = ?',
      args: [groupId],
    });
    const yaHabia = Number(ya.rows[0]?.n || 0);
    if (yaHabia > 0) {
      return res.status(409).json({
        error: `El calendario del grupo ya tiene ${yaHabia} reuniones cargadas. No se toca nada: ` +
               'esta mudanza corre una sola vez, sobre un calendario vacío.',
        yaHabia,
      });
    }

    // ── 1. Leer el sitio anterior ──
    const r = await fetch(origen, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`El sitio anterior respondió ${r.status}`);
    const viejo = await r.json();
    if (!Array.isArray(viejo.meetings) || !viejo.meetings.length) {
      return res.status(502).json({ error: 'El sitio anterior no devolvió ninguna reunión.' });
    }

    // ── 2. Las empresas de este sitio, para traducirles el nombre ──
    const cfgRow = await client.execute({
      sql: `SELECT data FROM content WHERE group_id = ? AND key = 'config_grupo'`,
      args: [groupId],
    });
    let config = {};
    try { config = JSON.parse(cfgRow.rows[0]?.data || '{}') || {}; } catch { config = {}; }
    const empresas = Array.isArray(config.empresas) ? config.empresas : [];

    const { reuniones, sinEmpresa } = traducirReuniones(viejo.meetings, empresas);

    // ── 3. Las fechas ──
    for (let i = 0; i < reuniones.length; i += LOTE) {
      await client.batch(
        reuniones.slice(i, i + LOTE).map(m => ({
          sql: MEETING_INSERT,
          args: [groupId, m.date, m.assignment, m.obs, m.topic, m.fixed ? 1 : 0],
        })),
        'write',
      );
    }

    // ── 4. Las reglas de la agenda ──
    config.calendario = Object.assign({}, config.calendario, traducirReglas(viejo.config));

    // ── 5. Las semanas del mes en las que cada empresa no puede presentar ──
    // Solo se completa lo que está vacío: si el grupo ya escribió algo ahí, vale
    // lo suyo.
    const restricciones = [];
    for (const co of (viejo.companies || [])) {
      const texto = restriccionesDesdeMatriz(co.matrix);
      if (!texto) continue;
      const nombre = empresaDestino(co.name, empresas);
      const ficha = empresas.find(e => e.nombre === nombre);
      if (!ficha || String(ficha.noDisponible || '').trim()) continue;
      ficha.noDisponible = texto;
      restricciones.push(`${ficha.nombre}: ${texto}`);
    }

    await client.execute({
      sql: `INSERT INTO content (group_id, key, data) VALUES (?, 'config_grupo', ?)
            ON CONFLICT(group_id, key) DO UPDATE SET data = excluded.data`,
      args: [groupId, JSON.stringify(config)],
    });

    return res.status(200).json({
      ok: true,
      grupo: groupId,
      reuniones: reuniones.length,
      desde: reuniones[0]?.date,
      hasta: reuniones[reuniones.length - 1]?.date,
      reglas: config.calendario,
      restricciones,
      sinEmpresa,
    });
  } catch (e) {
    console.error('API /api/importar-calendario error:', e);
    return res.status(e.status || 500).json({ error: e.message || 'Error del servidor' });
  }
}
