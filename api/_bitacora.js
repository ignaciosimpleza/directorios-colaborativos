// Lectura de la BITÁCORA de una empresa.
//
// La bitácora es UN documento por empresa (Google Doc o .docx) donde cada
// reunión arranca con un encabezado. Los documentos reales del grupo usan
// convenciones distintas, y las tres tienen que contar igual:
//
//   a) La fecha completa en el encabezado
//      # Lunes 3 Agosto de 2026 Reunión MACSA — Crecimiento empresarial
//      # 13 DE ABRIL DE 2026 – Avance Líneas Estratégicas
//
//   b) El día y el mes en el encabezado, y el año suelto (o en ningún lado)
//      # FECHA Y TÍTULO: 1 DE JUNIO – Reunión de Accionistas junio 2026
//      # 🗓️ 09 de Febrero - Primera presentación de la empresa
//
//   c) El encabezado sin fecha y la fecha en la línea de abajo
//      # Grupo Estratégico: EL MOTIVO
//      Presentación de la empresa | 26 de agosto de 2021
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

// El día y el mes, sin año: «09 de Febrero», «1 DE JUNIO», «3 agosto».
function diaYMes(t) {
  const m = t.match(/\b(\d{1,2})\s*(?:de\s+|del\s+)?([a-z]+)\b/);
  if (m && MESES[m[2]] && +m[1] >= 1 && +m[1] <= 31) return { dia: +m[1], mes: MESES[m[2]] };
  return null;
}

// Busca una fecha completa en el texto. Acepta «3 Agosto de 2026»,
// «13 DE ABRIL DE 2026», «3/8/2026», «2026-08-03» y también el caso en que el
// día y el mes van juntos pero el año aparece suelto en otra parte del título.
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

  // «1 DE JUNIO – Reunión de Accionistas junio 2026»: el día y el mes van
  // juntos y el año aparece más adelante, en el mismo renglón.
  const dm = diaYMes(t);
  const suelto = t.match(/\b(20\d{2})\b/);
  if (dm && suelto) return armar(+suelto[1], dm.mes, dm.dia);

  // agosto [de] 2026 (sin día): se toma el día 1 y se avisa que es aproximada
  m = t.match(/\b([a-z]+)\s+(?:de\s+|del\s+)?(20\d{2})\b/);
  if (m && MESES[m[1]]) return armar(+m[2], MESES[m[1]], 1, true);

  return null;
}

// El día y el mes cuando el año no está en ninguna parte del texto. El año se
// deduce después, mirando las reuniones vecinas del mismo documento.
export function fechaSinAnioDeTexto(texto) {
  const t = sinTildes(texto).replace(/\s+/g, ' ');
  if (/\b20\d{2}\b/.test(t)) return null;
  return diaYMes(t);
}

function armar(anio, mes, dia, aproximada) {
  if (!(anio >= 2000 && anio <= 2100) || !(mes >= 1 && mes <= 12) || !(dia >= 1 && dia <= 31)) return null;
  return { fecha: `${anio}-${pad2(mes)}-${pad2(dia)}`, aproximada: !!aproximada };
}

