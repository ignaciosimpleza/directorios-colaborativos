// De dónde saca el sitio las credenciales de la base.
//
// Cuando la base se conecta desde el panel de Vercel, la integración reescribe
// TURSO_DATABASE_URL y TURSO_AUTH_TOKEN en cada despliegue y pisa lo cargado a
// mano. Si además crea una rama por despliegue, cada publicación manda el sitio
// a una copia vacía. DB_URL y DB_TOKEN son nombres que la integración no toca:
// si están, mandan ellos. Esta prueba es la que sostiene esa prioridad.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { credenciales, hayBase } from '../api/_auth.js';

const LIMPIAR = ['DB_URL', 'DB_TOKEN', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'];
const limpiar = () => LIMPIAR.forEach(k => { delete process.env[k]; });

test('sin ninguna variable, el sitio sabe que no tiene base', () => {
  limpiar();
  assert.equal(hayBase(), false);
  assert.deepEqual(credenciales(), { url: undefined, authToken: undefined });
});

test('con las de la integración solas, se usan esas', () => {
  limpiar();
  process.env.TURSO_DATABASE_URL = 'libsql://vieja.turso.io';
  process.env.TURSO_AUTH_TOKEN = 'token-viejo';
  assert.deepEqual(credenciales(), { url: 'libsql://vieja.turso.io', authToken: 'token-viejo' });
  assert.equal(hayBase(), true);
});

test('DB_URL y DB_TOKEN le ganan a lo que escriba la integración', () => {
  limpiar();
  process.env.TURSO_DATABASE_URL = 'libsql://dpl-rama-vacia.turso.io';
  process.env.TURSO_AUTH_TOKEN = 'token-de-la-rama';
  process.env.DB_URL = 'libsql://directorios-colaborativos.turso.io';
  process.env.DB_TOKEN = 'token-propio';
  assert.deepEqual(credenciales(), {
    url: 'libsql://directorios-colaborativos.turso.io',
    authToken: 'token-propio',
  });
});

test('con DB_* solas también alcanza', () => {
  limpiar();
  process.env.DB_URL = 'libsql://propia.turso.io';
  process.env.DB_TOKEN = 'token-propio';
  assert.equal(hayBase(), true);
  assert.equal(credenciales().url, 'libsql://propia.turso.io');
});

test('una sola de las dos no alcanza: no se conecta a medias', () => {
  limpiar();
  process.env.DB_URL = 'libsql://propia.turso.io';
  assert.equal(hayBase(), false, 'falta el token');
  limpiar();
  process.env.DB_TOKEN = 'token-propio';
  assert.equal(hayBase(), false, 'falta la dirección');
});

test('se leen en cada llamada, no al importar el archivo', () => {
  limpiar();
  assert.equal(hayBase(), false);
  process.env.DB_URL = 'libsql://tarde.turso.io';
  process.env.DB_TOKEN = 't';
  assert.equal(hayBase(), true, 'si se leyeran una sola vez, esto fallaría');
  limpiar();
});
