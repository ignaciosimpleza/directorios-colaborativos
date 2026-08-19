// Server estático + mocks de /api/* para probar index.html en el navegador.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// Nombres tal cual están en la planilla real del grupo. Ojo: CONFIG_DRIVE está
// VACÍA (ninguna trae driveFolderId), como en la planilla de verdad.
const EMPRESAS = [
  { orden: 1, slug: 'el-motivo', nombre: 'El Motivo S.A.', zona: 'Río Cuarto', participantes: 'Adriana Ponzio', resumen: 'Agrícola' },
  { orden: 2, slug: 'tricampo', nombre: 'Tricampo S.A.', zona: 'Frías', participantes: 'Alejandro Stoppa', resumen: 'Mixta' },
  { orden: 3, slug: 'macsa', nombre: 'MACSA Agro', zona: 'General Levalle', participantes: 'Carlos Vidal', resumen: 'Agrícola-ganadera',
    noDisponible: 'diciembre a febrero', noDisponibleReglas: [{ tipo: 'meses', desde: 12, hasta: 2, anio: null }] },
  { orden: 4, slug: 'el-sueno', nombre: 'Agropecuaria El Sueño', zona: 'Tucumán', participantes: 'Sebastián Valdez', resumen: 'Diversificada' },
  { orden: 5, slug: 'el-porvenir', nombre: 'El Porvenir / Beheran Sarciat S.A.', zona: 'Ayacucho', participantes: 'Alfredo Beheran y Juanchi', resumen: 'Ganadera' },
  { orden: 6, slug: 'donato-alvarez', nombre: 'Donato Álvarez S.R.L.', zona: 'Alberdi', participantes: 'José Luis Cebe', resumen: 'Citrícola' },
  { orden: 7, slug: 'rubro-agropecuario', nombre: 'Rubro Agropecuario S.R.L. / Fideicomiso Rubro Producción', zona: 'Quimilí', participantes: 'Manuel Monedero', resumen: 'Servicios' },
  { orden: 8, slug: 'altos-de-bermudez', nombre: 'Altos de Bermúdez S.A.', zona: 'Lincoln', participantes: 'Alfredo Moreno', resumen: 'Agroindustrial' },
  { orden: 9, slug: 'estudio-becker', nombre: 'Estudio Tomás Becker', zona: 'Azul', participantes: 'Tomás Becker', resumen: 'Gerenciamiento', activa: false },
];

// Carpetas tal cual se llaman en el Drive real del grupo
const CARPETAS_EMPRESAS = [
  { id: 'f-donato', nombre: 'Donato Alvarez SRL', tipo: 'Carpeta', fecha: '', url: '#' },
  { id: 'f-beheran', nombre: 'Beheran Sarciat SA', tipo: 'Carpeta', fecha: '', url: '#' },
  { id: 'f-sueno', nombre: 'El Sueño', tipo: 'Carpeta', fecha: '', url: '#' },
  { id: 'f-altos', nombre: 'Altos de Bermúdez SA', tipo: 'Carpeta', fecha: '', url: '#' },
  { id: 'f-rubro', nombre: 'Rubro Agropecuario', tipo: 'Carpeta', fecha: '', url: '#' },
  { id: 'f-becker', nombre: 'Estudio Becker', tipo: 'Carpeta', fecha: '', url: '#' },
  { id: 'f-tricampo', nombre: 'Tricampo', tipo: 'Carpeta', fecha: '', url: '#' },
  { id: 'f-motivo', nombre: 'El Motivo', tipo: 'Carpeta', fecha: '', url: '#' },
  { id: 'f-macsa', nombre: 'Macsa Agro', tipo: 'Carpeta', fecha: '', url: '#' },
];

