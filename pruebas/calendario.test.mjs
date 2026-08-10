// Las reglas del calendario, escritas como pruebas: si alguna cambia, acá se ve.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNoDisponible, disponibleEn, leerCalendario, aFecha, aDiaSemana, aBooleano } from '../reglas.js';

const noDisp = t => parseNoDisponible(t).reglas;

test('«no_disponible» acepta un mes suelto', () => {
  const r = noDisp('enero');
  assert.equal(disponibleEn(r, '2026-01-12'), false);
  assert.equal(disponibleEn(r, '2027-01-04'), false, 'sin año, aplica todos los años');
  assert.equal(disponibleEn(r, '2026-02-02'), true);
});

test('acepta un rango de meses, incluso si cruza el año', () => {
  const verano = noDisp('diciembre a febrero');
  assert.equal(disponibleEn(verano, '2026-12-21'), false);
  assert.equal(disponibleEn(verano, '2027-01-11'), false);
  assert.equal(disponibleEn(verano, '2027-02-15'), false);
  assert.equal(disponibleEn(verano, '2027-03-01'), true);
});

test('acepta un mes de un año puntual', () => {
  const r = noDisp('julio 2026');
  assert.equal(disponibleEn(r, '2026-07-06'), false);
  assert.equal(disponibleEn(r, '2027-07-05'), true);
});

test('acepta una fecha y un rango de fechas', () => {
  const r = noDisp('6/7/2026, 1/9/2026 a 20/9/2026');
  assert.equal(disponibleEn(r, '2026-07-06'), false);
  assert.equal(disponibleEn(r, '2026-07-13'), true);
  assert.equal(disponibleEn(r, '2026-09-14'), false);
  assert.equal(disponibleEn(r, '2026-09-21'), true);
});

test('combina varias reglas en la misma celda', () => {
  const r = noDisp('enero, julio 2026, 3/11/2026');
  assert.equal(disponibleEn(r, '2026-01-05'), false);
  assert.equal(disponibleEn(r, '2026-07-20'), false);
  assert.equal(disponibleEn(r, '2026-11-03'), false);
  assert.equal(disponibleEn(r, '2026-05-04'), true);
});

// Los miércoles de marzo de 2026 son 4, 11, 18 y 25; los de abril, 1, 8, 15,
// 22 y 29. Marzo tiene 31 días y su última semana (29 al 31) no tiene ninguno:
// por eso «la última» se cuenta desde el final del mes y no como «la quinta».
test('«no puede la primera semana del mes» vale todos los meses', () => {
  const r = noDisp('primera semana del mes');
  assert.equal(disponibleEn(r, '2026-03-04'), false);
  assert.equal(disponibleEn(r, '2026-04-01'), false);
  assert.equal(disponibleEn(r, '2026-03-11'), true);
  assert.equal(disponibleEn(r, '2026-04-29'), true);
});

test('acepta varias semanas, un rango y una cantidad', () => {
  const dos = noDisp('primera y segunda semana');
  assert.equal(disponibleEn(dos, '2026-03-04'), false);
  assert.equal(disponibleEn(dos, '2026-03-11'), false);
  assert.equal(disponibleEn(dos, '2026-03-18'), true);

  const rango = noDisp('primera a tercera semana del mes');
  assert.equal(disponibleEn(rango, '2026-03-18'), false);
  assert.equal(disponibleEn(rango, '2026-03-25'), true);

  const cantidad = noDisp('primeras dos semanas');
  assert.equal(disponibleEn(cantidad, '2026-03-11'), false);
  assert.equal(disponibleEn(cantidad, '2026-03-18'), true);
});

test('«la última semana» es la última reunión del mes, no la número cinco', () => {
  const r = noDisp('última semana del mes');
  assert.equal(disponibleEn(r, '2026-03-25'), false, 'último miércoles de marzo');
  assert.equal(disponibleEn(r, '2026-03-18'), true);
  assert.equal(disponibleEn(r, '2026-02-25'), false, 'febrero tiene una semana menos');
  assert.equal(disponibleEn(r, '2026-04-29'), false, 'abril tiene cinco miércoles');
  assert.equal(disponibleEn(r, '2026-04-22'), true);
});

