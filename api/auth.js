// Vercel Serverless Function — registro, login y control de accesos.
//
// Acordado con el grupo: una cuenta por empresa, autogestionada, pero la
// primera vez la tiene que autorizar el equipo. Queda registro de quién entró
// y cuándo.
//
// POST /api/auth  { action, … }
//   registro      { email, password, nombre, empresa }   → cuenta pendiente
//   login         { email, password }                    → { token, usuario }
//   logout        { }                                    → cierra la sesión
//   yo            { }                                    → sesión actual
//   pedirReset    { email }                              → genera token de reset
//   resetear      { token, password }                    → cambia la contraseña
//  (admin, con la clave de edición)
//   usuarios      { password }                           → lista de cuentas
//   estado        { password, email, estado }            → autorizar / bloquear
//   borrar        { password, email }
//   accesos       { password, limit }                    → últimos ingresos
//   requerirLogin { password, valor }                    → prende o apaga el portero

import {
  db, ensureAuthSchema, ahora, normEmail, hashPassword, passwordOk, nuevoToken,
  tokenDeRequest, sesionDe, esAdmin, invalidarCacheAcceso, requiereLogin,
} from './_auth.js';
import { leerBase } from './base.js';

const DIAS_SESION = 30;

// ── Quién tiene permitido crear cuenta ──
// Sale de la pestaña ACCESOS de la planilla base (columnas email, empresa,
// nombre). Si esa pestaña existe, NADIE fuera de esa lista puede registrarse:
// un mail inventado rebota en el acto. Si no existe, cualquiera puede
// registrarse pero igual queda pendiente de autorización manual.
const cacheLista = { v: null, hasta: 0 };

async function listaHabilitados(groupId) {
  const t = Date.now();
  if (cacheLista.v && t < cacheLista.hasta) return cacheLista.v;
  let fileId = process.env.BASE_FILE_ID || '';
  try {
    const r = await db.execute({
      sql: `SELECT data FROM content WHERE group_id = ? AND key = 'drive_config'`,
      args: [groupId],
    });
    if (r.rows[0]) {
      const cfg = JSON.parse(r.rows[0].data || '{}');
      if (cfg.baseFileId) fileId = cfg.baseFileId;
    }
  } catch {}
  if (!fileId) return (cacheLista.v = { hayLista: false, porEmail: {} }, cacheLista.hasta = t + 60000, cacheLista.v);
  try {
    const base = await leerBase(fileId);
    const porEmail = {};
    (base.accesos || []).forEach(a => { porEmail[a.email] = a; });
    cacheLista.v = { hayLista: (base.accesos || []).length > 0, porEmail };
  } catch (e) {
    console.warn('No se pudo leer la lista de accesos de la planilla:', e.message);
    // Si la planilla no se puede leer, no se abre la puerta: se rechaza el
    // registro nuevo hasta que la fuente vuelva.
    cacheLista.v = { hayLista: true, porEmail: {}, error: e.message };
  }
  cacheLista.hasta = t + 60000;
  return cacheLista.v;
}

const enDias = n => new Date(Date.now() + n * 86400000).toISOString();

async function registrarAcceso(groupId, email, evento, req) {
  try {
    await db.execute({
      sql: 'INSERT INTO access_log (group_id, email, evento, ts, ua) VALUES (?, ?, ?, ?, ?)',
      args: [groupId, email, evento, ahora(), String(req.headers['user-agent'] || '').slice(0, 200)],
    });
  } catch (e) { console.warn('No se pudo registrar el acceso:', e.message); }
}

function pedirAdmin(body) {
  if (!esAdmin(body.password)) {
    const err = new Error('No autorizado');
    err.status = 401;
    throw err;
  }
}

