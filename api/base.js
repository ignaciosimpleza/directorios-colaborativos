// Vercel Serverless Function — lee el archivo base institucional del Drive
// (Base_Estructurada_Grupo_El_Faro.xlsx) y devuelve su contenido estructurado.
//
// Usa la misma cuenta de servicio que /api/drive (GOOGLE_SERVICE_ACCOUNT_JSON).
// El id del archivo se puede pasar por query (?fileId=) o vía la variable
// BASE_FILE_ID; por defecto usa el archivo de El Faro.

import { GoogleAuth } from 'google-auth-library';
import * as XLSX from 'xlsx';
import { bloqueaPorLogin } from './_auth.js';

const DEFAULT_BASE_FILE_ID = '1hdGYpzGrqIh5gADoVkp9yNp8pPGM29dt';

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
  const grupo = {
    nombre: grupoKV['grupo_nombre'] || '',
    subtitulo: grupoKV['grupo_subtitulo'] || '',
    descripcion: grupoKV['grupo_descripcion'] || '',
    inicio: grupoKV['grupo_inicio'] || '',
    nombreDesde: grupoKV['grupo_nombre_desde'] || '',
    objetivoGeneral: grupoKV['objetivo_general'] || '',
    objetivo2026: grupoKV['objetivo_2026'] || '',
    objetivo2026Ampliado: grupoKV['objetivo_2026_ampliado'] || '',
    principios,
    fraseDestacada: grupoKV['frase_destacada'] || '',
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
      identidad: r['identidad'] || '', queHace: r['que_hace_y_como_funciona'] || '', recorrido: r['recorrido_en_el_faro'] || '',
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

  // CONFIG_DRIVE (mapeo slug → carpeta)
  const cfgRows = findSheet(wb, ['slug', 'id_carpeta_empresa']);
  const config = cfgRows ? tableObjects(cfgRows, ['slug', 'id_carpeta_empresa'])
    .map(r => ({ slug: r['slug'], driveFolderId: r['id_carpeta_empresa'] || '', urlLogo: r['url_logo'] || '' })) : [];

  // Merge de folder id sobre empresas
  const cfgBySlug = {};
  config.forEach(c => { cfgBySlug[c.slug] = c; });
  empresas.forEach(e => { const c = cfgBySlug[e.slug]; if (c) { e.driveFolderId = c.driveFolderId || ''; if (!e.urlLogo) e.urlLogo = c.urlLogo || ''; } });

  return { grupo, hitos, ejes, empresas, eventos, conceptos };
}

export { parseBase };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  try {
    // Si el grupo exige login, la planilla no se sirve sin sesión
    if (await bloqueaPorLogin(req, res, req.query.group_id)) return;
    const fileId = req.query.fileId || process.env.BASE_FILE_ID || DEFAULT_BASE_FILE_ID;
    const buf = await downloadXlsx(fileId);
    const wb = XLSX.read(buf, { type: 'buffer' });
    return res.status(200).json(parseBase(wb));
  } catch (e) {
    console.error('api/base error:', e);
    return res.status(e.status || 500).json({ error: e.message || 'Error del servidor' });
  }
}
