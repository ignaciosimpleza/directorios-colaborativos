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
    stats: [...document.querySelectorAll('.rp-stat')].map(e => e.textContent.replace(/\s+/g, ' ').trim()),
    barras: [...document.querySelectorAll('.rp-bar-row')].map(e => e.textContent.replace(/\s+/g, ' ').trim()),
    anios: [...document.querySelectorAll('.rp-anio option')].map(o => o.value),
    actividad: document.querySelectorAll('#actividad-reciente .activity-item').length,
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
console.log('2025 →', await p.evaluate(() => [...document.querySelectorAll('.rp-stat-num')].map(e => e.textContent)));
await p.selectOption('.rp-anio', '2026');
await p.waitForTimeout(300);
console.log('2026 →', await p.evaluate(() => [...document.querySelectorAll('.rp-stat-num')].map(e => e.textContent)));
await p.selectOption('.rp-anio', 'todos');
await p.waitForTimeout(200);

// Recursos → reuniones técnicas
await p.evaluate(() => navigate('recursos'));
await p.waitForTimeout(900);
const rec = await p.evaluate(() => ({
  carpetas: [...document.querySelectorAll('.arb-carpeta-tit')].map(e => e.textContent.replace(/\s+/g, ' ').trim()),
  archivos: document.querySelectorAll('#tecnicas-box .arb-file').length,
  tecnicasVisible: getComputedStyle(document.getElementById('card-tecnicas')).display !== 'none',
}));
console.log('RECURSOS', JSON.stringify(rec, null, 1));
await p.screenshot({ path: SHOT + '/02-recursos.png', fullPage: true });

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
await p.evaluate(() => toggleBloque('dash.actividad', true));
await p.waitForTimeout(300);
console.log('actividad de vuelta →', await p.evaluate(() => getComputedStyle(document.getElementById('card-actividad')).display));

console.log('ERRORES:', errores.length ? errores : 'ninguno');
await b.close();
