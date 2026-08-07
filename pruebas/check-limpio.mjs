// Verifica que NADA de contenido esté hardcodeado: se corre dos veces, una con
// la planilla conectada y otra con /api/base caído (grupo nuevo, sin conectar).
import { chromium } from 'playwright-core';

const SHOT = new URL('.', import.meta.url).pathname + 'capturas';
const ok = (n, c) => console.log((c ? '✅' : '❌') + ' ' + n);

// Estado limpio del mock antes de empezar (las suites comparten servidor)
await fetch('http://localhost:8099/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: '_reset' }) });

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ── 1) Grupo NUEVO: sin planilla conectada, no puede aparecer contenido de El Faro ──
const p1 = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const err1 = [];
p1.on('pageerror', e => err1.push('PAGEERROR: ' + e.message));
await p1.route('**/api/base**', r => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Todavía no hay planilla base conectada.', faltaConectar: true }) }));
await p1.route('**/api/db**', async r => {
  if (r.request().method() !== 'GET') return r.continue();
  const res = await r.fetch();
  const j = await res.json();
  j.content = {};                       // grupo nuevo: nada configurado
  j.meetings = [];
  r.fulfill({ response: res, body: JSON.stringify(j) });
});
await p1.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
await p1.waitForTimeout(900);

const sucio = await p1.evaluate(() => {
  const txt = document.body.innerText;
  const marcas = ['El Faro', 'MACSA', 'Tricampo', 'Cecilia', 'Federico', 'Aapresid', 'Becker', 'Sinagro', 'Beheran', 'Bermúdez', 'Simpleza'];
  return marcas.filter(m => txt.includes(m));
});
ok('sin planilla no aparece ningún dato del grupo (encontrados: ' + (sucio.join(', ') || 'ninguno') + ')', sucio.length === 0);
ok('el título del navegador tampoco trae el grupo', !/faro/i.test(await p1.title()));
ok('la portada explica que falta conectar la planilla',
  /planilla base/i.test(await p1.innerText('#home-grupo')));

for (const sec of ['grupo', 'empresas', 'procesos', 'eventos', 'recursos']) {
  await p1.evaluate(s => navigate(s), sec);
  await p1.waitForTimeout(500);
  const t = await p1.innerText('#sec-' + sec);
  ok(`«${sec}» explica de dónde sale su contenido`, /planilla|Drive|Configuración/i.test(t));
}
await p1.evaluate(() => navigate('grupo'));
await p1.waitForTimeout(300);
await p1.screenshot({ path: SHOT + '/11-sin-conectar.png', fullPage: true });
console.log('ERRORES JS (grupo nuevo):', err1.length ? err1 : 'ninguno');
await p1.close();

// ── 2) Con la planilla conectada: la identidad sale de ella ──
const p2 = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const err2 = [];
p2.on('pageerror', e => err2.push('PAGEERROR: ' + e.message));
await p2.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
await p2.waitForTimeout(1000);
const ident = await p2.evaluate(() => ({
  brand: (document.getElementById('brand-name') || {}).textContent,
  sub: (document.getElementById('brand-sub') || {}).textContent,
  badge: (document.getElementById('brand-badge') || {}).textContent,
  topbar: (document.getElementById('topbar-brand-sub') || {}).textContent,
  equipo: [...document.querySelectorAll('#sidebar-equipo .faci')].map(e => e.textContent.replace(/\s+/g, ' ').trim()),
  titulo: document.title,
  empresasSub: (document.getElementById('empresas-subtitle') || {}).textContent,
}));
console.log('IDENTIDAD', JSON.stringify(ident, null, 1));
ok('el nombre del grupo sale de la planilla', ident.brand === 'Grupo El Faro');
ok('el equipo del menú sale de la pestaña EQUIPO', ident.equipo.length === 2 && /Cecilia/.test(ident.equipo[0]));

// El mapa de Configuración
await p2.evaluate(() => openDashLogin());
await p2.fill('#login-pwd', 'faro26');
await p2.evaluate(() => tryDashLogin());
await p2.waitForTimeout(400);
await p2.evaluate(() => navigate('config'));
await p2.waitForTimeout(600);
await p2.evaluate(() => configPestana('sitio'));   // el mapa y los accesos viven acá
await p2.waitForTimeout(900);
const mapa = await p2.evaluate(() => ({
  filas: document.querySelectorAll('.mapa-fila').length,
  estados: [...document.querySelectorAll('.mapa-fila .badge')].map(e => e.textContent).slice(0, 6),
  modoRegistro: (document.getElementById('config-accesos') || {}).innerText.includes('Solo por lista'),
}));
console.log('MAPA', JSON.stringify(mapa, null, 1));
ok('el mapa lista todas las secciones', mapa.filas >= 18);
ok('el panel de accesos dice el modo de registro', mapa.modoRegistro);
await p2.screenshot({ path: SHOT + '/12-config-mapa.png', fullPage: true });

// Registro con un mail inventado
await p2.evaluate(() => navigate('dashboard'));
const rechazo = await p2.evaluate(async () => {
  const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'registro', email: 'inventado@nada.com', password: 'loquesea1', nombre: 'X', empresa: 'Y' }) });
  return { status: r.status, body: await r.json() };
});
ok('un email inventado no puede registrarse', rechazo.status === 403 && /no figura en la lista/i.test(rechazo.body.error));

console.log('ERRORES JS (con planilla):', err2.length ? err2 : 'ninguno');

// ── Sin GRUPO_ID cargada, el sitio avisa en vez de verse vacío ──
// Esto pasó de verdad en producción: al no estar la variable, el sitio cayó en
// otro grupo, se vio vacío y pareció que se habían borrado los datos.
await fetch('http://localhost:8099/api/auth', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: '_faltaGrupoId', valor: true }),
});
const pg = await b.newPage({ viewport: { width: 1200, height: 900 } });
await pg.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
await pg.waitForTimeout(1500);
const aviso = await pg.evaluate(() => {
  const e = document.getElementById('falta-grupo');
  return e ? e.textContent.replace(/\s+/g, ' ').trim() : '';
});
console.log('aviso:', JSON.stringify(aviso.slice(0, 90)));
ok('sin GRUPO_ID el sitio avisa qué falta, no se muestra vacío', /GRUPO_ID/.test(aviso));
ok('y aclara que los datos no se perdieron', /no se perdieron/.test(aviso));

await fetch('http://localhost:8099/api/auth', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: '_faltaGrupoId', valor: false }),
});
const pk = await b.newPage({ viewport: { width: 1200, height: 900 } });
await pk.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
await pk.waitForTimeout(1200);
ok('con GRUPO_ID cargada el aviso no aparece',
  await pk.evaluate(() => !document.getElementById('falta-grupo')));

await b.close();
