// Reglas de la agenda del grupo — las usan el sitio y las funciones de /api.
//
// Todo lo que decide la agenda vive en la planilla, no en el código ni en la
// cabeza de quien la usa:
//
//   pestaña CALENDARIO   → cada cuánto se reúnen, qué día, cada cuántas
//                          reuniones va una ronda de novedades o una técnica
//   pestaña SIN_REUNION  → las semanas en que el grupo no se reúne
//   pestaña EMPRESAS     → columna «activa» y columna «no_disponible»
//
// Este archivo solo interpreta esos valores. No lee Drive ni dibuja nada, así
// que se puede probar solo (ver pruebas/calendario.test.mjs).

const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const DIAS = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
};

export const sinTildes = s => String(s == null ? '' : s)
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const pad2 = n => String(n).padStart(2, '0');
const iso = (a, m, d) => `${a}-${pad2(m)}-${pad2(d)}`;

// ── Valores sueltos de la planilla ──
export function aDiaSemana(v, porDefecto = 1) {
  const t = sinTildes(v);
  if (t in DIAS) return DIAS[t];
  const n = parseInt(t, 10);
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : porDefecto;
}

export function aNumero(v, porDefecto) {
  const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

export function aBooleano(v, porDefecto = true) {
  const t = sinTildes(v);
  if (!t) return porDefecto;
  if (['true', 'si', 'sí', 'x', '1', 'verdadero'].includes(t)) return true;
  if (['false', 'no', '0', 'falso'].includes(t)) return false;
  return porDefecto;
}

// Una fecha suelta: «6/7/2026», «2026-07-06», «6 de julio de 2026»
export function aFecha(v, anioPorDefecto) {
  const t = sinTildes(v);
  if (!t) return null;
  let m = t.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](20\d{2}|\d{2}))?$/);
  if (m) {
    const anio = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : anioPorDefecto;
    if (!anio) return null;
    return iso(anio, +m[2], +m[1]);
  }
  m = t.match(/^(\d{1,2})\s*(?:de\s+)?([a-z]+)\s*(?:de\s+)?(20\d{2})?$/);
  if (m && MESES[m[2]]) {
    const anio = m[3] ? +m[3] : anioPorDefecto;
    if (!anio) return null;
    return iso(anio, MESES[m[2]], +m[1]);
  }
  return null;
}

// ── Semanas del mes ──
// «Simpleza no puede las primeras semanas del mes» es una restricción distinta
// de las otras: no cae en un mes ni en un rango de fechas, se repite todos los
// meses. Como el grupo se reúne siempre el mismo día de la semana, la enésima
// semana del mes y la enésima reunión del mes son lo mismo: los días 1 a 7 son
// la primera, del 8 al 14 la segunda, y así.
const ORDINALES = {
  primera: 1, primer: 1, primero: 1, '1': 1, '1ra': 1, '1a': 1, '1er': 1, '1ro': 1,
  segunda: 2, segundo: 2, '2': 2, '2da': 2, '2a': 2, '2do': 2,
  tercera: 3, tercer: 3, tercero: 3, '3': 3, '3ra': 3, '3a': 3, '3er': 3, '3ro': 3,
  cuarta: 4, cuarto: 4, '4': 4, '4ta': 4, '4a': 4, '4to': 4,
  quinta: 5, quinto: 5, '5': 5, '5ta': 5, '5a': 5, '5to': 5,
};

const CANTIDADES = { dos: 2, tres: 3, cuatro: 4, 2: 2, 3: 3, 4: 4 };

// Marca «la última del mes»: cuál es depende de cuántos días tenga el mes, así
// que recién se resuelve al mirar una fecha concreta.
export const ULTIMA_SEMANA = 99;

// Palabras que acompañan pero no dicen nada: «la primera semana del mes».
const RELLENO = new Set(['semana', 'semanas', 'de', 'del', 'la', 'las', 'el', 'los', 'mes']);

