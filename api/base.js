// Vercel Serverless Function — lee la planilla base del grupo desde Drive y
// devuelve su contenido estructurado. De acá sale TODO el contenido del sitio:
// identidad, hitos, ejes, empresas, agenda, equipo y la lista de accesos.
//
// Usa la misma cuenta de servicio que /api/drive (GOOGLE_SERVICE_ACCOUNT_JSON).
// El id del archivo llega por query (?fileId=, lo que el grupo pegó en
// Configuración) o por la variable de entorno BASE_FILE_ID. No hay ninguno
// escrito en el código.

import { GoogleAuth } from 'google-auth-library';
import * as XLSX from 'xlsx';
import { bloqueaPorLogin } from './_auth.js';

// No hay archivo por defecto en el código: el id llega por query (lo que el
// grupo pegó en Configuración) o por la variable de entorno BASE_FILE_ID.

function loadCreds() {
  let raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw && process.env.GOOGLE_SERVICE_ACCOUNT_B64) {
    raw = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8');
  }
  if (!raw) throw Object.assign(new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON en Vercel.'), { status: 500 });
  const creds = JSON.parse(raw);
  if (creds.private_key && creds.private_key.includes('\\n')) creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  return creds;
}

let _client = null;
async function getToken() {
  if (!_client) {
    const auth = new GoogleAuth({ credentials: loadCreds(), scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
    _client = await auth.getClient();
  }
  return (await _client.getAccessToken()).token;
}

async function downloadXlsx(fileId) {
  const token = await getToken();
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw Object.assign(new Error(`Drive API ${r.status}: ${(await r.text()).slice(0, 200)}`), { status: 502 });
  return Buffer.from(await r.arrayBuffer());
}

// ── Parser genérico ────────────────────────────────────────────────
const norm = s => String(s == null ? '' : s).trim().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '');

function sheetRows(ws) {
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
}

// Encuentra la fila de encabezado (la que contiene todas las columnas clave) y
// devuelve la lista de objetos por fila con las claves normalizadas.
function tableObjects(rows, requiredCols) {
  const req = requiredCols.map(norm);
  let hi = -1;
  for (let i = 0; i < rows.length; i++) {
    const low = rows[i].map(norm);
    if (req.every(c => low.includes(c))) { hi = i; break; }
  }
  if (hi === -1) return [];
  const header = rows[hi].map(norm);
  const out = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(c => String(c).trim() === '')) continue;
    const o = {};
    header.forEach((h, j) => { if (h) o[h] = r[j] != null ? String(r[j]).trim() : ''; });
    out.push(o);
  }
  return out;
}

function findSheet(wb, requiredCols) {
  const req = requiredCols.map(norm);
  for (const name of wb.SheetNames) {
    const rows = sheetRows(wb.Sheets[name]);
    for (const row of rows) {
      const low = row.map(norm);
      if (req.every(c => low.includes(c))) return rows;
    }
  }
  return null;
}

const truthy = v => ['true', 'sí', 'si', 'x', '1', 'verdadero'].includes(norm(v));