const BASE = {
  grupo: { nombre: 'Grupo El Faro', subtitulo: 'Directorio colaborativo de empresas agropecuarias.', tipo: 'Directorio Colaborativo', etiqueta: 'Grupo IV · Simpleza', facilitadoPor: 'Simpleza', descripcion: 'Grupo de prueba.', inicio: '2022', nombreDesde: '2023', objetivoGeneral: 'Obj general', objetivo2026: 'Obj 2026', objetivo2026Ampliado: 'Ampliado', objetivoAnioTitulo: 'Objetivo 2026', ejesTitulo: 'Ejes temáticos 2026', principios: ['Confianza', 'Continuidad'], fraseDestacada: 'Frase', equipo: [{ nombre: 'Cecilia Panizzo', rol: 'Coordinadora del grupo' }, { nombre: 'Federico C. Guyot', rol: 'Co-facilitador' }] },
  tieneListaAccesos: true,
  hitos: [{ anio: '2022', titulo: 'Arranque', desc: 'Primera reunión' }],
  ejes: [{ titulo: 'Eje 1', desc: 'Desc eje' }],
  empresas: EMPRESAS,
  eventos: [{ fecha: '23 y 24/10', titulo: 'Encuentro', descripcion: 'Anual', lugar: 'Rosario' }],
  calendario: { diaSemana: 1, hora: '08:00', cadenciaSemanas: 1, saltarFeriados: true, semanasEntrePresentaciones: 26, proporcionRonda: 1, proporcionTecnica: 2 },
  sinReunion: [{ desde: '2027-01-04', hasta: '2027-01-25', motivo: 'Receso de enero' }],
  avisos: ['EMPRESAS · Tricampo S.A.: no se entendió «cuando termine la cosecha» en la columna no_disponible.'],
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

const ARBOL_HERR = {
  id: 'herr', nombre: '', ruta: [],
  archivos: [{ id: 'h0', nombre: 'Tablero de comando.xlsx', tipo: 'XLS', fecha: '2026-06-01', url: '#' }],
  carpetas: [
    { id: 'herr1', nombre: 'Matrices', ruta: ['Matrices'],
      archivos: [{ id: 'h1', nombre: 'Matriz de riesgos.xlsx', tipo: 'XLS', fecha: '2026-05-04', url: '#' }],
      carpetas: [] },
    // Subcarpeta armada pero todavía sin nada adentro. Es lo normal en Drive, y
    // alcanzaba para que la tarjeta entera desapareciera.
    { id: 'herr2', nombre: 'Plantillas', ruta: ['Plantillas'], archivos: [], carpetas: [] },
  ],
};

// Calcada de la carpeta real de Reuniones Técnicas del Grupo El Faro: la raíz
// NO tiene archivos sueltos, todo cuelga de subcarpetas por año y por mes. Es
// la forma que dejaba la tarjeta vacía.
const ARBOL_ANIDADO = {
  id: 'anidado', nombre: '', ruta: [], archivos: [],
  carpetas: [
    { id: 'a2025', nombre: '2025', ruta: ['2025'], archivos: [],
      carpetas: [
        { id: 'a2025-02', nombre: '02. Febrero', ruta: ['2025', '02. Febrero'],
          archivos: [{ id: 'x1', nombre: 'Costos febrero.pdf', tipo: 'PDF', fecha: '2025-02-11', url: '#' }],
          carpetas: [] },
        { id: 'a2025-03', nombre: '03. Marzo', ruta: ['2025', '03. Marzo'], archivos: [], carpetas: [] },
      ] },
    { id: 'a2026', nombre: '2026', ruta: ['2026'],
      archivos: [{ id: 'x2', nombre: 'Análisis de negocios e inversiones.pptx', tipo: 'PPTX', fecha: '2026-06-02', url: '#' }],
      carpetas: [{ id: 'a2026-cal', nombre: 'Calendarios en imagen', ruta: ['2026', 'Calendarios en imagen'], archivos: [], carpetas: [] }] },
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
    { fecha: '2026-08-03', numero: 7, titulo: 'Crecimiento empresarial, nuevas inversiones y organigrama',
      frase: 'La reunión se centró en el plan de inversiones para la campaña que viene y en cómo el organigrama actual sostiene ese crecimiento.' },
    { fecha: '2026-04-13', numero: 6, titulo: 'Avance Líneas Estratégicas',
      frase: 'Se repasó el avance de las tres líneas estratégicas definidas el año pasado y se acordó revisar los indicadores de la segunda.' },
    { fecha: '2025-11-17', numero: 5, titulo: 'Presentación MACSA', frase: '' },
    { fecha: '2025-07-21', numero: 4, titulo: 'Resumen de la presentación',
      frase: 'El grupo aportó sobre la delegación de decisiones operativas y la necesidad de separar el rol de dueño del de gerente.' },
    { fecha: '2024-12-12', numero: 3, titulo: 'Desafíos del directorio', frase: '' },
    { fecha: '2024-10-24', numero: 2, titulo: 'Avances', frase: '' },
    { fecha: '2022-09-29', numero: 1, titulo: 'Brechas, causas y línea estratégica', frase: '' },
  ] },
  'f-sueno': { archivo: { id: 'doc-sueno', nombre: 'Proceso | El Sueño', url: '#' }, reuniones: [
    { fecha: '2026-07-13', numero: 3, titulo: 'Avances en delegación',
      frase: 'Se presentó el avance del proceso de delegación y el grupo trabajó sobre qué decisiones siguen dependiendo del dueño.' },
    // Sin frase: su bitácora no trae un párrafo de contenido debajo de la fecha
    { fecha: '2026-02-10', numero: 2, titulo: 'Ordenamiento societario', frase: '' },
    { fecha: '2025-08-05', numero: 1, titulo: 'Presentación de la empresa', frase: '' },
  ] },
  'f-tricampo': { archivo: { id: 'doc-tri', nombre: 'Proceso | Tricampo.docx', url: '#' }, reuniones: [] , aviso: 'En la carpeta «Proceso» no hay ningún documento de bitácora.' },
  'f-beheran': { archivo: { id: 'doc-beheran', nombre: 'Proceso | Beheran Sarciat SA', url: '#' }, reuniones: [
    { fecha: '2026-06-01', numero: 2, titulo: 'Reunión de Accionistas', frase: 'La reunión estuvo centrada en la gobernanza y en cómo preparar una reunión de accionistas que habilite decisiones de crecimiento.' },
    { fecha: '2026-02-09', numero: 1, titulo: 'Primera presentación de la empresa', anioDeducido: true, frase: 'Se presentó la empresa: ciclo completo sobre campo alquilado, con foco en cría y recría y un proceso de reorganización en curso.' },
  ] },
  'f-motivo': { archivo: { id: 'doc-motivo', nombre: 'Proceso El Motivo', url: '#' }, reuniones: [
    { fecha: '2026-06-29', numero: 7, titulo: 'Reunión El Motivo', frase: 'La reunión estuvo centrada en revisar el trabajo realizado luego de la presentación del proyecto inmobiliario y en analizar cómo avanzar en el ordenamiento patrimonial.' },
    { fecha: '2025-12-22', numero: 6, titulo: 'Avance en LE: Minuta de Reunión', frase: 'Federico repasa que en la reunión anterior venían trabajando la definición de una nueva Visión, y que el foco se desplazó a un proyecto inmobiliario.' },
    { fecha: '2025-09-15', numero: 5, titulo: 'Avances Proceso: Nueva Visión', frase: '' },
    { fecha: '2025-04-14', numero: 4, titulo: 'Revisión misión y construcción visión 2030', frase: '' },
    { fecha: '2024-11-14', numero: 3, titulo: 'Dolores del Directorio', frase: '' },
    { fecha: '2022-08-04', numero: 2, titulo: 'Algunas aclaraciones para el intercambio', frase: '' },
    { fecha: '2021-08-26', numero: 1, titulo: 'Visión', frase: '' },
  ], sinFecha: ['Consigna 3: Análisis interno. Brechas y Causas'] },
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
    drive_config: { baseFileId: 'base', empresasFolderId: 'emp', tecnicasFolderId: 'tec', novedadesFolderId: 'nov', herramientasFolderId: 'herr', herramientasUrl: 'https://www.simpleza.com.ar/' },
  },
};