test('la semana del mes convive con los meses y las fechas', () => {
  const r = noDisp('enero, primera semana del mes, 18/3/2026');
  assert.equal(disponibleEn(r, '2026-01-14'), false, 'enero entero');
  assert.equal(disponibleEn(r, '2026-03-04'), false, 'primera semana');
  assert.equal(disponibleEn(r, '2026-03-18'), false, 'esa fecha suelta');
  assert.equal(disponibleEn(r, '2026-03-11'), true);
});

test('si la semana no se entiende, se avisa en vez de adivinar', () => {
  const { reglas, noEntendido } = parseNoDisponible('la semana de la cosecha');
  assert.equal(reglas.length, 0);
  assert.deepEqual(noEntendido, ['la semana de la cosecha']);
});

test('avisa lo que no entiende en vez de ignorarlo en silencio', () => {
  const { reglas, noEntendido } = parseNoDisponible('enero, cuando termine la cosecha');
  assert.equal(reglas.length, 1);
  assert.deepEqual(noEntendido, ['cuando termine la cosecha']);
});

test('sin nada cargado, la empresa siempre está disponible', () => {
  assert.equal(disponibleEn(noDisp(''), '2026-01-05'), true);
});

test('lee los parámetros de la pestaña CALENDARIO', () => {
  const c = leerCalendario({
    dia_semana: 'Lunes', cadencia_semanas: '1', saltar_feriados: 'TRUE',
    semanas_entre_presentaciones: '6', proporcion_ronda_novedades: '1',
    proporcion_tecnica: '2', hora: '08:00',
  });
  assert.deepEqual(c, {
    diaSemana: 1, hora: '08:00', cadenciaSemanas: 1, saltarFeriados: true,
    semanasEntrePresentaciones: 6, proporcionRonda: 1, proporcionTecnica: 2,
  });
});

test('si la pestaña CALENDARIO está vacía, usa valores por defecto', () => {
  const c = leerCalendario({});
  assert.equal(c.diaSemana, 1);
  assert.equal(c.cadenciaSemanas, 1);
  assert.equal(c.saltarFeriados, true);
  assert.equal(c.semanasEntrePresentaciones, 6);
});

test('entiende los días escritos como los escribe una persona', () => {
  assert.equal(aDiaSemana('miércoles'), 3);
  assert.equal(aDiaSemana('MIERCOLES'), 3);
  assert.equal(aDiaSemana('jueves'), 4);
  assert.equal(aDiaSemana(''), 1, 'sin dato, lunes');
});

test('entiende sí/no de varias formas', () => {
  assert.equal(aBooleano('TRUE'), true);
  assert.equal(aBooleano('Sí'), true);
  assert.equal(aBooleano('no'), false);
  assert.equal(aBooleano(''), true, 'vacío = el valor por defecto');
});

test('entiende las fechas como se escriben en la planilla', () => {
  assert.equal(aFecha('6/7/2026'), '2026-07-06');
  assert.equal(aFecha('2026-07-06'), '2026-07-06');
  assert.equal(aFecha('6 de julio de 2026'), '2026-07-06');
});

test('la proporción entre ronda de novedades y técnica se respeta', async () => {
  const { tipoDeRelleno } = await import('../reglas.js');
  // Proporción 1:2 → de cada tres fechas de relleno, una ronda y dos técnicas
  const salida = [];
  let rondas = 0, tecnicas = 0;
  for (let i = 0; i < 9; i++) {
    const t = tipoDeRelleno(rondas, tecnicas, 1, 2);
    salida.push(t);
    if (t === 'Ronda de novedades') rondas++; else tecnicas++;
  }
  assert.equal(rondas, 3, 'un tercio de rondas');
  assert.equal(tecnicas, 6, 'dos tercios de técnicas');
});

test('con proporción 1:1 se alternan', async () => {
  const { tipoDeRelleno } = await import('../reglas.js');
  let r = 0, t = 0;
  for (let i = 0; i < 6; i++) {
    if (tipoDeRelleno(r, t, 1, 1) === 'Ronda de novedades') r++; else t++;
  }
  assert.equal(r, 3);
  assert.equal(t, 3);
});

test('si una proporción es 0, solo se programa el otro tipo', async () => {
  const { tipoDeRelleno } = await import('../reglas.js');
  assert.equal(tipoDeRelleno(0, 0, 0, 1), 'Técnica');
  assert.equal(tipoDeRelleno(0, 0, 1, 0), 'Ronda de novedades');
  assert.equal(tipoDeRelleno(0, 0, 0, 0), '', 'sin proporciones no se rellena');
});

