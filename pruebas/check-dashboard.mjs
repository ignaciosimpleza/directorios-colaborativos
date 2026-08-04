// Verifica lo que el grupo pidió ver en la portada: los números de reuniones de
// cada empresa sacados de la bitácora, el gráfico, el filtro por año y que las
// reuniones técnicas se vean en Recursos.
import { chromium } from 'playwright-core';

const SHOT = new URL('.', import.meta.url).pathname + 'capturas';
const ok = (n, c) => console.log((c ? '✅' : '❌') + ' ' + n);

await fetch('http://localhost:8099/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: '_reset' }) });

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1400, height: 1100 } });
const errores = [];
p.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));

await p.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
await p.waitForSelector('.rp-bar-row', { timeout: 15000 });
await p.waitForTimeout(400);

// ── Números por empresa desde la bitácora ──
const barras = await p.evaluate(() =>
  [...document.querySelectorAll('.rp-bar-row')].map(r => ({
    empresa: r.querySelector('.rp-bar-name').textContent.trim(),
    n: +r.querySelector('.rp-bar-num').textContent.trim(),
    ancho: (r.querySelector('.rp-bar-fill') || {}).style?.width || '0',
  })));
console.log('barras:', JSON.stringify(barras));
ok('hay una barra por empresa', barras.length === 3);
ok('MACSA cuenta 7 reuniones de su bitácora', barras.find(x => /MACSA/.test(x.empresa))?.n === 7);
ok('El Sueño cuenta 3', barras.find(x => /Sueño/.test(x.empresa))?.n === 3);
ok('la empresa sin bitácora queda en 0', barras.find(x => /Tricampo/.test(x.empresa))?.n === 0);
ok('el gráfico dibuja la barra más larga al 100%', barras.some(x => x.ancho === '100%'));

const stats = await p.evaluate(() => [...document.querySelectorAll('.rp-stat')].map(e => e.textContent.replace(/\s+/g, ' ').trim()));
console.log('totales:', JSON.stringify(stats));
ok('el total de reuniones de empresa es 10', /^10\D/.test(stats[0]));
ok('muestra cuántas empresas presentaron', /2\/3/.test(stats[2].replace(/\s/g, '')));

// ── Filtro por año ──
const anios = await p.evaluate(() => [...document.querySelectorAll('.rp-anio option')].map(o => o.value));
console.log('años:', JSON.stringify(anios));
ok('el selector ofrece los años de las bitácoras', anios.includes('2026') && anios.includes('2022'));
await p.selectOption('.rp-anio', '2026');
await p.waitForTimeout(300);
const n2026 = await p.evaluate(() => [...document.querySelectorAll('.rp-bar-num')].map(e => +e.textContent));
ok('filtrando 2026 bajan los números (MACSA 2, El Sueño 2)', n2026[0] === 2 && n2026[1] === 2);
await p.selectOption('.rp-anio', 'todos');
await p.waitForTimeout(300);

// ── Actividad reciente = últimas reuniones con fecha y tema ──
const act = await p.evaluate(() =>
  [...document.querySelectorAll('#actividad-reciente .activity-item')].map(e => e.textContent.replace(/\s+/g, ' ').trim()));
console.log('actividad:', JSON.stringify(act.slice(0, 3)));
ok('la actividad reciente muestra reuniones con su tema', act.length > 0 && /MACSA.*Crecimiento/.test(act[0]));
ok('y la más nueva va primero', /3 ago 2026/.test(act[0]));

await p.screenshot({ path: SHOT + '/20-dashboard.png', fullPage: true });

// ── Reuniones técnicas en Recursos ──
await p.evaluate(() => navigate('recursos'));
await p.waitForTimeout(1200);
const rec = await p.evaluate(() => {
  const card = document.getElementById('card-tecnicas');
  return {
    visible: card && getComputedStyle(card).display !== 'none',
    carpetas: [...document.querySelectorAll('#tecnicas-box .arb-carpeta-tit')].map(e => e.textContent.replace(/\s+/g, ' ').trim()),
    archivos: document.querySelectorAll('#tecnicas-box .arb-file').length,
  };
});
console.log('recursos:', JSON.stringify(rec));
ok('la tarjeta de Reuniones técnicas se ve', rec.visible);
ok('lista las subcarpetas del material técnico', rec.carpetas.length >= 2);
ok('y sus archivos', rec.archivos >= 4);
await p.screenshot({ path: SHOT + '/21-recursos.png', fullPage: true });

// ── Autodetección de carpetas y logo como imagen ──
await p.evaluate(() => openDashLogin());
await p.fill('#login-pwd', 'faro26');
await p.evaluate(() => tryDashLogin());
await p.waitForTimeout(500);
await p.evaluate(() => navigate('config'));
await p.waitForTimeout(800);
await p.fill('#src-raizFolderId', '1RdZfN28PJEVPwFj04ymstaKJIDsCcXjY');
await p.evaluate(() => detectarContenido());
await p.waitForTimeout(1200);
const det = await p.evaluate(() => ({
  estado: (document.getElementById('src-status-raizFolderId') || {}).textContent || '',
  logo: DRIVE_CONFIG.logoFileId,
  logoImg: !!document.querySelector('#brand-logo-side img'),
}));
console.log('detección:', JSON.stringify(det));
ok('detectar contenido completa las fuentes solas', /Se completaron/.test(det.estado));
ok('y deja el logo apuntando a la imagen de Drive', !!det.logo);
ok('el logo se muestra como imagen servida por el sitio', det.logoImg);

// En modo edición nada se auto-oculta: hay que ver qué falta
await p.evaluate(() => navigate('recursos'));
await p.waitForTimeout(600);
const enEdicion = await p.evaluate(() =>
  ['card-marco', 'card-tecnicas', 'card-herr-web', 'card-herr-drive']
    .every(id => getComputedStyle(document.getElementById(id)).display !== 'none'));
ok('en modo edición se ven todas las tarjetas, aunque estén vacías', enEdicion);

console.log('ERRORES JS:', errores.length ? errores : 'ninguno');
await b.close();
