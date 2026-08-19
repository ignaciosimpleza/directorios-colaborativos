import { chromium } from 'playwright-core';

const SHOT = new URL('.', import.meta.url).pathname + 'capturas';

// Estado limpio del mock antes de empezar (las suites comparten servidor)
await fetch('http://localhost:8099/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: '_reset' }) });

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1400, height: 1100 } });
const errores = [];
p.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
p.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));

await p.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
await p.waitForTimeout(900);

const dash = await p.evaluate(() => {
  const t = id => (document.getElementById(id) || {}).textContent || '';
  const vis = id => { const e = document.getElementById(id); return e ? getComputedStyle(e).display !== 'none' : null; };
  return {

    porEmpresa: [...document.querySelectorAll('.rp-card')].map(e => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 60)),
    anios: [...document.querySelectorAll('.rp-anio option')].map(o => o.value),
    actividad: document.querySelectorAll('#actividad-reciente .act-item').length,
    proximas: document.querySelectorAll('#proximas-reuniones .historial-item').length,
    novedadesVisible: vis('card-novedades'),
    novedadesSub: t('novedades-sub'),
    banner: t('home-banner').replace(/\s+/g, ' ').trim().slice(0, 90),
  };
});
console.log('DASHBOARD', JSON.stringify(dash, null, 1));

await p.screenshot({ path: SHOT + '/01-dashboard.png', fullPage: true });

// Filtro por año
await p.selectOption('.rp-anio', '2025');
await p.waitForTimeout(300);
console.log('2025 →', await p.evaluate(() => [...document.querySelectorAll('.rp-card-n')].map(e => e.textContent)));
await p.selectOption('.rp-anio', '2026');
await p.waitForTimeout(300);
console.log('2026 →', await p.evaluate(() => [...document.querySelectorAll('.rp-card-n')].map(e => e.textContent)));
await p.selectOption('.rp-anio', 'todos');
await p.waitForTimeout(200);

// Recursos → reuniones técnicas y herramientas del grupo
const ok = (cond, txt) => { console.log((cond ? '✅ ' : '❌ ') + txt); if (!cond) fallos.push(txt); };
const fallos = [];

await p.evaluate(() => navigate('recursos'));
await p.waitForTimeout(900);
const rec = await p.evaluate(() => ({
  carpetas: [...document.querySelectorAll('#tecnicas-box .arb-carpeta-tit')].map(e => e.textContent.replace(/\s+/g, ' ').trim()),
  archivos: document.querySelectorAll('#tecnicas-box .arb-file').length,
  tecnicasVisible: getComputedStyle(document.getElementById('card-tecnicas')).display !== 'none',
  herrArchivos: [...document.querySelectorAll('#herramientas-carpeta .arb-file .arb-nombre')].map(e => e.textContent),
  herrCarpetas: [...document.querySelectorAll('#herramientas-carpeta .arb-carpeta-tit')].map(e => e.textContent.replace(/\s+/g, ' ').trim()),
  herrVisible: getComputedStyle(document.getElementById('card-herr-drive')).display !== 'none',
  herrIframes: document.querySelectorAll('#herramientas-carpeta iframe').length,
}));
console.log('RECURSOS', JSON.stringify(rec, null, 1));
await p.screenshot({ path: SHOT + '/02-recursos.png', fullPage: true });

// La carpeta de herramientas se lee por /api/drive (cuenta de servicio), no en
// un iframe de Drive: el iframe solo se veía si la carpeta era pública, y por
// eso la tarjeta aparecía vacía aunque el id estuviera bien cargado.
ok(rec.herrVisible, 'la tarjeta de Herramientas del grupo se ve con la carpeta cargada');
ok(rec.herrIframes === 0, 'y ya no depende del visor embebido de Drive');
ok(rec.herrArchivos.includes('Tablero de comando.xlsx'), 'lista los archivos de la carpeta');
ok(rec.herrCarpetas.some(c => /Matrices/.test(c)), 'y también sus subcarpetas');

