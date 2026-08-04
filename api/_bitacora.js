// Lectura de la BITÁCORA de una empresa.
//
// La bitácora es UN documento por empresa (Google Doc o .docx) donde cada
// reunión es un encabezado con su fecha. Así la escriben los facilitadores:
//
//   # Lunes 3 Agosto de 2026 Reunión MACSA Crecimiento empresarial…
//   # 13 DE ABRIL DE 2026 – Avance Líneas Estratégicas
//   # Brechas, causas y línea estratégica | 29 de Septiembre 2022
//   # Presentación de la empresa | 06 de julio de 2021
//
// De ahí salen las reuniones de cada empresa: cuántas, cuándo y sobre qué.
// Este archivo solo parsea; la lectura de Drive vive en api/bitacora.js.

const MESES = {
  enero: 1, ene: 1,
  febrero: 2, feb: 2,
  marzo: 3, mar: 3,
  abril: 4, abr: 4,
  mayo: 5, may: 5,
  junio: 6, jun: 6,
  julio: 7, jul: 7,
  agosto: 8, ago: 8,
  septiembre: 9, setiembre: 9, sep: 9, set: 9, sept: 9,
  octubre: 10, oct: 10,
  noviembre: 11, nov: 11,
  diciembre: 12, dic: 12,
};

const sinTildes = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const pad2 = n => String(n).padStart(2, '0');

// Busca una fecha en cualquier parte del texto de un encabezado.
// Acepta «3 Agosto de 2026», «13 DE ABRIL DE 2026», «21 de Julio 2025»,
// «12 de diciembre de 2024», «3/8/2026» y «2026-08-03».
export function fechaDeTexto(texto) {
  const t = sinTildes(texto).replace(/\s+/g, ' ');

  // 2026-08-03
  let m = t.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return armar(+m[1], +m[2], +m[3]);

  // 3/8/2026 · 03-08-26
  m = t.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2}|\d{2})\b/);
  if (m) {
    const anio = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return armar(anio, +m[2], +m[1]);
  }

  // 3 [de] agosto [de] 2026
  m = t.match(/\b(\d{1,2})\s*(?:de\s+)?([a-z]+)\.?\s*(?:de\s+|del\s+)?(20\d{2})\b/);
  if (m && MESES[m[2]]) return armar(+m[3], MESES[m[2]], +m[1]);

  // agosto [de] 2026 (sin día): se toma el día 1 y se avisa que es aproximada
  m = t.match(/\b([a-z]+)\s+(?:de\s+|del\s+)?(20\d{2})\b/);
  if (m && MESES[m[1]]) return armar(+m[2], MESES[m[1]], 1, true);

  return null;
}

function armar(anio, mes, dia, aproximada) {
  if (!(anio >= 2000 && anio <= 2100) || !(mes >= 1 && mes <= 12) || !(dia >= 1 && dia <= 31)) return null;
  return { fecha: `${anio}-${pad2(mes)}-${pad2(dia)}`, aproximada: !!aproximada };
}

// Deja el título sin la fecha ni la basura de separadores, para mostrarlo lindo.
export function tituloLimpio(texto) {
  let t = String(texto || '')
    .replace(/\b(lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)\b/gi, '')
    .replace(/\b\d{1,2}\s*(?:de\s+)?[a-záéíóúñ]+\.?\s*(?:de\s+|del\s+)?20\d{2}\b/gi, '')
    .replace(/\b\d{1,2}[/.-]\d{1,2}[/.-](?:20)?\d{2}\b/g, '')
    .replace(/\b20\d{2}-\d{1,2}-\d{1,2}\b/g, '')
    .replace(/^[\s|·:.,–—-]+|[\s|·:.,–—-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return t;
}

// ── Google Docs exportado a HTML ──
// Cada reunión es un <h1>/<h2>. Se ignoran los encabezados sin fecha (el título
// del documento, separadores vacíos, etc.).
export function reunionesDesdeHtml(html) {
  const encabezados = [];
  const rx = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m;
  while ((m = rx.exec(html)) !== null) {
    const texto = limpiarHtml(m[2]);
    if (texto) encabezados.push(texto);
  }
  return desdeEncabezados(encabezados);
}

// Google Docs exporta los acentos como entidades (&oacute;), así que hay que
// devolverlas a texto antes de buscar el mes o mostrar el título.
const ENTIDADES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', uuml: 'ü', ntilde: 'ñ',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Uuml: 'Ü', Ntilde: 'Ñ',
  ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', middot: '·', deg: '°', euro: '€',
};

function decodificar(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&([a-z]+);/gi, (m, n) => (ENTIDADES[n] !== undefined ? ENTIDADES[n] : m));
}

function limpiarHtml(s) {
  return decodificar(String(s).replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Lista de encabezados → reuniones ──
export function desdeEncabezados(encabezados) {
  const vistas = new Set();
  const reuniones = [];
  for (const texto of encabezados) {
    const f = fechaDeTexto(texto);
    if (!f) continue;
    if (vistas.has(f.fecha)) continue;      // un encabezado por reunión
    vistas.add(f.fecha);
    reuniones.push({
      fecha: f.fecha,
      fechaAproximada: f.aproximada,
      titulo: tituloLimpio(texto),
      encabezado: texto,
    });
  }
  reuniones.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  return reuniones;
}

// ── .docx ──
// Los encabezados son párrafos con estilo Heading/Título. Se extrae el texto de
// esos párrafos y se procesa igual que los <h1> del HTML.
export function reunionesDesdeDocxXml(xml) {
  const encabezados = [];
  const rxP = /<w:p\b[\s\S]*?<\/w:p>/g;
  let m;
  while ((m = rxP.exec(xml)) !== null) {
    const p = m[0];
    const estilo = p.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/);
    if (!estilo) continue;
    const v = sinTildes(estilo[1]);
    // Word en español guarda "Ttulo1"/"Titulo1"; en inglés "Heading1"
    if (!/^(heading|titulo|ttulo|encabezado)\s*[1-3]?$/.test(v.replace(/[\s_-]/g, ''))) continue;
    const texto = [...p.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
      .map(t => t[1]).join('')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ').trim();
    if (texto) encabezados.push(texto);
  }
  return desdeEncabezados(encabezados);
}
