// Vercel Serverless Function — lee la BITÁCORA de una empresa desde Drive.
//
// La bitácora es un documento por empresa, dentro de la subcarpeta «Proceso»
// de la carpeta de la empresa. Cada reunión es un encabezado con su fecha.
// Puede ser un Google Doc, un .docx o un acceso directo a cualquiera de los dos.
//
//   GET /api/bitacora?folderId=<carpeta de la empresa>
//     → { archivo:{id,nombre,url}, carpeta, reuniones:[{fecha,titulo}], aviso }
//
// Es la fuente de «cuántas reuniones lleva cada empresa» y de la actividad
// reciente del Dashboard.

import { GoogleAuth } from 'google-auth-library';
import { inflateRawSync } from 'node:zlib';
import { reunionesDesdeHtml, reunionesDesdeDocxXml, reunionesDesdeTextoPlano } from './_bitacora.js';
import { bloqueaPorLogin } from './_auth.js';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DOC_MIME = 'application/vnd.google-apps.document';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';

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

async function driveGet(path, params) {
  const token = await getToken();
  const url = new URL('https://www.googleapis.com/drive/v3/' + path);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set('supportsAllDrives', 'true');
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    const body = await r.text();
    throw Object.assign(new Error(`Drive API ${r.status}: ${body.slice(0, 200)}`), {
      status: 502, httpDrive: r.status, cuerpoDrive: body,
    });
  }
  return r;
}

// Google se niega a exportar un documento cuyo resultado pasa los 10 MB. Pasa
// con las bitácoras que tienen videos o presentaciones embebidas: el texto son
// unos cientos de kilobytes, pero el HTML arrastra todo lo demás.
const esDemasiadoGrande = e =>
  e && e.httpDrive === 403 && /too large to be exported/i.test(String(e.cuerpoDrive || ''));

const CAMPOS = 'files(id,name,mimeType,modifiedTime,webViewLink,shortcutDetails(targetId,targetMimeType))';

async function listar(q, fields) {
  const r = await driveGet('files', {
    q, fields: fields || CAMPOS, pageSize: '200', includeItemsFromAllDrives: 'true',
  });
  return (await r.json()).files || [];
}

const normName = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Carpeta «Proceso» (o «Bitácora»/«Minutas») dentro de la carpeta de la empresa
async function carpetaProceso(folderId) {
  const subs = await listar(
    `'${folderId}' in parents and trashed=false and mimeType='${FOLDER_MIME}'`,
    'files(id,name)'
  );
  return subs.find(c => /proceso|bitacora|minuta/.test(normName(c.name))) || null;
}

// El documento de la bitácora dentro de esa carpeta. Prioriza el que se llame
// «Proceso …» o «Bitácora …»; si no, el documento más reciente.
function elegirDoc(archivos) {
  const docs = archivos.filter(f => {
    const mime = f.mimeType === SHORTCUT_MIME ? (f.shortcutDetails || {}).targetMimeType : f.mimeType;
    return mime === DOC_MIME || mime === DOCX_MIME;
  });
  if (!docs.length) return null;
  const porNombre = docs.find(f => /proceso|bitacora/.test(normName(f.name)));
  return porNombre || docs[0];
}

