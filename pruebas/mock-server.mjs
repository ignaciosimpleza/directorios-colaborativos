// Server estático + mocks de /api/* para probar index.html en el navegador.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const EMPRESAS = [
  { orden: 1, slug: 'macsa', nombre: 'MACSA Agro', zona: 'Córdoba', participantes: 'Juanchi', resumen: 'Agrícola', driveFolderId: 'f-macsa' },
  { orden: 2, slug: 'el-sueno', nombre: 'El Sueño SA', zona: 'Santa Fe', participantes: 'Ana', resumen: 'Mixta', driveFolderId: 'f-sueno' },
  { orden: 3, slug: 'tricampo', nombre: 'Tricampo', zona: 'Buenos Aires', participantes: 'Luis', resumen: 'Ganadera', driveFolderId: 'f-tricampo' },
];

const BASE = {
  grupo: { nombre: 'Grupo El Faro', subtitulo: 'Directorio colaborativo de empresas agropecuarias.', tipo: 'Directorio Colaborativo', etiqueta: 'Grupo IV · Simpleza', facilitadoPor: 'Simpleza', descripcion: 'Grupo de prueba.', inicio: '2022', nombreDesde: '2023', objetivoGeneral: 'Obj general', objetivo2026: 'Obj 2026', objetivo2026Ampliado: 'Ampliado', objetivoAnioTitulo: 'Objetivo 2026', ejesTitulo: 'Ejes temáticos 2026', principios: ['Confianza', 'Continuidad'], fraseDestacada: 'Frase', equipo: [{ nombre: 'Cecilia Panizzo', rol: 'Coordinadora del grupo' }, { nombre: 'Federico C. Guyot', rol: 'Co-facilitador' }] },
  tieneListaAccesos: true,
  hitos: [{ anio: '2022', titulo: 'Arranque', desc: 'Primera reunión' }],
  ejes: [{ titulo: 'Eje 1', desc: 'Desc eje' }],
  empresas: EMPRESAS,
  eventos: [{ fecha: '23 y 24/10', titulo: 'Encuentro', descripcion: 'Anual', lugar: 'Rosario' }],
};

// Bitácora: varios archivos, algunos del mismo día (no deben contar doble)
const ACT = [
  { id: 'a1', nombre: 'Minuta 2026-06-12 MACSA', tipo: 'PDF', fecha: '2026-06-13', url: '#', carpeta: 'Proceso', ruta: ['Proceso'], empresaFolderId: 'f-macsa' },
  { id: 'a2', nombre: 'Presentación 2026-06-12 MACSA', tipo: 'PPT', fecha: '2026-06-13', url: '#', carpeta: 'Proceso', ruta: ['Proceso'], empresaFolderId: 'f-macsa' },
  { id: 'a3', nombre: 'Minuta 12-03-26', tipo: 'DOC', fecha: '2026-03-12', url: '#', carpeta: 'Proceso', ruta: ['Proceso'], empresaFolderId: 'f-macsa' },
  { id: 'a4', nombre: 'Minuta 2025-11-04', tipo: 'DOC', fecha: '2025-11-04', url: '#', carpeta: 'Proceso', ruta: ['Proceso'], empresaFolderId: 'f-macsa' },
  { id: 'a5', nombre: 'Bitácora 2026-05-20 El Sueño', tipo: 'DOC', fecha: '2026-05-20', url: '#', carpeta: 'Proceso', ruta: ['Proceso'], empresaFolderId: 'f-sueno' },
  { id: 'a6', nombre: 'Minuta 2026-02-10', tipo: 'DOC', fecha: '2026-02-10', url: '#', carpeta: 'Minutas', ruta: ['Proceso', 'Minutas'], empresaFolderId: 'f-sueno' },
  { id: 'a7', nombre: 'Tablero campaña 25-26', tipo: 'XLS', fecha: '2026-07-01', url: '#', carpeta: 'Presentaciones', ruta: ['Presentaciones'], empresaFolderId: 'f-tricampo' },
];