function parseBase(wb) {
  // GRUPO (clave/contenido)
  const grupoRows = findSheet(wb, ['clave', 'contenido']);
  const grupoKV = {};
  if (grupoRows) tableObjects(grupoRows, ['clave', 'contenido']).forEach(r => { grupoKV[r['clave']] = r['contenido']; });
  const principios = Object.keys(grupoKV).filter(k => k.startsWith('principio')).sort().map(k => grupoKV[k]).filter(Boolean);
  // EQUIPO (quiénes facilitan / coordinan). Se ve al pie del menú lateral.
  const eqRows = findSheet(wb, ['nombre', 'rol']);
  const equipo = eqRows ? tableObjects(eqRows, ['nombre', 'rol'])
    .filter(r => r['mostrar_en_web'] === '' || truthy(r['mostrar_en_web']))
    .filter(r => r['nombre'])
    .map(r => ({ nombre: r['nombre'], rol: r['rol'] || '' })) : [];

  const grupo = {
    nombre: grupoKV['grupo_nombre'] || '',
    subtitulo: grupoKV['grupo_subtitulo'] || '',
    logoUrl: grupoKV['grupo_logo_url'] || '',
    // Bajada corta del menú lateral y del encabezado (ej: "Directorio Colaborativo")
    tipo: grupoKV['grupo_tipo'] || '',
    // Etiqueta opcional del menú (ej: "Grupo IV · Simpleza")
    etiqueta: grupoKV['grupo_etiqueta'] || '',
    // Quién facilita (ej: "Simpleza"), se muestra junto al tipo en el encabezado
    facilitadoPor: grupoKV['facilitado_por'] || '',
    descripcion: grupoKV['grupo_descripcion'] || '',
    inicio: grupoKV['grupo_inicio'] || '',
    nombreDesde: grupoKV['grupo_nombre_desde'] || '',
    objetivoGeneral: grupoKV['objetivo_general'] || '',
    objetivo2026: grupoKV['objetivo_2026'] || '',
    objetivo2026Ampliado: grupoKV['objetivo_2026_ampliado'] || '',
    // Títulos que antes estaban fijos en el HTML
    objetivoAnioTitulo: grupoKV['objetivo_anio_titulo'] || '',
    ejesTitulo: grupoKV['ejes_titulo'] || '',
    principios,
    fraseDestacada: grupoKV['frase_destacada'] || '',
    equipo,
  };

  // HITOS
  const hitosRows = findSheet(wb, ['id_hito', 'titulo', 'descripcion']);
  const hitos = hitosRows ? tableObjects(hitosRows, ['id_hito', 'titulo', 'descripcion'])
    .filter(r => r['mostrar_en_web'] === '' || truthy(r['mostrar_en_web']))
    .map(r => ({ anio: r['ano'] || r['año'] || '', titulo: r['titulo'], desc: r['descripcion'] })) : [];

  // EJES_2026
  const ejesRows = findSheet(wb, ['id_eje', 'titulo', 'descripcion']);
  const ejes = ejesRows ? tableObjects(ejesRows, ['id_eje', 'titulo', 'descripcion'])
    .filter(r => r['mostrar_en_web'] === '' || truthy(r['mostrar_en_web']))
    .map(r => ({ titulo: r['titulo'], desc: r['descripcion'] })) : [];

  // EMPRESAS
  const empRows = findSheet(wb, ['slug', 'nombre', 'participantes']);
  const empresas = empRows ? tableObjects(empRows, ['slug', 'nombre', 'participantes'])
    .filter(r => r['mostrar_en_web'] === '' || truthy(r['mostrar_en_web']))
    .map(r => ({
      slug: r['slug'], orden: parseInt(r['orden']) || 0, nombre: r['nombre'], zona: r['zona'] || '',
      participantes: r['participantes'] || '', resumen: r['resumen_corto'] || '', foco: r['foco_actual'] || '',
      identidad: r['identidad'] || '', queHace: r['que_hace_y_como_funciona'] || '',
      recorrido: r['recorrido_en_el_grupo'] || r['recorrido_en_el_faro'] || '',
      urlLogo: r['url_logo'] || '',
    })) : [];

  // EVENTOS (agenda del grupo: congresos, viajes, encuentros). Opcional.
  // La fecha es texto libre: "4-5-6/8", "23 y 24/10", "29 Jun 2026"…
  const evtRows = findSheet(wb, ['fecha', 'titulo']);
  const eventos = evtRows ? tableObjects(evtRows, ['fecha', 'titulo'])
    .filter(r => r['mostrar_en_web'] === '' || truthy(r['mostrar_en_web']))
    .filter(r => r['fecha'] || r['titulo'])
    .map(r => ({ fecha: r['fecha'], titulo: r['titulo'], desc: r['descripcion'] || '', empresa: r['lugar'] || r['empresa'] || '' })) : [];

  // CONCEPTOS (marco conceptual). Vive en su propio archivo, pero se parsea igual.
  const conRows = findSheet(wb, ['titulo', 'formula', 'descripcion']);
  const conceptos = conRows ? tableObjects(conRows, ['titulo', 'formula', 'descripcion'])
    .filter(r => r['mostrar_en_web'] === '' || truthy(r['mostrar_en_web']))
    .filter(r => r['titulo'])
    .map(r => ({ icon: r['icono'] || '📌', titulo: r['titulo'], formula: r['formula'] || '', desc: r['descripcion'] || '' })) : [];

  // ACCESOS (quiénes pueden tener cuenta en el sitio). Opcional pero
  // recomendada: si está, solo esos emails pueden registrarse. Nunca sale del
  // servidor: /api/base la borra antes de responderle al navegador.
  const accRows = findSheet(wb, ['email', 'empresa']);
  const accesos = accRows ? tableObjects(accRows, ['email', 'empresa'])
    .filter(r => r['email'])
    .map(r => ({ email: norm(r['email']), empresa: r['empresa'] || '', nombre: r['nombre'] || '' })) : [];

  // CONFIG_DRIVE (mapeo slug → carpeta)
  const cfgRows = findSheet(wb, ['slug', 'id_carpeta_empresa']);
  const config = cfgRows ? tableObjects(cfgRows, ['slug', 'id_carpeta_empresa'])
    .map(r => ({ slug: r['slug'], driveFolderId: r['id_carpeta_empresa'] || '', urlLogo: r['url_logo'] || '' })) : [];

  // Merge de folder id sobre empresas
  const cfgBySlug = {};
  config.forEach(c => { cfgBySlug[c.slug] = c; });
  empresas.forEach(e => { const c = cfgBySlug[e.slug]; if (c) { e.driveFolderId = c.driveFolderId || ''; if (!e.urlLogo) e.urlLogo = c.urlLogo || ''; } });

  return { grupo, hitos, ejes, empresas, eventos, conceptos, accesos };
}

// Lee y parsea la planilla base. La usa /api/base y también /api/auth (para
// saber qué emails tienen permitido registrarse).
export async function leerBase(fileId) {
  const buf = await downloadXlsx(fileId);
  return parseBase(XLSX.read(buf, { type: 'buffer' }));
}

export { parseBase };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  try {
    // Si el grupo exige login, la planilla no se sirve sin sesión
    if (await bloqueaPorLogin(req, res, req.query.group_id)) return;
    const fileId = req.query.fileId || process.env.BASE_FILE_ID || '';
    if (!fileId) {
      return res.status(400).json({
        error: 'Todavía no hay planilla base conectada. Pegá el id o el link del archivo en Configuración → «El Grupo, Empresas y Agenda».',
        faltaConectar: true,
      });
    }
    const data = await leerBase(fileId);
    // La lista de emails habilitados es interna: no viaja al navegador.
    const tieneListaAccesos = (data.accesos || []).length > 0;
    delete data.accesos;
    return res.status(200).json(Object.assign(data, { tieneListaAccesos }));
  } catch (e) {
    console.error('api/base error:', e);
    return res.status(e.status || 500).json({ error: e.message || 'Error del servidor' });
  }
}
