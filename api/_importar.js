// Traer el calendario desde el sitio anterior del grupo (grupo3-calendario).
//
// El sitio viejo guarda lo mismo que este —fechas, quién presenta, tema y
// observaciones— pero con otros nombres de empresa («Sacfil» acá es «SACFIL»)
// y con las reglas de la agenda expresadas en días en vez de semanas. Este
// archivo hace solo esa traducción, sin tocar la base ni la red, así se puede
// probar suelto (ver pruebas/importar.test.mjs).

// Palabras que no distinguen a una empresa de otra: «Berardo» y «Berardo
// Agropecuaria» son la misma. Es la misma lista que usa el sitio.
const RUIDO = /^(sa|s|a|srl|sr|l|sas|sca|de|del|la|el|los|las|y|e|agropecuaria|agropecuario|fideicomiso|estudio)$/;

export const tokens = s => String(s || '')
  .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .split(/[^a-z0-9]+/).filter(t => t && !RUIDO.test(t));

// Fechas que no son la presentación de una empresa: se copian tal cual.
export const ESPECIALES = ['Ronda de novedades', 'Técnica', 'Flexible', 'Feriado', 'Sin reunión'];

const igual = (a, b) => tokens(a).join(' ') === tokens(b).join(' ');

// A qué empresa de ESTE sitio corresponde el texto del calendario viejo.
// Primero por nombre (sin mirar mayúsculas ni tildes) y, si no, por palabras:
// «Berardo» entra en «Berardo Agropecuaria». Devuelve null si no hay ninguna,
// para poder avisarlo en vez de inventar una.
export function empresaDestino(texto, empresas) {
  const t = String(texto || '').trim();
  if (!t) return null;
  const nombres = (empresas || []).map(e => (e && e.nombre) || '').filter(Boolean);

  const exacta = nombres.find(n => igual(n, t));
  if (exacta) return exacta;

  const buscadas = tokens(t);
  if (!buscadas.length) return null;
  const parciales = nombres.filter(n => {
    const suyas = new Set(tokens(n));
    return buscadas.every(x => suyas.has(x));
  });
  // Si el texto encaja en dos empresas, no se elige por sorteo: se avisa.
  return parciales.length === 1 ? parciales[0] : null;
}

// Las reuniones del sitio viejo, con los nombres de empresa de este sitio.
// Devuelve también las asignaciones que no se pudieron reconocer, para que
// quien importa vea qué quedó sin empresa en vez de enterarse después.
export function traducirReuniones(reuniones, empresas) {
  const sinEmpresa = new Set();
  const traducidas = (reuniones || [])
    .filter(m => m && m.date)
    .map(m => {
      const texto = String(m.assignment || '').trim();
      let assignment = texto;
      if (texto && !ESPECIALES.includes(texto)) {
        const nombre = empresaDestino(texto, empresas);
        if (nombre) assignment = nombre;
        else sinEmpresa.add(texto);
      }
      return {
        date: m.date,
        assignment,
        obs: m.obs || '',
        topic: m.topic || '',
        fixed: !!m.fixed,
      };
    })
    .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

  return { reuniones: traducidas, sinEmpresa: [...sinEmpresa] };
}

// Las reglas de la agenda. El sitio viejo mide el descanso entre dos
// presentaciones de la misma empresa en días (42) y acá se mide en semanas (6);
// el día de la semana y las proporciones de ronda y técnica son los mismos
// números. El sitio viejo se reúne todas las semanas: de ahí cadenciaSemanas 1.
export function traducirReglas(config) {
  const c = config || {};
  const dias = Number(c.cadence_days);
  const dia = Number(c.meeting_day_of_week);
  const nov = Number(c.novedades_ratio);
  const tec = Number(c.tecnica_ratio);
  return {
    diaSemana: Number.isInteger(dia) && dia >= 0 && dia <= 6 ? dia : 1,
    hora: '',
    cadenciaSemanas: 1,
    saltarFeriados: true,
    semanasEntrePresentaciones: Number.isFinite(dias) && dias > 0 ? Math.max(1, Math.round(dias / 7)) : 6,
    proporcionRonda: Number.isFinite(nov) && nov >= 0 ? nov : 1,
    proporcionTecnica: Number.isFinite(tec) && tec >= 0 ? tec : 1,
  };
}