// El bug que dejó la tarjeta invisible aun después de leerla bien: el árbol
// escribe «Carpeta vacía» por cada subcarpeta sin archivos, y auto-ocultar leía
// ese cartel anidado como «este bloque no tiene datos». Una sola subcarpeta
// vacía —lo más común en Drive— borraba la tarjeta entera.
const anidado = await p.evaluate(() => ({
  subcarpetasVacias: document.querySelectorAll('#card-herr-drive .proc-vacio').length,
  archivos: document.querySelectorAll('#herramientas-carpeta .arb-file').length,
  visible: getComputedStyle(document.getElementById('card-herr-drive')).display !== 'none',
}));
ok(anidado.subcarpetasVacias > 0, 'la carpeta de prueba tiene una subcarpeta vacía adentro');
ok(anidado.archivos > 0, 'y archivos de verdad');
ok(anidado.visible, 'una subcarpeta vacía NO hace desaparecer la tarjeta');

// Una carpeta cargada que el sitio no puede leer no se puede ocultar: si se
// ocultara, el problema quedaría invisible justo para quien lo tiene que ver.
await p.evaluate(async () => {
  DRIVE_CONFIG.herramientasFolderId = 'roto';
  await renderHerramientas();
});
await p.waitForTimeout(600);
const roto = await p.evaluate(() => ({
  visible: getComputedStyle(document.getElementById('card-herr-drive')).display !== 'none',
  texto: (document.querySelector('#herramientas-carpeta .rec-falla') || {}).textContent || '',
  editando: dashEditing,
}));
ok(!roto.editando, 'la prueba corre fuera de modo edición');
ok(roto.visible, 'una carpeta que no se puede leer NO se oculta');
ok(/no puede leerla/.test(roto.texto), 'y la tarjeta dice qué pasa');
ok(/Lector/.test(roto.texto), 'y qué hay que hacer para arreglarlo');

// La forma que rompía en los grupos de verdad: la raíz sin ningún archivo
// suelto y todo colgando de subcarpetas por año y por mes. El sitio la mostraba
// vacía porque el servidor le contestaba 0 archivos.
await p.evaluate(async () => { DRIVE_CONFIG.herramientasFolderId = 'anidado'; await renderHerramientas(); });
await p.waitForTimeout(600);
const anid = await p.evaluate(() => ({
  visible: getComputedStyle(document.getElementById('card-herr-drive')).display !== 'none',
  archivos: [...document.querySelectorAll('#herramientas-carpeta .arb-file .arb-nombre')].map(e => e.textContent),
  nota: (document.querySelector('#herramientas-carpeta .rec-note') || {}).textContent || '',
}));
ok(anid.visible, 'una carpeta con todo en subcarpetas se ve');
ok(anid.archivos.some(n => /Análisis de negocios/.test(n)), 'muestra el archivo que está a un nivel de profundidad');
ok(anid.archivos.some(n => /Costos febrero/.test(n)), 'y el que está a dos niveles');
ok(/2 archivos/.test(anid.nota), 'y los cuenta bien, sin contar carpetas como archivos');

// Una carpeta cargada y vacía tampoco desaparece: si alguien pegó ese id,
// tiene que ver qué pasó con él.
await p.evaluate(async () => {
  DRIVE_CONFIG.herramientasFolderId = 'vacia';
  await renderHerramientas();
});
await p.waitForTimeout(400);
const vacia = await p.evaluate(() => ({
  visible: getComputedStyle(document.getElementById('card-herr-drive')).display !== 'none',
  texto: (document.getElementById('herramientas-carpeta') || {}).textContent || '',
}));
ok(vacia.visible, 'una carpeta vinculada y vacía tampoco se oculta');
ok(/todavía no tiene archivos/.test(vacia.texto), 'y dice que está vacía, no deja el hueco mudo');

// Sin carpeta cargada sí se oculta: ahí no hay nada que decir.
await p.evaluate(async () => { DRIVE_CONFIG.herramientasFolderId = ''; await renderHerramientas(); });
await p.waitForTimeout(400);
ok(await p.evaluate(() => getComputedStyle(document.getElementById('card-herr-drive')).display === 'none'),
   'sin carpeta cargada sí se oculta sola');

await p.evaluate(async () => { DRIVE_CONFIG.herramientasFolderId = 'herr'; await renderHerramientas(); });
await p.waitForTimeout(400);

