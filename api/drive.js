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
//   GET /api/drive?op=empresa&folderId=ID     → { presentaciones, minutas } de una
//                                               empresa (descubre subcarpetas por nombre:
//                                               "Presentaciones" y "Proceso"/"Bitácora"/"Minutas")

import { GoogleAuth } from 'google-auth-library';

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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  try {
    const op = req.query.op || 'list';
    const folderId = req.query.folderId;
    if (!folderId) return res.status(400).json({ error: 'Falta folderId' });

    if (op === 'list') {
      const files = await driveList(`'${folderId}' in parents and trashed=false`);
      return res.status(200).json({ files: files.map(mapFile) });
    }

    if (op === 'empresa') {
      // Descubrir subcarpetas por nombre
      const subs = await driveList(
        `'${folderId}' in parents and trashed=false and mimeType='${FOLDER_MIME}'`,
        'files(id,name)'
      );
      const norm = s => (s || '').toLowerCase();
      const findSub = keys => subs.find(c => keys.some(k => norm(c.name).includes(k)));
      const presFolder = findSub(['presentac']);
      // Minutas = carpeta "Proceso"/"Bitácora" (el documento del proceso)
      const procFolder = findSub(['proceso', 'bitácora', 'bitacora', 'minuta']);

      const out = { presentaciones: [], minutas: [], subcarpetas: subs.map(s => ({ id: s.id, nombre: s.name })) };
      if (presFolder) out.presentaciones = await listFiles(presFolder.id);
      if (procFolder) out.minutas = await listFiles(procFolder.id);
      return res.status(200).json(out);
    }

    return res.status(400).json({ error: `op desconocida: ${op}` });
  } catch (e) {
    console.error('api/drive error:', e);
    return res.status(e.status || 500).json({ error: e.message || 'Error del servidor' });
  }
}