// «primera semana del mes», «primera y segunda semana», «primera a tercera
// semana», «semanas 1 y 2», «primeras dos semanas», «última semana del mes».
// Devuelve null si no habla de semanas o si dice algo que no entendemos: es
// preferible avisar que adivinar.
export function parseSemanasDelMes(texto) {
  const t = sinTildes(texto).replace(/[°º]/g, '');
  if (!/\bsemanas?\b/.test(t)) return null;

  // «primeras dos semanas» / «últimas tres semanas»
  const cant = t.match(/\b(primeras|primeros|ultimas|ultimos)\s+(dos|tres|cuatro|[2-4])\b/);
  if (cant) {
    const n = CANTIDADES[cant[2]];
    const desdeElFinal = cant[1].startsWith('ultim');
    const semanas = desdeElFinal
      ? Array.from({ length: n }, (_, i) => ULTIMA_SEMANA - i).reverse()
      : Array.from({ length: n }, (_, i) => i + 1);
    return { tipo: 'semanaMes', semanas };
  }

  const numeros = [];
  let esRango = false;
  for (const p of t.split(/[^a-z0-9]+/).filter(Boolean)) {
    if (RELLENO.has(p)) continue;
    if (p === 'y' || p === 'e') continue;
    if (p === 'a' || p === 'al' || p === 'hasta') { esRango = true; continue; }
    if (p === 'ultima' || p === 'ultimo') { numeros.push(ULTIMA_SEMANA); continue; }
    if (p in ORDINALES) { numeros.push(ORDINALES[p]); continue; }
    return null;   // apareció algo que no sabemos leer
  }
  if (!numeros.length) return null;

  if (esRango && numeros.length === 2 && !numeros.includes(ULTIMA_SEMANA)) {
    const [desde, hasta] = [...numeros].sort((x, y) => x - y);
    return { tipo: 'semanaMes', semanas: Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i) };
  }
  return { tipo: 'semanaMes', semanas: [...new Set(numeros)].sort((x, y) => x - y) };
}

// Qué semana del mes es esa fecha, contando desde el principio y desde el final.
// Contar desde el final no es lo mismo que preguntar si es la quinta: el último
// miércoles de marzo de 2026 es el 25, y los días 29 al 31 de ese mes no tienen
// ninguno. «La última» es la última reunión del mes, no la semana número cinco.
function semanaDelMes(fechaISO) {
  const anio = +fechaISO.slice(0, 4), mes = +fechaISO.slice(5, 7);
  const dia = +fechaISO.slice(8, 10);
  const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return {
    desdeElPrincipio: Math.ceil(dia / 7),
    desdeElFinal: Math.ceil((diasDelMes - dia + 1) / 7),
  };
}

// ── «no_disponible» de cada empresa ──
// Se escriben separados por comas. Formatos admitidos:
//   enero                     → todos los eneros
//   enero a marzo             → esos meses, todos los años
//   julio 2026                → solo julio de 2026
//   6/7/2026                  → ese día
//   1/7/2026 a 20/7/2026      → ese rango
//   primera semana del mes    → esa semana, todos los meses
//   primera y segunda semana  → esas dos, todos los meses
// Devuelve { reglas, noEntendido } para poder avisar lo que no se entendió.
export function parseNoDisponible(texto) {
  const reglas = [];
  const noEntendido = [];
  const partes = String(texto || '').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);

  for (const parte of partes) {
    const t = sinTildes(parte);

    // Primero las semanas del mes: «primera a tercera semana» también tiene un
    // «a» en el medio y si no, se lo tomaría por un rango de fechas.
    if (/\bsemanas?\b/.test(t)) {
      const s = parseSemanasDelMes(parte);
      if (s) reglas.push(s); else noEntendido.push(parte);
      continue;
    }

    const rango = t.split(/\s+(?:a|al|hasta|-)\s+/);

    // Rango o fecha exacta
    if (rango.length === 2) {
      const d1 = aFecha(rango[0]), d2 = aFecha(rango[1]);
      if (d1 && d2) { reglas.push({ tipo: 'rango', desde: d1, hasta: d2 }); continue; }
      const m1 = mesDe(rango[0]), m2 = mesDe(rango[1]);
      if (m1 && m2) { reglas.push({ tipo: 'meses', desde: m1.mes, hasta: m2.mes, anio: m1.anio || m2.anio || null }); continue; }
      noEntendido.push(parte);
      continue;
    }

    const f = aFecha(t);
    if (f) { reglas.push({ tipo: 'rango', desde: f, hasta: f }); continue; }

    const m = mesDe(t);
    if (m) { reglas.push({ tipo: 'meses', desde: m.mes, hasta: m.mes, anio: m.anio }); continue; }

    noEntendido.push(parte);
  }
  return { reglas, noEntendido };
}

function mesDe(t) {
  const m = sinTildes(t).match(/^([a-z]+)\s*(20\d{2})?$/);
  if (!m || !MESES[m[1]]) return null;
  return { mes: MESES[m[1]], anio: m[2] ? +m[2] : null };
}