// Modo edición → Configuración
await p.evaluate(() => setEditing(true));
await p.evaluate(() => navigate('config'));
await p.waitForTimeout(700);
await p.evaluate(() => configPestana('archivos'));
await p.waitForTimeout(500);
const fuentes = await p.evaluate(() => ({
  fuentes: [...document.querySelectorAll('.src-title')].map(e => e.textContent),
  donde: [...document.querySelectorAll('.src-estructura')].filter(e => /Dónde se ve/.test(e.textContent)).length,
}));
await p.evaluate(() => configPestana('sitio'));
await p.waitForTimeout(500);
const cfg = {
  ...fuentes,
  bloques: await p.evaluate(() => document.querySelectorAll('.vis-row input').length),
};
console.log('CONFIG', JSON.stringify(cfg, null, 1));
await p.screenshot({ path: SHOT + '/03-config.png', fullPage: true });

// Apagar un bloque del dashboard y ver que se oculta
await p.evaluate(() => toggleBloque('dash.actividad', false));
await p.evaluate(() => navigate('dashboard'));
await p.waitForTimeout(600);
console.log('actividad oculta →', await p.evaluate(() => getComputedStyle(document.getElementById('card-actividad')).display));
ok(await p.evaluate(() => getComputedStyle(document.getElementById('card-actividad')).display !== 'none'),
   'en modo edición un bloque apagado a mano se ve igual');
ok(await p.evaluate(() => /apagado/.test((document.querySelector('#card-actividad .vis-apagado') || {}).textContent || '')),
   'y dice que está apagado, con dónde prenderlo');
await p.evaluate(() => toggleBloque('dash.actividad', true));
await p.waitForTimeout(300);
console.log('actividad de vuelta →', await p.evaluate(() => getComputedStyle(document.getElementById('card-actividad')).display));
ok(await p.evaluate(() => !document.querySelector('#card-actividad .vis-apagado')),
   'al prenderlo, el cartel se va');

// ── Sello CREA: apagado por defecto, se prende desde modo edición ──
const creaOff = await p.evaluate(() => getComputedStyle(document.getElementById('sidebar-crea')).display);
ok(creaOff === 'none', 'el sello CREA está apagado por defecto');

await p.evaluate(() => toggleCrea(true));
await p.waitForTimeout(400);
const crea = await p.evaluate(() => {
  const el = document.getElementById('sidebar-crea');
  const img = el.querySelector('img');
  const r = img.getBoundingClientRect();
  const grupo = document.querySelector('#brand-logo-side img, #brand-logo-side svg').getBoundingClientRect();
  const simpleza = document.querySelector('.simpleza-logo').getBoundingClientRect();
  return {
    visible: getComputedStyle(el).display !== 'none',
    cargada: img.complete && img.naturalWidth > 0,
    crea: { w: Math.round(r.width), h: Math.round(r.height) },
    grupo: { w: Math.round(grupo.width), h: Math.round(grupo.height) },
    simpleza: { w: Math.round(simpleza.width), h: Math.round(simpleza.height) },
  };
});
console.log('CREA', JSON.stringify(crea));
ok(crea.visible, 'con la casilla tildada el sello aparece en el menú');
ok(crea.cargada, 'y la imagen del logo carga');
ok(crea.crea.w <= crea.grupo.w && crea.crea.h <= crea.grupo.h, 'el sello no supera al logo del grupo');
ok(crea.crea.w <= crea.simpleza.w && crea.crea.h <= crea.simpleza.h, 'ni al de Simpleza');

// Queda guardado: al recargar el sitio sigue prendido.
await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(900);
ok(await p.evaluate(() => getComputedStyle(document.getElementById('sidebar-crea')).display !== 'none'),
   'la elección queda guardada y sobrevive al reload');
await p.screenshot({ path: SHOT + '/04-sello-crea.png', fullPage: false });

await p.evaluate(() => toggleCrea(false));
await p.waitForTimeout(300);
ok(await p.evaluate(() => getComputedStyle(document.getElementById('sidebar-crea')).display === 'none'),
   'y se puede volver a apagar');

console.log('ERRORES:', errores.length ? errores : 'ninguno');
await b.close();
if (fallos.length) { console.error('FALLARON:', fallos); process.exit(1); }
