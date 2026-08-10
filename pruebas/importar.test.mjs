// La traducción del calendario del sitio anterior: nombres de empresa y reglas
// de la agenda. Si cambia el criterio, acá se ve.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { empresaDestino, traducirReuniones, traducirReglas } from '../api/_importar.js';

const EMPRESAS = [
  { nombre: 'Altuy' },
  { nombre: 'Berardo Agropecuaria' },
  { nombre: 'Buena Cepa' },
  { nombre: 'Cusillos' },
  { nombre: 'Gestión.ar' },
  { nombre: 'Horreos del SDE' },
  { nombre: 'La Posta' },
  { nombre: 'SACFIL' },
  { nombre: 'Simpleza' },
];

test('reconoce a la empresa aunque cambien mayúsculas y tildes', () => {
  assert.equal(empresaDestino('Sacfil', EMPRESAS), 'SACFIL');
  assert.equal(empresaDestino('Gestion.ar', EMPRESAS), 'Gestión.ar');
  assert.equal(empresaDestino('Simpleza', EMPRESAS), 'Simpleza');
});

test('reconoce a la empresa por el nombre corto', () => {
  assert.equal(empresaDestino('Berardo', EMPRESAS), 'Berardo Agropecuaria');
  assert.equal(empresaDestino('Horreos del SDE', EMPRESAS), 'Horreos del SDE');
  assert.equal(empresaDestino('La Posta', EMPRESAS), 'La Posta');
});

test('no inventa una empresa cuando el nombre no existe', () => {
  assert.equal(empresaDestino('Llorente Hnos', EMPRESAS), null);
  assert.equal(empresaDestino('Agroconsultas', EMPRESAS), null);
  assert.equal(empresaDestino('', EMPRESAS), null);
});

test('con dos empresas parecidas prefiere no elegir', () => {
  const dos = [{ nombre: 'Berardo Hnos' }, { nombre: 'Berardo Sur' }];
  assert.equal(empresaDestino('Berardo', dos), null, 'no alcanza para saber cuál es');
  assert.equal(empresaDestino('Berardo Sur', dos), 'Berardo Sur');
});

test('las fechas se copian con el nombre de acá y ordenadas', () => {
  const { reuniones, sinEmpresa } = traducirReuniones([
    { date: '2026-06-10', assignment: 'Sacfil', obs: '', topic: '', fixed: true },
    { date: '2024-11-06', assignment: 'Llorente Hnos', obs: '', topic: '' },
    { date: '2026-03-04', assignment: 'Técnica', obs: '', topic: 'Pre Mortem' },
  ], EMPRESAS);

  assert.deepEqual(reuniones.map(m => m.date), ['2024-11-06', '2026-03-04', '2026-06-10']);
  assert.equal(reuniones[2].assignment, 'SACFIL');
  assert.equal(reuniones[2].fixed, true);
  assert.equal(reuniones[1].topic, 'Pre Mortem', 'el tema viaja junto con la fecha');
  assert.equal(reuniones[0].assignment, 'Llorente Hnos', 'lo que no se reconoce se copia tal cual');
  assert.deepEqual(sinEmpresa, ['Llorente Hnos'], 'y se avisa');
});

test('las fechas que no son de una empresa se copian sin tocar', () => {
  const { reuniones, sinEmpresa } = traducirReuniones([
    { date: '2025-01-01', assignment: 'Feriado', obs: 'Año Nuevo' },
    { date: '2026-01-07', assignment: 'Sin reunión' },
    { date: '2026-04-29', assignment: 'Ronda de novedades' },
  ], EMPRESAS);
  assert.deepEqual(reuniones.map(m => m.assignment), ['Feriado', 'Sin reunión', 'Ronda de novedades']);
  assert.equal(reuniones[0].obs, 'Año Nuevo');
  assert.deepEqual(sinEmpresa, []);
});

test('las reglas pasan de días a semanas', () => {
  const r = traducirReglas({
    cadence_days: 42, novedades_ratio: 1, tecnica_ratio: 1, meeting_day_of_week: 3,
  });
  assert.equal(r.semanasEntrePresentaciones, 6, '42 días son 6 semanas');
  assert.equal(r.diaSemana, 3, 'miércoles');
  assert.equal(r.cadenciaSemanas, 1, 'el grupo se reúne todas las semanas');
  assert.equal(r.proporcionRonda, 1);
  assert.equal(r.proporcionTecnica, 1);
});

test('sin reglas cargadas usa valores razonables en vez de romper', () => {
  const r = traducirReglas(null);
  assert.equal(r.semanasEntrePresentaciones, 6);
  assert.equal(r.diaSemana, 1);
  assert.equal(r.proporcionRonda, 1);
});
