// Vercel Serverless Function — lectura de Google Drive (solo lectura).
//
// Usa una CUENTA DE SERVICIO de Google. La credencial se toma de la variable de
// entorno de Vercel GOOGLE_SERVICE_ACCOUNT_JSON (el JSON completo de la cuenta),
// o GOOGLE_SERVICE_ACCOUNT_B64 (el mismo JSON en base64, una sola línea).
//
// La carpeta "Grupo 4" (y subcarpetas) debe estar compartida con el email de la
// cuenta de servicio (rol Lector).
//
// Endpoints:
//   GET /api/drive?op=list&folderId=ID       → archivos y subcarpetas de una carpeta
//   GET /api/drive?op=arbol&folderId=ID       → árbol anidado de carpetas y archivos
//                                               (parámetro depth, hasta 4 niveles)
//   GET /api/drive?op=empresa&folderId=ID     → { presentaciones, minutas } de una
//                                               empresa (descubre subcarpetas por nombre:
//                                               "Presentaciones" y "Proceso"/"Bitácora"/"Minutas")
//   GET /api/drive?op=bitacora&folderId=ID    → { url, nombre, carpeta } del archivo de
//                                               Bitácora dentro de la carpeta "Proceso"

import { GoogleAuth } from 'google-auth-library';
import { bloqueaPorLogin } from './_auth.js';

function loadCreds() {
  let raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw && process.env.GOOGLE_SERVICE_ACCOUNT_B64) {
    raw = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8');
  }
  if (!raw) throw Object.assign(new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON en Vercel.'), { status: 500 });
  let creds;
  try { creds = JSON.parse(raw); }
  catch { throw Object.assign(new Error('GOOGLE_SERVICE_ACCOUNT_JSON no es un JSON válido.'), { status: 500 }); }
  // Por si el private_key quedó con \n escapados
  if (creds.private_key && creds.private_key.includes('\\n')) {
    creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  }
  return creds;
}