// Deja el título sin la fecha ni la basura de separadores, para mostrarlo lindo.
export function tituloLimpio(texto) {
  let t = String(texto || '')
    .replace(/^[^\p{L}\d]+/u, '')                       // emojis y símbolos al principio
    .replace(/\bfecha\s+y\s+t[íi]tulo\s*:?/gi, '')      // la etiqueta de la plantilla
    .replace(/\b(lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)\b/gi, '')
    .replace(/\b\d{1,2}\s*(?:de\s+)?[a-záéíóúñ]+\.?\s*(?:de\s+|del\s+)?20\d{2}\b/gi, '')
    .replace(/\b\d{1,2}\s*(?:de\s+|del\s+)[a-záéíóúñ]+\b/gi, m => (MESES[sinTildes(m).replace(/^\d{1,2}\s*(?:de\s+|del\s+)/, '')] ? '' : m))
    .replace(/\b[a-záéíóúñ]+\s+(?:de\s+|del\s+)?20\d{2}\b/gi, m => (MESES[sinTildes(m).split(/\s+/)[0]] ? '' : m))
    .replace(/\b\d{1,2}[/.-]\d{1,2}[/.-](?:20)?\d{2}\b/g, '')
    .replace(/\b20\d{2}-\d{1,2}-\d{1,2}\b/g, '')
    .replace(/^[\s|·:.,–—-]+|[\s|·:.,–—-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return t;
}

// ── Google Docs exportado a HTML ──
// Cada reunión arranca en un <h1>/<h2>. Se guarda también el principio del
// texto que sigue, porque hay bitácoras que ponen la fecha ahí y no en el
// título.
export function reunionesDesdeHtml(html) {
  const bloques = [];
  const rx = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m, prev = null, prevFin = 0;
  while ((m = rx.exec(html)) !== null) {
    if (prev) prev.contexto = contextoDeHtml(html.slice(prevFin, m.index));
    const texto = limpiarHtml(m[2]);
    prev = texto ? { nivel: +m[1], texto, contexto: [] } : null;
    if (prev) bloques.push(prev);
    prevFin = m.index + m[0].length;
  }
  if (prev) prev.contexto = contextoDeHtml(html.slice(prevFin));
  return desdeBloques(bloques);
}

// Solo las primeras líneas cortas: una línea de fecha, no la prosa de la
// reunión (donde puede haber años sueltos que no son la fecha del encuentro).
const LARGO_CONTEXTO = 160;
const LINEAS_CONTEXTO = 2;

function contextoDeHtml(frag) {
  return String(frag)
    .split(/<\/p>|<br\s*\/?>|<\/li>/i)
    .map(limpiarHtml)
    .filter(Boolean)
    .slice(0, LINEAS_CONTEXTO)
    .filter(l => l.length <= LARGO_CONTEXTO);
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

// ── Bloques → reuniones ──
// Devuelve { reuniones, sinFecha }: las que se pudieron fechar y los títulos de
// primer nivel que parecen una reunión pero no tienen ninguna fecha legible.
export function desdeBloques(bloques) {
  const norm = (bloques || []).map(b =>
    typeof b === 'string' ? { nivel: 1, texto: b, contexto: [] } : b);

  const marcas = norm.map(b => {
    // El encabezado primero; después, solo los renglones cortos de abajo (una
    // línea de fecha), nunca la prosa de la reunión: ahí hay años sueltos que
    // no son la fecha del encuentro.
    const lineas = [b.texto].concat((b.contexto || []).filter(l => l.length <= LARGO_CONTEXTO));
    for (const t of lineas) {
      const f = fechaDeTexto(t);
      if (f) return { estado: 'completa', fecha: f.fecha, aproximada: f.aproximada, desde: t, b };
    }
    for (const t of lineas) {
      const p = fechaSinAnioDeTexto(t);
      if (p) return { estado: 'parcial', mes: p.mes, dia: p.dia, desde: t, b };
    }
    return { estado: 'ninguna', b };
  });

  deducirAnios(marcas);

  const vistas = new Set();
  const reuniones = [];
  for (const m of marcas) {
    if (!m.fecha || vistas.has(m.fecha)) continue;
    vistas.add(m.fecha);
    // Si el encabezado es un separador repetido y lo que identifica la reunión
    // está en el renglón de la fecha, el título sale de ahí.
    const delTitulo = tituloLimpio(m.b.texto);
    const delRenglon = m.desde === m.b.texto ? '' : tituloLimpio(m.desde);
    reuniones.push({
      fecha: m.fecha,
      fechaAproximada: !!m.aproximada,
      anioDeducido: !!m.anioDeducido,
      titulo: delRenglon || delTitulo,
      encabezado: m.b.texto,
    });
  }
  reuniones.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));

  const sinFecha = marcas
    .filter(m => !m.fecha && (m.b.nivel || 1) === 1 && m.b.texto)
    .map(m => m.b.texto);

  return { reuniones, sinFecha };
}

// Las bitácoras que escriben «09 de Febrero» sin el año se leen igual: se busca
// la reunión fechada más cercana del documento y se elige el año que deja las
// dos fechas lo más juntas posible. Sirve tanto si el documento va de la más
// nueva a la más vieja como al revés, sin tener que adivinar el orden.
function deducirAnios(marcas) {
  const anclas = marcas
    .map((m, i) => ({ m, i }))
    .filter(x => x.m.estado === 'completa');
  if (!anclas.length) return;

  const enDias = f => Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10)) / 86400000;

  marcas.forEach((m, i) => {
    if (m.estado !== 'parcial') return;
    let ancla = anclas[0];
    for (const a of anclas) if (Math.abs(a.i - i) < Math.abs(ancla.i - i)) ancla = a;
    const base = +ancla.m.fecha.slice(0, 4);
    const ref = enDias(ancla.m.fecha);
    let mejor = null;
    for (const anio of [base - 1, base, base + 1]) {
      const f = armar(anio, m.mes, m.dia);
      if (!f) continue;
      const dist = Math.abs(enDias(f.fecha) - ref);
      if (!mejor || dist < mejor.dist) mejor = { fecha: f.fecha, dist };
    }
    if (mejor) { m.fecha = mejor.fecha; m.anioDeducido = true; }
  });
}

// Compatibilidad: una lista de títulos sueltos, sin el texto que los sigue.
export function desdeEncabezados(encabezados) {
  return desdeBloques(encabezados);
}

// ── .docx ──
// Los encabezados son párrafos con estilo Heading/Título. Se leen en orden y se
// guardan, como en el HTML, las primeras líneas que vienen abajo de cada uno.
export function reunionesDesdeDocxXml(xml) {
  const bloques = [];
  const rxP = /<w:p\b[\s\S]*?<\/w:p>/g;
  let m, prev = null;
  while ((m = rxP.exec(xml)) !== null) {
    const p = m[0];
    const texto = textoDeParrafo(p);
    const nivel = nivelDeParrafo(p);
    if (nivel) {
      prev = texto ? { nivel, texto, contexto: [] } : null;
      if (prev) bloques.push(prev);
    } else if (prev && texto && texto.length <= LARGO_CONTEXTO && prev.contexto.length < LINEAS_CONTEXTO) {
      prev.contexto.push(texto);
    }
  }
  return desdeBloques(bloques);
}

function nivelDeParrafo(p) {
  const estilo = p.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/);
  if (!estilo) return 0;
  // Word en español guarda "Ttulo1"/"Titulo1"; en inglés "Heading1"
  const v = sinTildes(estilo[1]).replace(/[\s_-]/g, '');
  const m = v.match(/^(?:heading|titulo|ttulo|encabezado)([1-3])?$/);
  return m ? (+m[1] || 1) : 0;
}

function textoDeParrafo(p) {
  return [...p.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map(t => t[1]).join('')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}