// ── .docx: es un zip; se saca word/document.xml sin dependencias ──
function leerZipEntry(buf, nombre) {
  // Se recorre el directorio central desde el final del archivo
  const fin = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (fin < 0) throw new Error('El .docx no parece un archivo válido.');
  const cantidad = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  for (let i = 0; i < cantidad; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(p + 10);
    const tamComprimido = buf.readUInt32LE(p + 20);
    const largoNombre = buf.readUInt16LE(p + 28);
    const largoExtra = buf.readUInt16LE(p + 30);
    const largoComentario = buf.readUInt16LE(p + 32);
    const offsetLocal = buf.readUInt32LE(p + 42);
    const nombreEntrada = buf.toString('utf8', p + 46, p + 46 + largoNombre);
    if (nombreEntrada === nombre) {
      const nl = buf.readUInt16LE(offsetLocal + 26);
      const el = buf.readUInt16LE(offsetLocal + 28);
      const datos = buf.subarray(offsetLocal + 30 + nl + el, offsetLocal + 30 + nl + el + tamComprimido);
      return metodo === 0 ? datos : inflateRawSync(datos);
    }
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  throw new Error(`No se encontró ${nombre} dentro del .docx.`);
}

async function leerReuniones(archivo) {
  const esAtajo = archivo.mimeType === SHORTCUT_MIME;
  const id = esAtajo ? archivo.shortcutDetails.targetId : archivo.id;
  const mime = esAtajo ? archivo.shortcutDetails.targetMimeType : archivo.mimeType;

  if (mime === DOC_MIME) {
    // Se exporta a HTML porque conserva los encabezados, que ayudan a separar
    // una reunión de la siguiente.
    try {
      const r = await driveGet(`files/${id}/export`, { mimeType: 'text/html' });
      return reunionesDesdeHtml(await r.text());
    } catch (e) {
      if (!esDemasiadoGrande(e)) throw e;
      // Sin el HTML se pierden los encabezados, pero las fechas se reconocen
      // igual: cada reunión arranca en su propio renglón. Vale mucho más leer
      // la bitácora sin esa ayuda que no leerla.
      const r = await driveGet(`files/${id}/export`, { mimeType: 'text/plain' });
      return reunionesDesdeTextoPlano(await r.text());
    }
  }
  if (mime === DOCX_MIME) {
    const r = await driveGet(`files/${id}`, { alt: 'media' });
    const buf = Buffer.from(await r.arrayBuffer());
    return reunionesDesdeDocxXml(leerZipEntry(buf, 'word/document.xml').toString('utf8'));
  }
  throw Object.assign(new Error('El archivo de bitácora no es un documento de texto.'), { status: 415 });
}

// Las bitácoras son documentos grandes (hay algunos de más de 20 MB): se le
// pide a Vercel el máximo de tiempo disponible para leerlas.
const AVISO_SIN_REUNIONES = 'Se localizó la bitácora pero no se reconoció ninguna reunión. Cada reunión debe figurar como un encabezado (Título 1 o Título 2) que incluya la fecha; por ejemplo, «13 de abril de 2026 – Avance de líneas estratégicas».';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  // Leer una bitácora es caro: se cachea fuerte en el borde de Vercel.
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
  try {
    if (await bloqueaPorLogin(req, res, req.query.group_id)) return;

    // Se puede indicar el documento de bitácora directamente (fileId) o la
    // carpeta de la empresa (folderId), y en ese caso se busca adentro.
    const fileId = req.query.fileId;
    if (fileId) {
      const meta = await driveGet(`files/${encodeURIComponent(fileId)}`, {
        fields: 'id,name,mimeType,webViewLink,shortcutDetails(targetId,targetMimeType)',
      });
      const doc = await meta.json();
      const mime = doc.mimeType === SHORTCUT_MIME ? (doc.shortcutDetails || {}).targetMimeType : doc.mimeType;
      if (mime !== DOC_MIME && mime !== DOCX_MIME) {
        return res.status(200).json({
          reuniones: [],
          aviso: `«${doc.name || fileId}» no es un documento de texto. La bitácora tiene que ser un Google Doc o un archivo .docx.`,
        });
      }
      const { reuniones, sinFecha } = await leerReuniones(doc);
      const idReal = doc.mimeType === SHORTCUT_MIME ? doc.shortcutDetails.targetId : doc.id;
      return res.status(200).json({
        archivo: { id: idReal, nombre: doc.name, url: doc.webViewLink || `https://docs.google.com/document/d/${idReal}/edit` },
        reuniones,
        sinFecha,
        aviso: reuniones.length ? '' : AVISO_SIN_REUNIONES,
      });
    }

    const folderId = req.query.folderId;
    if (!folderId) return res.status(400).json({ error: 'Indicá la carpeta de la empresa (folderId) o el documento de bitácora (fileId).' });

    const proc = await carpetaProceso(folderId);
    if (!proc) {
      return res.status(200).json({
        reuniones: [],
        aviso: 'La carpeta de la empresa no contiene una subcarpeta «Proceso» con la bitácora.',
      });
    }
    const carpeta = `https://drive.google.com/drive/folders/${proc.id}`;
    const archivos = await listar(`'${proc.id}' in parents and trashed=false and mimeType!='${FOLDER_MIME}'`);
    const doc = elegirDoc(archivos);
    if (!doc) {
      return res.status(200).json({
        reuniones: [], carpeta,
        aviso: 'La carpeta «Proceso» no contiene ningún documento de bitácora (Google Doc o .docx).',
      });
    }

    const { reuniones, sinFecha } = await leerReuniones(doc);
    const esAtajo = doc.mimeType === SHORTCUT_MIME;
    const idReal = esAtajo ? doc.shortcutDetails.targetId : doc.id;
    return res.status(200).json({
      carpeta,
      archivo: {
        id: idReal,
        nombre: doc.name,
        url: doc.webViewLink || `https://docs.google.com/document/d/${idReal}/edit`,
      },
      reuniones,
      sinFecha,
      aviso: reuniones.length ? '' : AVISO_SIN_REUNIONES,
    });
  } catch (e) {
    console.error('api/bitacora error:', e);
    return res.status(e.status || 500).json({ error: e.message || 'Error del servidor' });
  }
}
