// Cómo le pregunta el sitio a Google Drive por el contenido de las carpetas.
//
// Hay una sola regla y es la que importa: NUNCA preguntar por varias carpetas
// en la misma consulta. Drive no soporta `'A' in parents or 'B' in parents` y
// —lo peor— no lo dice: responde 200 con la lista vacía. Con eso, una carpeta
// llena organizada en subcarpetas se veía como vacía en todo el sitio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queryHijos, listInParents } from '../api/drive.js';

const CARPETA = 'application/vnd.google-apps.folder';

test('la consulta pregunta por una sola carpeta', () => {
  const q = queryHijos('AAA', false);
  assert.equal(q.match(/in parents/g).length, 1);
  assert.ok(!/ or /.test(q), `la consulta une padres con «or»: ${q}`);
});

test('pide archivos o carpetas según lo que se busque', () => {
  assert.ok(queryHijos('AAA', true).includes(`mimeType='${CARPETA}'`));
  assert.ok(queryHijos('AAA', false).includes(`mimeType!='${CARPETA}'`));
  assert.ok(queryHijos('AAA', false).includes('trashed=false'));
});

test('varias carpetas son varias consultas, una por carpeta', async () => {
  const vistas = [];
  const falsa = async (q) => { vistas.push(q); return [{ id: 'f-' + vistas.length }]; };

  const out = await listInParents(['A', 'B', 'C'], 'files(id)', false, falsa);

  assert.equal(vistas.length, 3, 'tiene que haber una consulta por carpeta');
  for (const q of vistas) {
    assert.equal(q.match(/in parents/g).length, 1, `consulta con más de un padre: ${q}`);
    assert.ok(!/ or /.test(q), `consulta con «or» entre padres: ${q}`);
  }
  assert.deepEqual(vistas.map(q => q.match(/'([^']+)' in parents/)[1]).sort(), ['A', 'B', 'C']);
  assert.equal(out.length, 3, 'y los resultados de todas se juntan');
});

test('sin carpetas no se consulta nada', async () => {
  let llamadas = 0;
  const out = await listInParents([], 'files(id)', false, async () => { llamadas++; return []; });
  assert.equal(llamadas, 0);
  assert.deepEqual(out, []);
});

test('una carpeta vacía no rompe ni descarta a las demás', async () => {
  const falsa = async (q) => (q.includes("'B'") ? [] : [{ id: 'x' }]);
  const out = await listInParents(['A', 'B', 'C'], 'files(id)', false, falsa);
  assert.equal(out.length, 2);
});

test('muchas carpetas: ninguna se pierde ni se agrupa', async () => {
  const ids = Array.from({ length: 60 }, (_, i) => 'c' + i);
  const vistas = [];
  const falsa = async (q) => { vistas.push(q); return [{ id: q.match(/'([^']+)' in/)[1] }]; };

  const out = await listInParents(ids, 'files(id)', true, falsa);

  assert.equal(vistas.length, 60, 'una consulta por carpeta, sin agrupar de a 25');
  assert.deepEqual(out.map(f => f.id).sort(), ids.slice().sort());
});