const json = (res, obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

// ── mock de /api/auth (en memoria) ──
const AUTH = { requireLogin: false, correo: false, faltaGrupoId: false, users: [], sessions: {}, log: [] };
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
    case 'adminLogin': {
      if (!admin()) return json(res, { error: 'No autorizado' }, 401);
      const token = 'sesion-coordinacion';
      AUTH.sessions[token] = { email: '*coordinación*', nombre: 'Coordinación', empresa: '' };
      return json(res, { ok: true, token, usuario: AUTH.sessions[token] });
    }
    case 'usuarios': return admin() ? json(res, { listaAccesos: { activa: true, habilitados: Object.keys(HABILITADOS).length }, usuarios: AUTH.users.map(u => ({ ...u, reset: false, resetToken: '' })) }) : json(res, { error: 'No autorizado' }, 401);
    case 'accesos': return admin() ? json(res, { accesos: AUTH.log.slice(-30).reverse() }) : json(res, { error: 'No autorizado' }, 401);
    case 'estado': {
      if (!admin()) return json(res, { error: 'No autorizado' }, 401);
      const u = find(p.email); if (u) u.estado = p.estado;
      return json(res, { ok: true });
    }
    case '_faltaGrupoId': { AUTH.faltaGrupoId = !!p.valor; return json(res, { ok: true }); }
    case 'enlaceReset': {
      if (!admin()) return json(res, { error: 'No autorizado' }, 401);
      const u = AUTH.users.find(x => x.email === String(p.email).toLowerCase());
      if (!u) return json(res, { error: 'No hay ninguna cuenta con esa dirección.' }, 404);
      u.reset_token = 'a1b2c3d4e5f60718';
      return json(res, { ok: true, token: u.reset_token, horas: 24 });
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
      AUTH.requireLogin = false; AUTH.users = []; AUTH.sessions = {}; AUTH.log = []; AUTH.faltaGrupoId = false;
      DB.content = { drive_config: { baseFileId: 'base', empresasFolderId: 'emp', tecnicasFolderId: 'tec', novedadesFolderId: 'nov', herramientasFolderId: 'herr', herramientasUrl: 'https://www.simpleza.com.ar/' } };
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
      return json(res, { groupId: AUTH.faltaGrupoId ? 'default' : 'grupo4', faltaGrupoId: AUTH.faltaGrupoId, requireLogin: AUTH.requireLogin, correo: AUTH.correo, usuario: us ? { email: us.email, nombre: us.nombre, empresa: us.empresa } : null });
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
          if (p.action === 'grupos') return json(res, {
            servidor: 'base-de-prueba.turso.io',
            esteGrupo: AUTH.grupoQueBusca || 'grupo4',
            grupos: AUTH.gruposEnLaBase || [
              { group_id: 'grupo4', nombre: 'Grupo El Faro', claves: 3, empresas: 9, reuniones: 41 },
              { group_id: 'grupo6', nombre: 'Distribuidoras', claves: 2, empresas: 6, reuniones: 12 },
            ],
          });
        } catch {}
        json(res, { ok: true });
      });
      return;
    }
    return json(res, DB);
  }
  if (u.pathname === '/api/base') return json(res, BASE);
  if (u.pathname === '/api/bitacora') {
    const fileId = u.searchParams.get('fileId');
    if (fileId) {
      const b = Object.values(BITACORAS).find(x => x.archivo && x.archivo.id === fileId);
      return json(res, b || { reuniones: [], aviso: `«${fileId}» no es un documento de texto.` });
    }
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
    if (op === 'arbol') {
      const fid = u.searchParams.get('folderId');
      // carpeta cargada pero que el sitio no puede leer (no se compartió)
      if (fid === 'roto') return json(res, { error: 'Drive API 404: File not found: roto' }, 502);
      if (fid === 'vacia') return json(res, { arbol: { id: fid, nombre: '', ruta: [], archivos: [], carpetas: [] } });
      if (fid === 'herr') return json(res, { arbol: ARBOL_HERR });
      if (fid === 'anidado') return json(res, { arbol: ARBOL_ANIDADO });
      return json(res, { arbol: ARBOL_TEC });
    }
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
      if (fid === 'emp') return json(res, { files: CARPETAS_EMPRESAS });
      return json(res, { files: [] });
    }
    return json(res, { error: 'op desconocida' });
  }
  // estáticos
  const f = path.join(ROOT, u.pathname === '/' ? 'index.html' : u.pathname.slice(1));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  const ext = path.extname(f);
  const ct = { '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml', '.js': 'text/javascript', '.mjs': 'text/javascript', '.xlsx': 'application/octet-stream' }[ext] || 'text/plain';
  res.writeHead(200, { 'Content-Type': ct });
  res.end(fs.readFileSync(f));
}).listen(8099, () => console.log('mock server en http://localhost:8099'));