export default async function handler(req, res) {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    return res.status(500).json({ error: 'Faltan TURSO_DATABASE_URL y/o TURSO_AUTH_TOKEN en Vercel.' });
  }

  try {
    await ensureAuthSchema();

    // Estado del portero (lo consulta el sitio al arrancar)
    if (req.method === 'GET') {
      const groupId = req.query.group_id || 'grupo4';
      const s = await sesionDe(req);
      // El nombre del grupo se muestra en la pantalla de acceso (antes de que
      // el sitio pueda leer la planilla de Drive), así que sale de la base.
      let grupo = '';
      try {
        const c = await db.execute({ sql: 'SELECT group_name FROM config WHERE group_id = ?', args: [groupId] });
        grupo = (c.rows[0] && c.rows[0].group_name) || '';
      } catch {}
      return res.status(200).json({
        requireLogin: await requiereLogin(groupId),
        grupo,
        usuario: s ? { email: s.email, nombre: s.nombre, empresa: s.empresa } : null,
      });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Método no permitido' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const groupId = body.group_id || 'grupo4';
    const action = body.action;

    switch (action) {
      case 'registro': {
        const email = normEmail(body.email);
        const password = String(body.password || '');
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Pegá un email válido.' });
        if (password.length < 6) return res.status(400).json({ error: 'La contraseña necesita al menos 6 caracteres.' });

        // Solo se puede registrar quien está en la lista de la planilla
        const lista = await listaHabilitados(groupId);
        const invitado = lista.porEmail[email];
        if (lista.hayLista && !invitado) {
          return res.status(403).json({
            error: 'Ese email no figura en la lista del grupo. Pedile a la coordinación que lo agregue a la pestaña ACCESOS de la planilla y volvé a intentar.',
          });
        }
        const ya = await db.execute({ sql: 'SELECT estado FROM users WHERE group_id = ? AND email = ?', args: [groupId, email] });
        if (ya.rows[0]) {
          return res.status(409).json({
            error: ya.rows[0].estado === 'autorizado'
              ? 'Ese email ya tiene cuenta. Iniciá sesión.'
              : 'Ese email ya se registró y está esperando autorización.',
          });
        }
        const { salt, hash } = hashPassword(password);
        // El nombre y la empresa que valen son los de la planilla, no los que
        // escriba quien se registra.
        const nombre = (invitado && invitado.nombre) || String(body.nombre || '').slice(0, 120);
        const empresa = (invitado && invitado.empresa) || String(body.empresa || '').slice(0, 120);
        await db.execute({
          sql: `INSERT INTO users (group_id, email, nombre, empresa, pass_hash, salt, estado, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 'pendiente', ?)`,
          args: [groupId, email, nombre, empresa, hash, salt, ahora()],
        });
        await registrarAcceso(groupId, email, 'registro', req);
        return res.status(200).json({ ok: true, pendiente: true });
      }

      case 'login': {
        const email = normEmail(body.email);
        const r = await db.execute({ sql: 'SELECT * FROM users WHERE group_id = ? AND email = ?', args: [groupId, email] });
        const u = r.rows[0];
        if (!u || !passwordOk(String(body.password || ''), u.salt, u.pass_hash)) {
          return res.status(401).json({ error: 'Email o contraseña incorrectos.' });
        }
        if (u.estado === 'bloqueado') return res.status(403).json({ error: 'Esta cuenta está bloqueada. Escribile al equipo del grupo.' });
        if (u.estado !== 'autorizado') {
          return res.status(403).json({ error: 'Tu cuenta todavía no fue autorizada. El equipo del grupo la revisa y te avisa.', pendiente: true });
        }
        const token = nuevoToken();
        await db.execute({
          sql: 'INSERT INTO sessions (token, group_id, email, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
          args: [token, groupId, email, ahora(), enDias(DIAS_SESION)],
        });
        await registrarAcceso(groupId, email, 'ingreso', req);
        return res.status(200).json({ token, usuario: { email, nombre: u.nombre, empresa: u.empresa } });
      }

      case 'logout': {
        const token = tokenDeRequest(req) || body.token;
        if (token) await db.execute({ sql: 'DELETE FROM sessions WHERE token = ?', args: [token] });
        return res.status(200).json({ ok: true });
      }

      case 'yo': {
        const s = await sesionDe(req);
        return res.status(200).json({ usuario: s ? { email: s.email, nombre: s.nombre, empresa: s.empresa } : null });
      }

      case 'pedirReset': {
        const email = normEmail(body.email);
        const r = await db.execute({ sql: 'SELECT email FROM users WHERE group_id = ? AND email = ?', args: [groupId, email] });
        // No se revela si el email existe o no
        if (!r.rows[0]) return res.status(200).json({ ok: true });
        const token = nuevoToken();
        await db.execute({
          sql: 'UPDATE users SET reset_token = ?, reset_exp = ? WHERE group_id = ? AND email = ?',
          args: [token, enDias(1), groupId, email],
        });
        await registrarAcceso(groupId, email, 'pidió reset', req);
        return res.status(200).json({ ok: true });
      }

      case 'resetear': {
        const token = String(body.token || '');
        const password = String(body.password || '');
        if (password.length < 6) return res.status(400).json({ error: 'La contraseña necesita al menos 6 caracteres.' });
        const r = await db.execute({ sql: 'SELECT * FROM users WHERE group_id = ? AND reset_token = ?', args: [groupId, token] });
        const u = r.rows[0];
        if (!u || !u.reset_exp || u.reset_exp < ahora()) return res.status(400).json({ error: 'El link de reset venció. Pedí uno nuevo.' });
        const { salt, hash } = hashPassword(password);
        await db.execute({
          sql: 'UPDATE users SET pass_hash = ?, salt = ?, reset_token = NULL, reset_exp = NULL WHERE group_id = ? AND email = ?',
          args: [hash, salt, groupId, u.email],
        });
        await registrarAcceso(groupId, u.email, 'cambió la contraseña', req);
        return res.status(200).json({ ok: true });
      }

      // ───────── administración (clave de edición) ─────────
      // Valida la clave de edición contra la variable de Vercel, para que no
      // tenga que estar escrita en el HTML del sitio.
      case 'adminLogin': {
        pedirAdmin(body);
        return res.status(200).json({ ok: true });
      }

      case 'usuarios': {
        pedirAdmin(body);
        const r = await db.execute({
          sql: `SELECT email, nombre, empresa, estado, created_at, reset_token, reset_exp
                FROM users WHERE group_id = ? ORDER BY created_at DESC`,
          args: [groupId],
        });
        const lista = await listaHabilitados(groupId);
        return res.status(200).json({
          listaAccesos: { activa: !!lista.hayLista, habilitados: Object.keys(lista.porEmail).length, error: lista.error || '' },
          usuarios: r.rows.map(u => ({
            email: u.email, nombre: u.nombre || '', empresa: u.empresa || '', estado: u.estado,
            created_at: u.created_at || '',
            reset: !!(u.reset_token && u.reset_exp && u.reset_exp > ahora()),
            resetToken: (u.reset_token && u.reset_exp && u.reset_exp > ahora()) ? u.reset_token : '',
          })),
        });
      }

      case 'estado': {
        pedirAdmin(body);
        const email = normEmail(body.email);
        const estado = ['pendiente', 'autorizado', 'bloqueado'].includes(body.estado) ? body.estado : 'pendiente';
        await db.execute({ sql: 'UPDATE users SET estado = ? WHERE group_id = ? AND email = ?', args: [estado, groupId, email] });
        if (estado !== 'autorizado') {
          await db.execute({ sql: 'DELETE FROM sessions WHERE group_id = ? AND email = ?', args: [groupId, email] });
        }
        await registrarAcceso(groupId, email, 'cuenta ' + estado, req);
        return res.status(200).json({ ok: true });
      }

      case 'borrar': {
        pedirAdmin(body);
        const email = normEmail(body.email);
        await db.batch([
          { sql: 'DELETE FROM users WHERE group_id = ? AND email = ?', args: [groupId, email] },
          { sql: 'DELETE FROM sessions WHERE group_id = ? AND email = ?', args: [groupId, email] },
        ], 'write');
        return res.status(200).json({ ok: true });
      }

      case 'accesos': {
        pedirAdmin(body);
        const limit = Math.min(parseInt(body.limit) || 50, 200);
        const r = await db.execute({
          sql: 'SELECT email, evento, ts FROM access_log WHERE group_id = ? ORDER BY id DESC LIMIT ?',
          args: [groupId, limit],
        });
        return res.status(200).json({ accesos: r.rows.map(a => ({ email: a.email, evento: a.evento, ts: a.ts })) });
      }

      case 'requerirLogin': {
        pedirAdmin(body);
        await db.execute({
          sql: `INSERT INTO content (group_id, key, data) VALUES (?, 'auth_config', ?)
                ON CONFLICT(group_id, key) DO UPDATE SET data = excluded.data`,
          args: [groupId, JSON.stringify({ requireLogin: !!body.valor })],
        });
        invalidarCacheAcceso();
        return res.status(200).json({ ok: true, requireLogin: !!body.valor });
      }

      default:
        return res.status(400).json({ error: `Acción desconocida: ${action}` });
    }
  } catch (e) {
    console.error('API /api/auth error:', e);
    return res.status(e.status || 500).json({ error: e.message || 'Error del servidor' });
  }
}