const ARBOL_TEC = {
  id: 'tec', nombre: '', ruta: [],
  archivos: [{ id: 't0', nombre: 'Índice del material.pdf', tipo: 'PDF', fecha: '2026-07-20', url: '#' }],
  carpetas: [
    { id: 'tec1', nombre: 'Material teórico 2026', ruta: ['Material teórico 2026'],
      archivos: [
        { id: 't1', nombre: 'Costos 2026-04-15.pdf', tipo: 'PDF', fecha: '2026-04-15', url: '#' },
        { id: 't2', nombre: 'Margen bruto 2026-05-10.xlsx', tipo: 'XLS', fecha: '2026-05-10', url: '#' },
      ],
      carpetas: [{ id: 'tec1a', nombre: 'Anexos', ruta: ['Material teórico 2026', 'Anexos'], archivos: [{ id: 't3', nombre: 'Anexo A.pdf', tipo: 'PDF', fecha: '2026-05-11', url: '#' }], carpetas: [] }] },
    { id: 'tec2', nombre: 'Material teórico 2025', ruta: ['Material teórico 2025'],
      archivos: [{ id: 't4', nombre: 'Siembra 2025-08-02.pdf', tipo: 'PDF', fecha: '2025-08-02', url: '#' }], carpetas: [] },
  ],
};

const TEC_ACT = [
  { id: 't1', nombre: 'Costos 2026-04-15.pdf', tipo: 'PDF', fecha: '2026-04-15', url: '#', carpeta: 'Material teórico 2026', ruta: ['Material teórico 2026'], empresaFolderId: 'tec' },
  { id: 't2', nombre: 'Margen bruto 2026-05-10.xlsx', tipo: 'XLS', fecha: '2026-05-10', url: '#', carpeta: 'Material teórico 2026', ruta: ['Material teórico 2026'], empresaFolderId: 'tec' },
  { id: 't4', nombre: 'Siembra 2025-08-02.pdf', tipo: 'PDF', fecha: '2025-08-02', url: '#', carpeta: 'Material teórico 2025', ruta: ['Material teórico 2025'], empresaFolderId: 'tec' },
];

// Bitácoras: una por empresa, con las reuniones que /api/bitacora ya parseó
const BITACORAS = {
  'f-macsa': { archivo: { id: 'doc-macsa', nombre: 'Proceso | MACSA Agro', url: '#' }, reuniones: [
    { fecha: '2026-08-03', titulo: 'Crecimiento empresarial, nuevas inversiones y organigrama' },
    { fecha: '2026-04-13', titulo: 'Avance Líneas Estratégicas' },
    { fecha: '2025-11-17', titulo: 'Presentación MACSA' },
    { fecha: '2025-07-21', titulo: 'Resumen de la presentación' },
    { fecha: '2024-12-12', titulo: 'Desafíos del directorio' },
    { fecha: '2024-10-24', titulo: 'Avances' },
    { fecha: '2022-09-29', titulo: 'Brechas, causas y línea estratégica' },
  ] },
  'f-sueno': { archivo: { id: 'doc-sueno', nombre: 'Proceso | El Sueño', url: '#' }, reuniones: [
    { fecha: '2026-07-13', titulo: 'Avances en delegación' },
    { fecha: '2026-02-10', titulo: 'Ordenamiento societario' },
    { fecha: '2025-08-05', titulo: 'Presentación de la empresa' },
  ] },
  'f-tricampo': { archivo: { id: 'doc-tri', nombre: 'Proceso | Tricampo.docx', url: '#' }, reuniones: [] , aviso: 'En la carpeta «Proceso» no hay ningún documento de bitácora.' },
};

const NOVEDADES = [
  { id: 'n1', nombre: 'Gaceta julio 2026.pdf', tipo: 'PDF', fecha: '2026-07-31', url: '#' },
  { id: 'n2', nombre: 'Gaceta junio 2026.pdf', tipo: 'PDF', fecha: '2026-06-30', url: '#' },
];

const hoy = new Date();
const iso = d => d.toISOString().slice(0, 10);
const masDias = n => { const d = new Date(hoy); d.setDate(d.getDate() + n); return iso(d); };

