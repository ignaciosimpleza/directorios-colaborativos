// Reglas del calendario del grupo.
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

// ── «no_disponible» de cada empresa ──
// Se escribe en criollo, separando con comas. Formas aceptadas:
//   enero                     → todos los eneros
//   enero a marzo             → esos meses, todos los años
//   julio 2026                → solo julio de 2026
//   6/7/2026                  → ese día
//   1/7/2026 a 20/7/2026      → ese rango
// Devuelve { reglas, noEntendido } para poder avisar lo que no se entendió.
export function parseNoDisponible(texto) {
  const reglas = [];
  const noEntendido = [];
  const partes = String(texto || '').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);

  for (const parte of partes) {
    const t = sinTildes(parte);
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
    }
  }
  return true;
}

// ── Parámetros de la pestaña CALENDARIO ──
export const CALENDARIO_POR_DEFECTO = {
  diaSemana: 1,              // lunes
  hora: '',
  cadenciaSemanas: 1,        // una reunión por semana
  saltarFeriados: true,
  rondaNovedadesCada: 0,     // 0 = no se programan solas
  tecnicaCada: 0,
};

export function leerCalendario(kv) {
  const g = k => kv[k] !== undefined ? kv[k] : '';
  return {
    diaSemana: aDiaSemana(g('dia_semana'), CALENDARIO_POR_DEFECTO.diaSemana),
    hora: String(g('hora') || '').trim(),
    cadenciaSemanas: aNumero(g('cadencia_semanas'), CALENDARIO_POR_DEFECTO.cadenciaSemanas),
    saltarFeriados: aBooleano(g('saltar_feriados'), CALENDARIO_POR_DEFECTO.saltarFeriados),
    rondaNovedadesCada: aNumero(g('ronda_novedades_cada'), 0) || 0,
    tecnicaCada: aNumero(g('tecnica_cada'), 0) || 0,
  };
}
