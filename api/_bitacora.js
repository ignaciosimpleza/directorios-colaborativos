// Lectura de la BITÁCORA de una empresa.
//
// Lo que se cuenta es CADA FECHA DE REUNIÓN que aparece en el documento, no el
// documento ni los archivos. Las bitácoras reales del grupo no están escritas
// todas igual, y casi ninguna usa encabezados de Word: pedirlos era el modelo
// equivocado. En «Proceso | El Motivo» hay once reuniones y un solo encabezado.
//
// Cuenta como reunión un renglón corto que lleva una fecha y que además:
//
//   a) arranca con la fecha (salteando emojis, símbolos y el día de la semana)
//      4 de agosto de 2022
//      15 de septiembre de 2025 — Avances: nueva visión y proyecto inmobiliario
//      🗓️ 09 de Febrero - Primera presentación de la empresa
//
//   b) o menciona el encuentro: reunión, minuta, encontro, sesión, presentación
//      Reunión El Motivo – Lunes 29 de Junio de 2026
//      🗂 Avance en LE: Minuta de Reunión – 22 de diciembre de 2025
//      Presentación de la empresa | 26 de agosto de 2021
//      Fecha: 29 de junio de 2026
//
//   c) o es un encabezado de Word (ahí alcanza con que tenga la fecha)
//      # Lunes 3 Agosto de 2026 Reunión MACSA — Crecimiento empresarial
//      # FECHA Y TÍTULO: 1 DE JUNIO – Reunión de Accionistas junio 2026
//
// La prosa de la reunión no cuenta: son renglones largos, y los años que
// aparecen ahí («la empresa creció desde 2010») no son fechas de encuentro.
// Dos renglones con la misma fecha son una sola reunión, así que el índice del
// documento no duplica lo que ya está en el cuerpo.
//
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

// ── La frase de lo que se vio ──
// No se interpreta ni se resume nada: se cita la primera frase de contenido que
// el facilitador ya escribió debajo de la fecha. Se saltean las etiquetas
// («Participantes:», «Duración:»), los títulos de sección numerados y los
// encabezados sin punto, que son títulos y no frases.
const ETIQUETA = /^[\wÁÉÍÓÚÑÜáéíóúñü/ ]{3,45}:\s*/;
const NUMERACION = /^\d+([.)\\]|\.\d+)*\s*/;
const LINEAS_ADELANTE = 30;
const FRASE_MIN = 60;
const FRASE_MAX = 240;