const DB = {
  config: { group_id: 'grupo4', cadence_days: 42, novedades_ratio: 1, tecnica_ratio: 1, meeting_day_of_week: 1 },
  companies: [],
  meetings: [
    { date: masDias(9), assignment: 'MACSA Agro', obs: '', topic: '', fixed: true },
    { date: masDias(30), assignment: 'El Sueño SA', obs: '', topic: '', fixed: false },
    { date: masDias(-20), assignment: 'Tricampo', obs: '', topic: '', fixed: false },
  ],
  env: { baseFileId: '' },
  content: {
    drive_config: { baseFileId: 'base', tecnicasFolderId: 'tec', novedadesFolderId: 'nov', herramientasUrl: 'https://www.simpleza.com.ar/' },
  },
};

const json = (res, obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

// ── mock de /api/auth (en memoria) ──
const AUTH = { requireLogin: false, users: [], sessions: {}, log: [] };
const HABILITADOS = { 'macsa@ejemplo.com': { empresa: 'MACSA Agro', nombre: 'Juanchi' }, 'elsueno@ejemplo.com': { empresa: 'El Sueño SA', nombre: 'Ana' } };
const EDIT_PASSWORD = 'faro26';

function authHandler(req, res, body, token) {
  const p = JSON.parse(body || '{}');
  const admin = () => p.password === EDIT_PASSWORD;
  const find = e => AUTH.users.find(u => u.email === String(e || '').toLowerCase());
  switch (p.action) {
    case 'registro': {
      if (find(p.email)) return json(res, { error: 'Ese email ya se registró y está esperando autorización.' }, 409);
      if (String(p.password || '').length < 6) return json(res, { error: 'La contraseña necesita al menos 6 caracteres.' }, 400);
      const inv = HABILITADOS[String(p.email || '').toLowerCase()];
      if (!inv) return json(res, { error: 'Ese email no figura en la lista del grupo. Pedile a la coordinación que lo agregue a la pestaña ACCESOS de la planilla y volvé a intentar.' }, 403);
      AUTH.users.push({ email: String(p.email).toLowerCase(), nombre: p.nombre, empresa: p.empresa, password: p.password, estado: 'pendiente', created_at: new Date().toISOString() });
      AUTH.log.push({ email: p.email, evento: 'registro', ts: new Date().toISOString() });
      return json(res, { ok: true, pendiente: true });
    }
    case 'login': {
      const u = find(p.email);
      if (!u || u.password !== p.password) return json(res, { error: 'Email o contraseña incorrectos.' }, 401);
      if (u.estado !== 'autorizado') return json(res, { error: 'Tu cuenta todavía no fue autorizada. El equipo del grupo la revisa y te avisa.' }, 403);
      const t = 'tok' + Math.random().toString(16).slice(2);
      AUTH.sessions[t] = u.email;
      AUTH.log.push({ email: u.email, evento: 'ingreso', ts: new Date().toISOString() });
      return json(res, { token: t, usuario: { email: u.email, nombre: u.nombre, empresa: u.empresa } });
    }
    case 'logout': { delete AUTH.sessions[token]; return json(res, { ok: true }); }
    case 'adminLogin': return admin() ? json(res, { ok: true }) : json(res, { error: 'No autorizado' }, 401);
    case 'usuarios': return admin() ? json(res, { listaAccesos: { activa: true, habilitados: Object.keys(HABILITADOS).length }, usuarios: AUTH.users.map(u => ({ ...u, reset: false, resetToken: '' })) }) : json(res, { error: 'No autorizado' }, 401);
    case 'accesos': return admin() ? json(res, { accesos: AUTH.log.slice(-30).reverse() }) : json(res, { error: 'No autorizado' }, 401);
    case 'estado': {
      if (!admin()) return json(res, { error: 'No autorizado' }, 401);
      const u = find(p.email); if (u) u.estado = p.estado;
      return json(res, { ok: true });
    }
    case 'borrar': {
      if (!admin()) return json(res, { error: 'No autorizado' }, 401);
      AUTH.users = AUTH.users.filter(u => u.email !== String(p.email).toLowerCase());
      return json(res, { ok: true });
    }
    case 'requerirLogin': {
      if (!admin()) return json(res, { error: 'No autorizado' }, 401);
      AUTH.requireLogin = !!p.valor;
      return json(res, { ok: true, requireLogin: AUTH.requireLogin });
    }
    case 'pedirReset': return json(res, { ok: true });
    // solo para las pruebas: deja el mock como recién arrancado
    case '_reset': {
      AUTH.requireLogin = false; AUTH.users = []; AUTH.sessions = {}; AUTH.log = [];
      DB.content = { drive_config: { baseFileId: 'base', tecnicasFolderId: 'tec', novedadesFolderId: 'nov', herramientasUrl: 'https://www.simpleza.com.ar/' } };
      return json(res, { ok: true });
    }
    default: return json(res, { error: 'Acción desconocida' }, 400);
  }
}

const tokenDe = req => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
const sesionValida = req => !!AUTH.sessions[tokenDe(req)];
const cortaPorLogin = (req, res) => {
  if (AUTH.requireLogin && !sesionValida(req)) { json(res, { error: 'Necesitás iniciar sesión.', login: true }, 401); return true; }
  return false;
};

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/api/auth') {
    if (req.method === 'GET') {
      const email = AUTH.sessions[tokenDe(req)];
      const us = AUTH.users.find(x => x.email === email);
      return json(res, { requireLogin: AUTH.requireLogin, usuario: us ? { email: us.email, nombre: us.nombre, empresa: us.empresa } : null });
    }
    let b = ''; req.on('data', c => b += c);
    req.on('end', () => authHandler(req, res, b, tokenDe(req)));
    return;
  }
  if (u.pathname.startsWith('/api/') && u.searchParams.get('op') !== 'whoami' && cortaPorLogin(req, res)) return;
  if (u.pathname === '/api/db') {
    if (req.method === 'POST') {
      let b = ''; req.on('data', c => b += c);
      req.on('end', () => {
        try {
          const p = JSON.parse(b || '{}');
          if (p.action === 'saveContent') DB.content[p.key] = p.data;
        } catch {}
        json(res, { ok: true });
      });
      return;
    }
    return json(res, DB);
  }
  if (u.pathname === '/api/base') return json(res, BASE);
  if (u.pathname === '/api/bitacora') {
    const b = BITACORAS[u.searchParams.get('folderId')];
    return json(res, b || { reuniones: [], aviso: 'sin carpeta Proceso' });
  }
  if (u.pathname === '/api/drive') {
    const op = u.searchParams.get('op') || 'list';
    if (op === 'whoami') return json(res, { email: 'grupofaro@grupofaro.iam.gserviceaccount.com' });
    if (op === 'actividad') {
      const ids = (u.searchParams.get('folderIds') || '').split(',');
      if (ids.includes('tec')) return json(res, { items: TEC_ACT });
      return json(res, { items: ACT.filter(i => ids.includes(i.empresaFolderId)) });
    }
    if (op === 'arbol') return json(res, { arbol: ARBOL_TEC });
    if (op === 'descubrir') return json(res, {
      carpetas: [{ id: 'tec', nombre: '1. Material teórico' }, { id: 'emp', nombre: '2. Empresas y procesos' }],
      archivos: [], 
      sugerencias: { tecnicasFolderId: 'tec', baseFileId: 'base', logoFileId: 'logo1' },
      detalle: [{ campo: 'tecnicasFolderId', id: 'tec', nombre: '1. Material teórico' },
                { campo: 'baseFileId', id: 'base', nombre: 'Base_Estructurada.xlsx' },
                { campo: 'logoFileId', id: 'logo1', nombre: 'Logo del grupo.png' }],
    });
    if (op === 'imagen') { res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      return res.end('<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'40\' height=\'40\'><circle cx=\'20\' cy=\'20\' r=\'18\' fill=\'#32E8A9\'/></svg>'); }
    if (op === 'list') {
      const fid = u.searchParams.get('folderId');
      if (fid === 'nov') return json(res, { files: NOVEDADES });
      return json(res, { files: [] });
    }
    return json(res, { error: 'op desconocida' });
  }
  // estáticos
  const f = path.join(ROOT, u.pathname === '/' ? 'index.html' : u.pathname.slice(1));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  const ext = path.extname(f);
  const ct = { '.html': 'text/html', '.png': 'image/png', '.js': 'text/javascript', '.xlsx': 'application/octet-stream' }[ext] || 'text/plain';
  res.writeHead(200, { 'Content-Type': ct });
  res.end(fs.readFileSync(f));
}).listen(8099, () => console.log('mock server en http://localhost:8099'));