// ── Cuánto pasó desde la vez anterior ──

test('cuenta los días entre dos fechas, sin que el horario de verano corra un día', async () => {
  const { diasEntre } = await import('../reglas.js');
  assert.equal(diasEntre('2026-03-02', '2026-03-09'), 7);
  assert.equal(diasEntre('2026-03-02', '2026-04-27'), 56);
  assert.equal(diasEntre('2026-03-02', '2026-03-02'), 0);
  assert.equal(diasEntre('2025-12-29', '2026-01-05'), 7, 'cruzando el año');
  assert.equal(diasEntre('2024-02-01', '2024-03-01'), 29, 'febrero bisiesto');
});

test('el intervalo se mide contra la vez anterior de la misma empresa', async () => {
  const { intervalos } = await import('../reglas.js');
  const r = intervalos([
    { date: '2026-03-02', assignment: 'Alfa' },
    { date: '2026-03-09', assignment: 'Beta' },
    { date: '2026-04-27', assignment: 'Alfa' },
    { date: '2026-05-04', assignment: 'Beta' },
  ]);
  assert.equal(r['2026-04-27'].dias, 56);
  assert.equal(r['2026-04-27'].desde, '2026-03-02');
  assert.equal(r['2026-05-04'].dias, 56);
  assert.equal(r['2026-05-04'].desde, '2026-03-09');
});

test('la primera vez de cada empresa no tiene intervalo, y eso no es un cero', async () => {
  const { intervalos } = await import('../reglas.js');
  const r = intervalos([
    { date: '2026-03-02', assignment: 'Alfa' },
    { date: '2026-04-27', assignment: 'Alfa' },
  ]);
  assert.equal(r['2026-03-02'], undefined);
  assert.equal(r['2026-04-27'].dias, 56);
});

test('los eventos también se miden entre sí', async () => {
  const { intervalos } = await import('../reglas.js');
  const r = intervalos([
    { date: '2026-03-02', assignment: 'Técnica' },
    { date: '2026-03-09', assignment: 'Ronda de novedades' },
    { date: '2026-03-30', assignment: 'Técnica' },
  ]);
  assert.equal(r['2026-03-30'].dias, 28);
  assert.equal(r['2026-03-09'], undefined, 'la primera ronda no tiene anterior');
});

test('los huecos de la agenda no se miden', async () => {
  const { intervalos, NO_SE_MIDEN } = await import('../reglas.js');
  const r = intervalos([
    { date: '2026-03-02', assignment: 'Sin reunión' },
    { date: '2026-03-09', assignment: 'Sin reunión' },
    { date: '2026-03-16', assignment: 'Feriado' },
    { date: '2026-03-23', assignment: 'Feriado' },
    { date: '2026-03-30', assignment: 'Flexible' },
    { date: '2026-04-06', assignment: 'Flexible' },
  ]);
  assert.deepEqual(r, {}, 'ninguno de estos se repite como evento');
  assert.deepEqual(NO_SE_MIDEN, ['Sin reunión', 'Feriado', 'Flexible']);
});

test('el intervalo no depende del orden en que venga la agenda', async () => {
  const { intervalos } = await import('../reglas.js');
  const desordenada = [
    { date: '2026-04-27', assignment: 'Alfa' },
    { date: '2026-03-02', assignment: 'Alfa' },
    { date: '2026-06-22', assignment: 'Alfa' },
  ];
  const r = intervalos(desordenada);
  assert.equal(r['2026-04-27'].dias, 56);
  assert.equal(r['2026-06-22'].dias, 56);
  assert.equal(desordenada[0].date, '2026-04-27', 'no toca el arreglo que recibe');
});

test('una reunión sin empresa asignada no rompe ni arrastra el intervalo', async () => {
  const { intervalos } = await import('../reglas.js');
  const r = intervalos([
    { date: '2026-03-02', assignment: 'Alfa' },
    { date: '2026-03-09', assignment: '' },
    { date: '2026-03-16' },
    null,
    { date: '2026-04-27', assignment: 'Alfa' },
  ]);
  assert.equal(Object.keys(r).length, 1);
  assert.equal(r['2026-04-27'].dias, 56);
});
