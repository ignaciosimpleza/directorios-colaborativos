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
  EMAIL_COORDINACION, grupoPorDefecto, hayGrupoConfigurado, hayBase,
} from './_auth.js';
import { leerBase } from './base.js';
import { enviarMail, correoConfigurado, urlDelSitio } from './_mail.js';

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

// ── A quién avisar ──
// A los emails del equipo cargado en Configuración → El grupo → Equipo. Así
// cada grupo avisa a su propio coordinador sin tocar variables de entorno. Si
// nadie tiene email cargado, se usa AVISOS_A como red de seguridad.
async function datosDelGrupo(groupId) {
  try {
    const r = await db.execute({
      sql: `SELECT data FROM content WHERE group_id = ? AND key = 'config_grupo'`,
      args: [groupId],
    });
    const cfg = r.rows[0] ? JSON.parse(r.rows[0].data || '{}') : {};
    const equipo = (cfg.equipo || []).map(p => String(p.email || '').trim()).filter(x => x.includes('@'));
    return { nombre: (cfg.grupo || {}).nombre || 'el grupo', equipo };
  } catch {
    return { nombre: 'el grupo', equipo: [] };
  }
}

function aQuienAvisar(grupo) {
  if (grupo.equipo.length) return grupo.equipo;
  const suelto = String(process.env.AVISOS_A || '').split(/[,;\s]+/).filter(x => x.includes('@'));
  return suelto;
}

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
  if (!hayBase()) {
    return res.status(500).json({ error: 'Faltan las credenciales de la base en Vercel: cargá DB_URL y DB_TOKEN.' });
  }

  try {
    await ensureAuthSchema();

    // Estado del portero (lo consulta el sitio al arrancar)
    if (req.method === 'GET') {
      const groupId = req.query.group_id || grupoPorDefecto();
      const s = await sesionDe(req);
      // El nombre del grupo se muestra en la pantalla de acceso (antes de que
      // el sitio pueda leer la planilla de Drive), así que sale de la base.
      let grupo = '';
      try {
        const c = await db.execute({ sql: 'SELECT group_name FROM config WHERE group_id = ?', args: [groupId] });
        grupo = (c.rows[0] && c.rows[0].group_name) || '';
      } catch {}
      return res.status(200).json({
        groupId,
        // El sitio necesita saberlo para avisar en vez de mostrarse vacío
        faltaGrupoId: !hayGrupoConfigurado(),
        requireLogin: await requiereLogin(groupId),
        grupo,
        // Solo si el sitio puede enviar correo. No se expone ninguna credencial.
        correo: correoConfigurado() && !!urlDelSitio(),
        usuario: s ? { email: s.email, nombre: s.nombre, empresa: s.empresa } : null,
      });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Método no permitido' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const groupId = body.group_id || grupoPorDefecto();
    const action = body.action;

    switch (action) {
      case 'registro': {
        const email = normEmail(body.email);
        const password = String(body.password || '');
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Ingresá una dirección de correo válida.' });
        if (password.length < 6) return res.status(400).json({ error: 'La contraseña necesita al menos 6 caracteres.' });

        // Solo se puede registrar quien está en la lista de la planilla
        const lista = await listaHabilitados(groupId);
        const invitado = lista.porEmail[email];
        if (lista.hayLista && !invitado) {
          return res.status(403).json({
            error: 'Esta dirección no figura entre las habilitadas por el grupo. Solicitá a la coordinación que la incorpore y volvé a intentarlo.',
          });
        }
        const ya = await db.execute({ sql: 'SELECT estado FROM users WHERE group_id = ? AND email = ?', args: [groupId, email] });
        if (ya.rows[0]) {
          return res.status(409).json({
            error: ya.rows[0].estado === 'autorizado'
              ? 'Esta dirección ya tiene una cuenta. Iniciá sesión.'
              : 'Esta dirección ya se registró y está pendiente de autorización.',
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
        // Aviso a la coordinación: si no sale, la cuenta queda pendiente igual
        const grupo = await datosDelGrupo(groupId);
        const base = urlDelSitio();
        await enviarMail({
          para: aQuienAvisar(grupo),
          asunto: `Hay una cuenta esperando autorización · ${grupo.nombre}`,
          titulo: 'Una cuenta nueva espera autorización',
          texto: `${nombre || email} (${email})${empresa ? ` · ${empresa}` : ''} se registró en el sitio de ${grupo.nombre}. Hasta que la autorices no puede entrar.`,
          boton: base ? 'Abrir el sitio' : '',
          url: base || '',
          pie: 'Se autoriza en Configuración → El sitio → Cuentas.',
        });
        return res.status(200).json({ ok: true, pendiente: true });
      }

      case 'login': {
        const email = normEmail(body.email);
        const r = await db.execute({ sql: 'SELECT * FROM users WHERE group_id = ? AND email = ?', args: [groupId, email] });
        const u = r.rows[0];
        if (!u || !passwordOk(String(body.password || ''), u.salt, u.pass_hash)) {
          return res.status(401).json({ error: 'Email o contraseña incorrectos.' });
        }
        if (u.estado === 'bloqueado') return res.status(403).json({ error: 'Esta cuenta está bloqueada. Comunicate con la coordinación del grupo.' });
        if (u.estado !== 'autorizado') {
          return res.status(403).json({ error: 'Tu cuenta aún no fue autorizada. La coordinación del grupo la revisa y te notifica.', pendiente: true });
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
        const grupo = await datosDelGrupo(groupId);
        const base = urlDelSitio();
        const envio = base
          ? await enviarMail({
              para: email,
              asunto: `Restablecer tu contraseña · ${grupo.nombre}`,
              titulo: 'Elegí una contraseña nueva',
              texto: `Pediste restablecer la contraseña de tu cuenta en ${grupo.nombre}. El enlace vale por 24 horas.`,
              boton: 'Elegir contraseña nueva',
              url: `${base}/?reset=${encodeURIComponent(token)}`,
              pie: 'Si no fuiste vos, ignorá este mensaje: tu contraseña actual sigue funcionando.',
            })
          : { enviado: false, motivo: 'sin_sitio_url' };
        // Nunca se revela si la dirección existe: la respuesta es la misma para
        // todas. Lo único que cambia es si el sitio puede mandar correo.
        return res.status(200).json({ ok: true, correo: correoConfigurado() && !!base, enviado: envio.enviado });
      }

      case 'resetear': {
        const token = String(body.token || '');
        const password = String(body.password || '');
        if (password.length < 6) return res.status(400).json({ error: 'La contraseña necesita al menos 6 caracteres.' });
        const r = await db.execute({ sql: 'SELECT * FROM users WHERE group_id = ? AND reset_token = ?', args: [groupId, token] });
        const u = r.rows[0];
        if (!u || !u.reset_exp || u.reset_exp < ahora()) return res.status(400).json({ error: 'El enlace de restablecimiento venció. Solicitá uno nuevo.' });
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
      // La coordinación entra con la clave de edición y sin cuenta. Se le da una
      // sesión igual que a cualquiera, para que las funciones de lectura la
      // reconozcan; dura menos que una sesión común.
      case 'adminLogin': {
        pedirAdmin(body);
        const token = nuevoToken();
        await db.execute({
          sql: 'INSERT INTO sessions (token, group_id, email, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
          args: [token, groupId, EMAIL_COORDINACION, ahora(), enDias(1)],
        });
        await registrarAcceso(groupId, EMAIL_COORDINACION, 'ingreso de coordinación', req);
        return res.status(200).json({ ok: true, token, usuario: { email: EMAIL_COORDINACION, nombre: 'Coordinación', empresa: '' } });
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
        const yaEstaba = await db.execute({ sql: 'SELECT estado FROM users WHERE group_id = ? AND email = ?', args: [groupId, normEmail(body.email)] });
        await db.execute({ sql: 'UPDATE users SET estado = ? WHERE group_id = ? AND email = ?', args: [estado, groupId, email] });
        if (estado !== 'autorizado') {
          await db.execute({ sql: 'DELETE FROM sessions WHERE group_id = ? AND email = ?', args: [groupId, email] });
        }
        await registrarAcceso(groupId, email, 'cuenta ' + estado, req);
        // Se avisa solo cuando pasa a autorizada, y solo la primera vez
        if (estado === 'autorizado' && (yaEstaba.rows[0] || {}).estado !== 'autorizado') {
          const grupo = await datosDelGrupo(groupId);
          const base = urlDelSitio();
          await enviarMail({
            para: email,
            asunto: `Tu cuenta ya está habilitada · ${grupo.nombre}`,
            titulo: 'Tu cuenta ya está habilitada',
            texto: `La coordinación autorizó tu cuenta en el sitio de ${grupo.nombre}. Ya podés entrar con tu email y la contraseña que elegiste al registrarte.`,
            boton: base ? 'Entrar al sitio' : '',
            url: base || '',
          });
        }
        return res.status(200).json({ ok: true });
      }

      // Enlace de acceso generado a mano por la coordinación. Sirve cuando el
      // sitio todavía no manda correo: se copia y se le pasa a la persona por
      // el medio que sea. Mismo token y misma validez que el del correo.
      case 'enlaceReset': {
        pedirAdmin(body);
        const email = normEmail(body.email);
        const r = await db.execute({ sql: 'SELECT email FROM users WHERE group_id = ? AND email = ?', args: [groupId, email] });
        if (!r.rows[0]) return res.status(404).json({ error: 'No hay ninguna cuenta con esa dirección.' });
        const token = nuevoToken();
        await db.execute({
          sql: 'UPDATE users SET reset_token = ?, reset_exp = ? WHERE group_id = ? AND email = ?',
          args: [token, enDias(1), groupId, email],
        });
        await registrarAcceso(groupId, email, 'enlace de acceso generado', req);
        // El link lo arma el navegador con su propia dirección: no depende de
        // que SITIO_URL esté configurada.
        return res.status(200).json({ ok: true, token, horas: 24 });
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