let _authClient = null;
async function getToken() {
  if (!_authClient) {
    const auth = new GoogleAuth({
      credentials: loadCreds(),
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    _authClient = await auth.getClient();
  }
  const t = await _authClient.getAccessToken();
  return t.token;
}

async function driveList(q, extraFields) {
  const token = await getToken();
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', q);
  url.searchParams.set('fields', extraFields || 'files(id,name,mimeType,modifiedTime,webViewLink,fileExtension,size)');
  url.searchParams.set('pageSize', '200');
  url.searchParams.set('orderBy', 'modifiedTime desc');
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('includeItemsFromAllDrives', 'true');
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    const body = await r.text();
    throw Object.assign(new Error(`Drive API ${r.status}: ${body.slice(0, 300)}`), { status: 502 });
  }
  return (await r.json()).files || [];
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

function tipoArchivo(f) {
  if (f.fileExtension) return f.fileExtension.toUpperCase();
  const m = f.mimeType || '';
  if (m.includes('presentation')) return 'PPT';
  if (m.includes('spreadsheet')) return 'XLS';
  if (m.includes('document')) return 'DOC';
  if (m.includes('pdf')) return 'PDF';
  if (m === FOLDER_MIME) return 'Carpeta';
  return '';
}

function mapFile(f) {
  return {
    id: f.id,
    nombre: f.name,
    tipo: tipoArchivo(f),
    fecha: f.modifiedTime ? f.modifiedTime.slice(0, 10) : '',
    url: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
  };
}

async function listFiles(folderId) {
  const files = await driveList(`'${folderId}' in parents and trashed=false and mimeType!='${FOLDER_MIME}'`);
  return files.map(mapFile);
}

// Normaliza para comparar nombres de carpetas/archivos (sin tildes ni mayúsculas)
const normName = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

async function subFolders(folderId) {
  return driveList(`'${folderId}' in parents and trashed=false and mimeType='${FOLDER_MIME}'`, 'files(id,name)');
}

function findSubFolder(subs, keys) {
  return subs.find(c => keys.some(k => normName(c.name).includes(k)));
}

const parentsQuery = ids => '(' + ids.map(id => `'${id}' in parents`).join(' or ') + ')';

// Consulta por padres en tandas, para no armar una query gigante cuando hay
// muchas carpetas (Drive corta las consultas demasiado largas).
async function listInParents(ids, extraFields, soloCarpetas) {
  const out = [];
  for (let i = 0; i < ids.length; i += 25) {
    const q = `${parentsQuery(ids.slice(i, i + 25))} and trashed=false and mimeType${soloCarpetas ? '=' : '!='}'${FOLDER_MIME}'`;
    out.push(...await driveList(q, extraFields));
  }
  return out;
}

// Recorre las carpetas raíz y sus subcarpetas hasta `depth` niveles (una
// consulta por nivel, no una por carpeta). Devuelve el mapa de carpetas
// encontradas: id → { rootId, parentId, nombre, ruta: ['Minutas','Gerencias'] }.
async function walkFolders(rootIds, depth) {
  const carpetas = {};
  rootIds.forEach(id => { carpetas[id] = { rootId: id, parentId: '', nombre: '', ruta: [] }; });
  let nivel = rootIds.slice();
  for (let d = 0; d < depth && nivel.length; d++) {
    const subs = await listInParents(nivel, 'files(id,name,parents)', true);
    const siguiente = [];
    for (const s of subs) {
      if (carpetas[s.id]) continue;
      const padreId = (s.parents || []).find(p => carpetas[p]);
      if (!padreId) continue;
      const padre = carpetas[padreId];
      carpetas[s.id] = { rootId: padre.rootId, parentId: padreId, nombre: s.name, ruta: padre.ruta.concat(s.name) };
      siguiente.push(s.id);
    }
    nivel = siguiente;
  }
  return carpetas;
}

// Archivos de VARIAS carpetas de empresa y de sus subcarpetas (a cualquier
// profundidad hasta `depth`), ordenados por fecha de modificación.
async function actividad(folderIds, limit, depth) {
  const carpetas = await walkFolders(folderIds, depth);
  const files = await listInParents(
    Object.keys(carpetas),
    'files(id,name,mimeType,modifiedTime,webViewLink,fileExtension,parents)'
  );
  const items = files.map(f => {
    const o = (f.parents || []).map(p => carpetas[p]).find(Boolean) || {};
    return Object.assign(mapFile(f), {
      carpeta: o.nombre || '',
      ruta: o.ruta || [],
      empresaFolderId: o.rootId || '',
    });
  }).filter(i => i.empresaFolderId);
  items.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  return limit > 0 ? items.slice(0, limit) : items;
}

// Árbol anidado de una carpeta: subcarpetas (hasta `depth` niveles) con sus
// archivos adentro. Sirve para mostrar estructuras como
// Minutas › Gerencias / Directorio, o Tableros › Campaña 25-26.
async function arbol(folderId, depth) {
  const carpetas = await walkFolders([folderId], depth);
  const files = await listInParents(
    Object.keys(carpetas),
    'files(id,name,mimeType,modifiedTime,webViewLink,fileExtension,parents)'
  );
  const porCarpeta = {};
  for (const f of files) {
    const padre = (f.parents || []).find(p => carpetas[p]);
    if (!padre) continue;
    (porCarpeta[padre] = porCarpeta[padre] || []).push(mapFile(f));
  }
  const hijas = {};
  for (const [id, c] of Object.entries(carpetas)) {
    if (c.parentId) (hijas[c.parentId] = hijas[c.parentId] || []).push(id);
  }
  const nodo = id => ({
    id,
    nombre: carpetas[id].nombre,
    ruta: carpetas[id].ruta,
    archivos: porCarpeta[id] || [],
    carpetas: (hijas[id] || []).map(nodo).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
  });
  return nodo(folderId);
}

// ── Autodetección del contenido de la carpeta del grupo ──
// Se mira UNA carpeta (la del grupo) y se propone qué es cada subcarpeta, para
// que armar un grupo nuevo no sea pegar seis ids a mano.
const PISTAS = [
  { campo: 'empresasFolderId',     rx: /empresa|proceso/ },
  { campo: 'tecnicasFolderId',     rx: /tecnic|teoric|material/ },
  { campo: 'novedadesFolderId',    rx: /novedad|gaceta|ronda/ },
  { campo: 'herramientasFolderId', rx: /herramienta|tablero|plantilla/ },
  { campo: 'institucionalFolderId', rx: /institucional|informacion/ },
  { campo: 'logosFolderId',        rx: /logo/ },
];

async function descubrir(folderId) {
  const hijos = await driveList(
    `'${folderId}' in parents and trashed=false`,
    'files(id,name,mimeType,modifiedTime,webViewLink,fileExtension)'
  );
  const carpetas = hijos.filter(f => f.mimeType === FOLDER_MIME);
  const archivos = hijos.filter(f => f.mimeType !== FOLDER_MIME);

  const sugerencias = {};
  const detalle = [];
  for (const p of PISTAS) {
    const c = carpetas.find(x => p.rx.test(normName(x.name)));
    if (c) { sugerencias[p.campo] = c.id; detalle.push({ campo: p.campo, id: c.id, nombre: c.name }); }
  }

  // La planilla base y el logo: se buscan en la raíz y en «Información institucional»
  const dondeBuscar = [folderId];
  if (sugerencias.institucionalFolderId) dondeBuscar.push(sugerencias.institucionalFolderId);
  const candidatos = dondeBuscar.length > 1
    ? await listInParents(dondeBuscar, 'files(id,name,mimeType,fileExtension)')
    : archivos;

  const planilla = candidatos.find(f =>
    /sheet|excel/.test(f.mimeType || '') || /^xlsx?$/i.test(f.fileExtension || ''));
  if (planilla) { sugerencias.baseFileId = planilla.id; detalle.push({ campo: 'baseFileId', id: planilla.id, nombre: planilla.name }); }

  const logo = candidatos.find(f => /^image\//.test(f.mimeType || '') && /logo|isolog|imagotipo/.test(normName(f.name)))
            || candidatos.find(f => /^image\//.test(f.mimeType || ''));
  if (logo) { sugerencias.logoFileId = logo.id; detalle.push({ campo: 'logoFileId', id: logo.id, nombre: logo.name }); }

  return {
    carpetas: carpetas.map(c => ({ id: c.id, nombre: c.name })),
    archivos: archivos.map(mapFile),
    sugerencias,
    detalle,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  try {
    const op = req.query.op || 'list';

    // Email de la cuenta de servicio (para saber con quién compartir en Drive)
    if (op === 'whoami') {
      const creds = loadCreds();
      return res.status(200).json({ email: creds.client_email || '' });
    }

    // Si el grupo exige login, no se devuelve nada de Drive sin sesión
    if (await bloqueaPorLogin(req, res, req.query.group_id)) return;

    // Actividad: novedades de las carpetas de todas las empresas de una vez
    if (op === 'actividad') {
      const ids = String(req.query.folderIds || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!ids.length) return res.status(400).json({ error: 'Falta folderIds' });
      const limit = Math.min(parseInt(req.query.limit) || 200, 600);
      const depth = Math.min(Math.max(parseInt(req.query.depth) || 2, 1), 4);
      return res.status(200).json({ items: await actividad(ids.slice(0, 40), limit, depth) });
    }

    // op=imagen recibe un archivo; el resto, una carpeta
    const folderId = req.query.folderId || req.query.fileId;
    if (!folderId) return res.status(400).json({ error: 'Falta folderId' });

    if (op === 'list') {
      const files = await driveList(`'${folderId}' in parents and trashed=false`);
      return res.status(200).json({ files: files.map(mapFile) });
    }

    // Imagen de Drive servida por el sitio (logos). Va por acá y no por un link
    // directo para que la imagen no tenga que ser pública: alcanza con que esté
    // compartida con la cuenta de servicio, como todo lo demás.
    if (op === 'imagen') {
      const token = await getToken();
      const r = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?alt=media&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!r.ok) return res.status(r.status).json({ error: `No se pudo leer la imagen (${r.status}).` });
      const tipo = r.headers.get('content-type') || 'image/png';
      if (!/^image\//.test(tipo)) return res.status(415).json({ error: 'Ese archivo de Drive no es una imagen.' });
      res.setHeader('Content-Type', tipo);
      res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
      return res.send(Buffer.from(await r.arrayBuffer()));
    }

    // Descubrir el contenido de la carpeta del grupo y proponer qué es cada cosa
    if (op === 'descubrir') return res.status(200).json(await descubrir(folderId));

    // Árbol de carpetas: subcarpetas anidadas con sus archivos
    if (op === 'arbol') {
      const depth = Math.min(Math.max(parseInt(req.query.depth) || 3, 1), 4);
      return res.status(200).json({ arbol: await arbol(folderId, depth) });
    }

    if (op === 'empresa') {
      // Descubrir subcarpetas por nombre
      const subs = await subFolders(folderId);
      const presFolder = findSubFolder(subs, ['presentac']);
      // Minutas = carpeta "Proceso"/"Bitácora" (el documento del proceso)
      const procFolder = findSubFolder(subs, ['proceso', 'bitacora', 'minuta']);

      const out = { presentaciones: [], minutas: [], subcarpetas: subs.map(s => ({ id: s.id, nombre: s.name })) };
      if (presFolder) out.presentaciones = await listFiles(presFolder.id);
      if (procFolder) out.minutas = await listFiles(procFolder.id);
      return res.status(200).json(out);
    }

    // Bitácora del proceso: carpeta "Proceso" de la empresa → archivo de bitácora.
    // Si no hay un archivo que se llame "bitácora", se devuelve el más reciente;
    // si la carpeta está vacía, se devuelve la carpeta misma.
    if (op === 'bitacora') {
      const subs = await subFolders(folderId);
      const procFolder = findSubFolder(subs, ['proceso', 'bitacora', 'minuta']);
      if (!procFolder) {
        return res.status(404).json({ error: 'No se encontró la carpeta «Proceso» dentro de la carpeta de la empresa.' });
      }
      const carpeta = `https://drive.google.com/drive/folders/${procFolder.id}`;
      const files = await listFiles(procFolder.id);
      const pick = files.find(f => normName(f.nombre).includes('bitacora')) || files[0];
      if (!pick) return res.status(200).json({ url: carpeta, nombre: procFolder.name, carpeta, esCarpeta: true });
      return res.status(200).json({ url: pick.url, nombre: pick.nombre, fecha: pick.fecha, carpeta });
    }

    return res.status(400).json({ error: `op desconocida: ${op}` });
  } catch (e) {
    console.error('api/drive error:', e);
    return res.status(e.status || 500).json({ error: e.message || 'Error del servidor' });
  }
}
