// La plantilla y el parser del sitio tienen que entenderse. Esta prueba abre la
// plantilla que se entrega a los grupos y la pasa por el mismo parser que usa
// el sitio: si alguien cambia una columna de un lado y no del otro, falla acá.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { parseBase } from '../api/base.js';

const ruta = new URL('../plantillas/Plantilla_Base_Grupo.xlsx', import.meta.url);
const base = parseBase(XLSX.read(readFileSync(ruta), { type: 'buffer' }));

const rutaMarco = new URL('../plantillas/Plantilla_Marco_Conceptual.xlsx', import.meta.url);
const marco = parseBase(XLSX.read(readFileSync(rutaMarco), { type: 'buffer' }));

test('la plantilla trae la identidad del grupo', () => {
  assert.equal(base.grupo.nombre, 'Grupo Estratégico Ejemplo');
  assert.equal(base.grupo.tipo, 'Directorio Colaborativo');
  assert.equal(base.grupo.facilitadoPor, 'Simpleza');
  assert.ok(base.grupo.descripcion.length > 20);
  assert.equal(base.grupo.principios.length, 2);
});

test('trae el equipo que se ve al pie del menú', () => {
  assert.equal(base.grupo.equipo.length, 2);
  assert.equal(base.grupo.equipo[0].rol, 'Coordinación del grupo');
});

test('trae las empresas, con activa y no_disponible', () => {
  assert.equal(base.empresas.length, 3);
  const [uno, dos, tres] = base.empresas;
  assert.equal(uno.activa, true);
  assert.equal(tres.activa, false, 'la tercera es el ejemplo de empresa fuera de rotación');
  assert.ok(uno.noDisponibleReglas.length, 'sus restricciones se interpretaron');
  assert.ok(dos.noDisponibleReglas.length);
});

test('trae las reglas del calendario', () => {
  assert.deepEqual(base.calendario, {
    diaSemana: 1, hora: '08:00', cadenciaSemanas: 1, saltarFeriados: true,
    semanasEntrePresentaciones: 26, proporcionRonda: 1, proporcionTecnica: 2,
  });
});

test('trae las semanas sin reunión', () => {
  assert.equal(base.sinReunion.length, 2);
  assert.deepEqual(base.sinReunion[0], { desde: '2026-01-02', hasta: '2026-01-31', motivo: 'Receso de enero' });
});

test('trae hitos, ejes, eventos y accesos', () => {
  assert.equal(base.hitos.length, 2);
  assert.equal(base.ejes.length, 2);
  assert.equal(base.eventos.length, 2);
  assert.equal(base.eventos[0].fecha, '4-5-6/8', 'la fecha de un evento es texto libre');
  assert.equal(base.accesos.length, 1);
});

test('la plantilla no genera ningún aviso: se entiende entera', () => {
  assert.deepEqual(base.avisos, [], 'si esto falla, la plantilla dice algo que el sitio no sabe leer');
});

test('CONFIG_DRIVE puede quedar vacía sin romper nada', () => {
  assert.ok(base.empresas.every(e => !e.driveFolderId), 'sin ids: el sitio los busca por nombre');
});

test('la plantilla del marco conceptual trae los seis ejemplos', () => {
  assert.equal(marco.conceptos.length, 6);
  assert.equal(marco.conceptos[0].titulo, 'Directorio Colaborativo');
  assert.ok(marco.conceptos[0].desc.length > 40);
  assert.equal(marco.conceptos[0].formula, 'entre pares, no consultores', 'la columna frase_corta');
});

// El campo de Drive tiene que entender los enlaces que se copian del navegador
test('del enlace de Drive se extrae el id, sea documento o carpeta', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const src = html.slice(html.indexOf('function extractDriveId'), html.indexOf('async function renderConfig'));
  const extractDriveId = new Function(src + '; return extractDriveId;')();

  const casos = {
    'https://docs.google.com/document/d/1R3FKdR5yFhm/edit?usp=drivesdk&ouid=112108234735738965849': '1R3FKdR5yFhm',
    'https://drive.google.com/drive/folders/1RdZfN28PJEVPwFj04ymstaKJIDsCcXjY': '1RdZfN28PJEVPwFj04ymstaKJIDsCcXjY',
    'https://drive.google.com/drive/u/0/folders/1glfNT1MAjDSUIjbzmyrI6F2VEUWksXvA': '1glfNT1MAjDSUIjbzmyrI6F2VEUWksXvA',
    'https://drive.google.com/file/d/1zwjXVPt7McV6hsDla5ylUJfZUX3UP-5_/view?usp=drivesdk': '1zwjXVPt7McV6hsDla5ylUJfZUX3UP-5_',
    'https://docs.google.com/spreadsheets/d/1lTXBc5COmNj41naJiJHdWjHL9/edit#gid=0': '1lTXBc5COmNj41naJiJHdWjHL9',
    'https://drive.google.com/open?id=1caOZM90DLaM4hndwGp1b6VTllF6dGetn': '1caOZM90DLaM4hndwGp1b6VTllF6dGetn',
    '1hdGYpzGrqIh5gADoVkp9yNp8pPGM29dt': '1hdGYpzGrqIh5gADoVkp9yNp8pPGM29dt',
    '': '',
  };
  for (const [entrada, esperado] of Object.entries(casos)) {
    assert.equal(extractDriveId(entrada), esperado, entrada);
  }
});