// ¿La empresa puede presentar esa fecha?
export function disponibleEn(reglas, fechaISO) {
  if (!reglas || !reglas.length) return true;
  const [a, mes] = [+fechaISO.slice(0, 4), +fechaISO.slice(5, 7)];
  for (const r of reglas) {
    if (r.tipo === 'rango') {
      if (fechaISO >= r.desde && fechaISO <= r.hasta) return false;
    } else if (r.tipo === 'meses') {
      if (r.anio && r.anio !== a) continue;
      const dentro = r.desde <= r.hasta
        ? (mes >= r.desde && mes <= r.hasta)
        : (mes >= r.desde || mes <= r.hasta);   // ej: noviembre a febrero
      if (dentro) return false;
    } else if (r.tipo === 'semanaMes') {
      const { desdeElPrincipio, desdeElFinal } = semanaDelMes(fechaISO);
      for (const s of r.semanas) {
        const contadaAlReves = s > ULTIMA_SEMANA - 5;
        if (contadaAlReves ? desdeElFinal === ULTIMA_SEMANA - s + 1 : desdeElPrincipio === s) return false;
      }
    }
  }
  return true;
}

// ── Parámetros de la pestaña CALENDARIO ──
export const CALENDARIO_POR_DEFECTO = {
  diaSemana: 1,                  // lunes
  hora: '',
  cadenciaSemanas: 1,            // hay encuentro todas las semanas
  saltarFeriados: true,
  semanasEntrePresentaciones: 6, // mínimo entre dos presentaciones de la misma empresa
  proporcionRonda: 1,            // de cada (ronda + tecnica) fechas de relleno…
  proporcionTecnica: 1,          // …esta proporción va a cada tipo
};

export function leerCalendario(kv) {
  const g = k => kv[k] !== undefined ? kv[k] : '';
  const d = CALENDARIO_POR_DEFECTO;
  return {
    diaSemana: aDiaSemana(g('dia_semana'), d.diaSemana),
    hora: String(g('hora') || '').trim(),
    cadenciaSemanas: aNumero(g('cadencia_semanas'), d.cadenciaSemanas),
    saltarFeriados: aBooleano(g('saltar_feriados'), d.saltarFeriados),
    semanasEntrePresentaciones: aNumero(g('semanas_entre_presentaciones'), d.semanasEntrePresentaciones),
    proporcionRonda: aNumero(g('proporcion_ronda_novedades'), d.proporcionRonda),
    proporcionTecnica: aNumero(g('proporcion_tecnica'), d.proporcionTecnica),
  };
}

// ── Qué va en una fecha de relleno ──
// Cuando ninguna empresa alcanzó el mínimo de semanas entre presentaciones, la
// fecha se completa con una ronda de novedades o una reunión técnica,
// manteniendo la proporción configurada. Se mira lo ya programado para no
// desviarse: con proporción 1:2 se alternan una ronda cada dos técnicas.
export function tipoDeRelleno(rondasPrevias, tecnicasPrevias, proporcionRonda, proporcionTecnica) {
  const pr = Math.max(0, Number(proporcionRonda) || 0);
  const pt = Math.max(0, Number(proporcionTecnica) || 0);
  if (!pr && !pt) return '';
  if (!pt) return 'Ronda de novedades';
  if (!pr) return 'Técnica';
  // Se elige el tipo que quedó más atrás respecto de su proporción
  const total = rondasPrevias + tecnicasPrevias;
  if (total === 0) return pr >= pt ? 'Ronda de novedades' : 'Técnica';
  return (rondasPrevias / (pr / (pr + pt))) <= (tecnicasPrevias / (pt / (pr + pt)))
    ? 'Ronda de novedades' : 'Técnica';
}

// ── Cuánto pasó desde la vez anterior ──
// «Sin reunión» y «Feriado» son huecos en la agenda, y «Flexible» es una fecha
// todavía sin dueño: ninguno se repite como evento, así que no se miden.
export const NO_SE_MIDEN = ['Sin reunión', 'Feriado', 'Flexible'];

export function diasEntre(desdeISO, hastaISO) {
  const enDias = f => Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10)) / 86400000;
  return Math.round(enDias(hastaISO) - enDias(desdeISO));
}

// Para cada reunión, cuántos días pasaron desde la anterior de la MISMA empresa
// o del mismo evento. Se mide sobre la agenda entera, nunca sobre lo que quedó
// filtrado en pantalla: si no, el número cambiaría según el filtro elegido.
// La primera vez de cada empresa no tiene intervalo, y eso no es un cero.
// Devuelve un mapa por fecha, porque la agenda tiene una reunión por fecha.
export function intervalos(reuniones) {
  const ultima = {};
  const out = {};
  [...reuniones]
    .filter(m => m && m.date && m.assignment && !NO_SE_MIDEN.includes(m.assignment))
    .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
    .forEach(m => {
      const previa = ultima[m.assignment];
      if (previa) out[m.date] = { desde: previa, dias: diasEntre(previa, m.date) };
      ultima[m.assignment] = m.date;
    });
  return out;
}