function fraseDeContenido(lineas, desde) {
  for (let j = desde + 1; j < lineas.length && j <= desde + LINEAS_ADELANTE; j++) {
    if (lineas[j].nivel >= 1) break;               // empezó otra reunión
    const t = String(lineas[j].texto || '').replace(/^[^\p{L}\d¿¡«"]+/u, '').trim();
    if (!t || t.length < FRASE_MIN) continue;
    if (ETIQUETA.test(t) && t.length < 260) continue;
    if (NUMERACION.test(t) && t.replace(NUMERACION, '').length < 90) continue;
    if (!t.includes('.')) continue;                // un título de sección no lleva punto
    if (t.split(/\s+/).length < 10) continue;
    return recortar(t, FRASE_MAX);
  }
  return '';
}

// Corta en el punto o el espacio más cercano, para no dejar la frase por la mitad
function recortar(t, max) {
  if (t.length <= max) return t;
  const punto = t.lastIndexOf('. ', max);
  if (punto > max * 0.5) return t.slice(0, punto + 1);
  const espacio = t.lastIndexOf(' ', max);
  return t.slice(0, espacio > 0 ? espacio : max).trim() + '…';
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
    .replace(/^\d{1,2}[.)]\s+/, '')                     // numeración de lista: «1. »
    .replace(/\s+\d{1,3}$/, '')                          // número de página del índice
    .replace(/^[\s|·:.,–—-]+|[\s|·:.,–—-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return t;
}

// «Fecha», «Minuta», un número suelto: no son título de nada.
const TITULO_VACIO = /^(fecha|minuta|acta|reunion|reunión|nº\s*\d+|\d+)$/i;

// ── Detección del renglón que marca una reunión ──

const LARGO_MAX = 160;          // más largo que esto ya es prosa, no una fecha
const LARGO_CON_PALABRA = 120;  // si la fecha no arranca el renglón, más corto todavía
// «Fecha» solo cuenta como etiqueta («Fecha: 29 de junio»), no suelta en una
// oración («se acordó con fecha 5 de mayo»), que es prosa y no una reunión.
const PALABRAS = /\b(reunion|minuta|encuentro|sesion|presentacion)\b|\bfecha\s*:/;
// El arranque del renglón, salteando emojis, símbolos, viñetas y el día de la semana
const ARRANQUE = /^[^a-z0-9]*(?:(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s*,?\s*)?/;

// ¿Este renglón (que no es un encabezado de Word) marca una reunión?
export function esRenglonDeFecha(texto) {
  const bruto = String(texto || '').trim();
  if (!bruto || bruto.length > LARGO_MAX) return false;
  const t = sinTildes(bruto).replace(/\s+/g, ' ');
  // Solo día+mes o fecha numérica: «agosto 2025» suelto no alcanza para contar
  // una reunión, aparece en cualquier párrafo.
  const dm = diaYMes(t);
  const num = t.match(/\b\d{1,2}[/.-]\d{1,2}[/.-](?:20)?\d{2}\b|\b20\d{2}-\d{1,2}-\d{1,2}\b/);
  if (!dm && !num) return false;
  const marca = num ? num[0] : `${dm.dia}`;
  const resto = t.replace(ARRANQUE, '');
  if (resto.startsWith(marca) || resto.startsWith(`0${marca}`)) return true;
  return bruto.length <= LARGO_CON_PALABRA && PALABRAS.test(t);
}

// ── Google Docs exportado a HTML ──
// Se leen TODOS los párrafos en orden, no solo los encabezados: casi ninguna
// bitácora del grupo usa estilos de Word para separar las reuniones.
export function reunionesDesdeHtml(html) {
  const lineas = [];
  const rx = /<(h([1-6])|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = rx.exec(html)) !== null) {
    const texto = limpiarHtml(m[3]);
    if (texto) lineas.push({ nivel: m[2] ? Math.min(3, +m[2]) : 0, texto });
  }
  return desdeLineas(lineas);
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

// ── Renglones → reuniones ──
// Devuelve { reuniones, sinFecha }: las fechas que se reconocieron y los
// encabezados de primer nivel que parecen una reunión pero no tienen fecha.
export function desdeLineas(lineas) {
  const norm = (lineas || []).map(l =>
    typeof l === 'string' ? { nivel: 1, texto: l } : { nivel: l.nivel || 0, texto: l.texto || '' });

  const marcas = [];
  norm.forEach((l, i) => {
    if (!l.texto) return;
    const esEncabezado = l.nivel >= 1;
    if (!esEncabezado && !esRenglonDeFecha(l.texto)) return;
    const f = fechaDeTexto(l.texto);
    if (f) { marcas.push({ estado: 'completa', fecha: f.fecha, aproximada: f.aproximada, i, texto: l.texto, nivel: l.nivel }); return; }
    const p = fechaSinAnioDeTexto(l.texto);
    if (p) { marcas.push({ estado: 'parcial', mes: p.mes, dia: p.dia, i, texto: l.texto, nivel: l.nivel }); return; }
    if (l.nivel === 1) marcas.push({ estado: 'ninguna', i, texto: l.texto, nivel: l.nivel });
  });

  deducirAnios(marcas);

  // Una fecha puede aparecer varias veces: en el índice del documento y en el
  // cuerpo. Es UNA reunión, y el título sale del renglón que mejor la describe:
  // el último que diga algo (el índice va arriba, la reunión abajo).
  const porFecha = new Map();
  for (const m of marcas) {
    if (!m.fecha) continue;
    if (!porFecha.has(m.fecha)) porFecha.set(m.fecha, []);
    porFecha.get(m.fecha).push(m);
  }

  const tituloDe = grupo => {
    const utiles = grupo
      .map(m => ({ m, t: tituloLimpio(m.texto) }))
      .filter(x => x.t.length > 3 && !TITULO_VACIO.test(x.t));
    if (utiles.length) return utiles.at(-1).t;
    // El renglón era solo la fecha: se toma el primer renglón corto de abajo.
    const m = grupo[0];
    for (let j = m.i + 1; j < norm.length && j <= m.i + 3; j++) {
      const t = norm[j].texto;
      if (!t || t.length > LARGO_CON_PALABRA) break;
      const limpio = tituloLimpio(t);
      if (limpio && !TITULO_VACIO.test(limpio)) return limpio;
      break;
    }
    return '';
  };

  const reuniones = [...porFecha.entries()].map(([fecha, grupo]) => ({
    fecha,
    fechaAproximada: grupo.some(m => m.aproximada),
    anioDeducido: grupo.every(m => m.anioDeducido),
    titulo: tituloDe(grupo),
    // La frase se busca desde el último renglón que menciona esta fecha: el
    // índice del documento está arriba y no tiene contenido debajo.
    frase: fraseDeContenido(norm, grupo.at(-1).i),
    encabezado: grupo[0].texto,
  }));
  reuniones.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  // Se numeran desde la más vieja: «reunión 7» es la séptima de esa empresa.
  const total = reuniones.length;
  reuniones.forEach((r, i) => { r.numero = total - i; });

  // Una sección se reporta «sin fecha» solo si NO hay ninguna reunión adentro,
  // entre ese encabezado y el siguiente del mismo nivel. Un encabezado repetido
  // que hace de separador, con la fecha en el renglón de abajo, está bien.
  const sinFecha = marcas
    .filter(m => !m.fecha && m.nivel === 1)
    .filter(m => {
      const sig = marcas.find(o => o.i > m.i && o.nivel === 1);
      const hasta = sig ? sig.i : Infinity;
      return !marcas.some(o => o.fecha && o.i > m.i && o.i < hasta);
    })
    .map(m => m.texto);
  return { reuniones, sinFecha };
}

// Las bitácoras que escriben «09 de Febrero» sin el año se leen igual: se busca
// la reunión fechada más cercana del documento y se elige el año que deja las
// dos fechas lo más juntas posible. Sirve tanto si el documento va de la más
// nueva a la más vieja como al revés, sin tener que adivinar el orden.
function deducirAnios(marcas) {
  const anclas = marcas.map((m, i) => ({ m, i })).filter(x => x.m.estado === 'completa');
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

// Compatibilidad con las pruebas: una lista de encabezados sueltos
export function desdeEncabezados(encabezados) {
  return desdeLineas(encabezados);
}

// ── Texto plano ──
// El último recurso, para las bitácoras que Google no exporta a HTML por
// tamaño. No hay encabezados: cada renglón vale por sí mismo, y las fechas se
// reconocen igual porque cada reunión arranca en su propio renglón.
export function reunionesDesdeTextoPlano(txt) {
  const lineas = String(txt || '')
    .split(/\r?\n/)
    .map(t => ({ nivel: 0, texto: t.replace(/\s+/g, ' ').trim() }))
    .filter(l => l.texto);
  return desdeLineas(lineas);
}

// ── .docx ──
// Igual que el HTML: se leen todos los párrafos en orden, marcando cuáles
// llevan estilo de encabezado.
export function reunionesDesdeDocxXml(xml) {
  const lineas = [];
  const rxP = /<w:p\b[\s\S]*?<\/w:p>/g;
  let m;
  while ((m = rxP.exec(xml)) !== null) {
    const texto = textoDeParrafo(m[0]);
    if (texto) lineas.push({ nivel: nivelDeParrafo(m[0]), texto });
  }
  return desdeLineas(lineas);
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
