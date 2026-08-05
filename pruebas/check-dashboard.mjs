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
await p.waitForSelector('.rp-tabla tbody tr', { timeout: 15000 });
await p.waitForTimeout(400);

// ── Números por empresa desde la bitácora ──
const leerTabla = () => p.evaluate(() =>
  [...document.querySelectorAll('.rp-tabla tbody tr')].filter(r => !r.hidden).map(r => ({
    empresa: r.querySelector('.rp-emp').textContent.trim(),
    sinBitacora: !!r.querySelector('.rp-tag'),
    n: +r.children[1].textContent.trim() || 0,
    primera: r.children[2].textContent.trim(),
    ultima: r.children[3].textContent.trim(),
    proxima: r.children[4].textContent.trim(),
  })));
const barras = await leerTabla();
console.log('tabla:', JSON.stringify(barras));
ok('el tablero muestra solo las empresas activas (8 de 9)', barras.length === 8);
ok('la empresa marcada como inactiva no aparece en el tablero',
  !barras.some(x => /Becker/.test(x.empresa)));
ok('MACSA cuenta 7 reuniones de su bitácora', barras.find(x => /MACSA/.test(x.empresa))?.n === 7);
ok('El Sueño cuenta 3', barras.find(x => /Sueño/.test(x.empresa))?.n === 3);
ok('la empresa sin bitácora queda en 0', barras.find(x => /Tricampo/.test(x.empresa))?.n === 0);
ok('dice cuándo presentó cada una por última vez',
  /3 ago 2026/.test(barras.find(x => /MACSA/.test(x.empresa))?.ultima || ''));
ok('cruza la bitácora con el calendario: la próxima fecha de cada empresa',
  /14 ago 2026/.test(barras.find(x => /MACSA/.test(x.empresa))?.proxima || ''));
ok('y desde cuándo viene presentando',
  /29 sep 2022/.test(barras.find(x => /MACSA/.test(x.empresa))?.primera || ''));
ok('las que hace más que no presentan van primero, y las que no tienen bitácora al final',
  barras.findIndex(x => /Porvenir/.test(x.empresa)) < barras.findIndex(x => /MACSA/.test(x.empresa))
  && barras.findIndex(x => /Tricampo/.test(x.empresa)) > barras.findIndex(x => /MACSA/.test(x.empresa)));
ok('la empresa sin bitácora queda marcada, no en blanco',
  barras.find(x => /Tricampo/.test(x.empresa))?.sinBitacora === true);

// ── Vínculo automático empresa ↔ carpeta de Drive (CONFIG_DRIVE vacía) ──
const vinculos = await p.evaluate(() => EMPRESAS.map(e => ({
  empresa: e.nombre,
  carpeta: (VINCULOS.find(x => x.empresa === e.nombre) || {}).carpeta || '',
})));
console.log('vínculos:', JSON.stringify(vinculos.map(v => v.empresa.slice(0, 18) + ' → ' + v.carpeta)));
ok('las 9 empresas se vinculan solas con su carpeta, sin pegar ids', vinculos.every(v => v.carpeta));
ok('una empresa inactiva conserva su ficha y su carpeta',
  vinculos.find(v => /Becker/.test(v.empresa))?.carpeta === 'Estudio Becker');
ok('resuelve «El Porvenir / Beheran Sarciat S.A.» → «Beheran Sarciat SA»',
  vinculos.find(v => /Porvenir/.test(v.empresa))?.carpeta === 'Beheran Sarciat SA');
ok('resuelve «Estudio Tomás Becker» → «Estudio Becker»',
  vinculos.find(v => /Becker/.test(v.empresa))?.carpeta === 'Estudio Becker');

const stats = await p.evaluate(() => [...document.querySelectorAll('.rp-stat')].map(e => e.textContent.replace(/\s+/g, ' ').trim()));
console.log('totales:', JSON.stringify(stats));
ok('el primer número es el total de reuniones registradas', /^22\D/.test(stats[0]));
ok('mide el ritmo real contra la regla del calendario',
  /sem/.test(stats[1]) && /cada 26/.test(stats[1]));
ok('dice cuántas empresas necesitan que se les asigne fecha', /Necesitan fecha/.test(stats[2]));
ok('y cuál es la próxima presentación agendada',
  /14 ago 2026/.test(stats[3]) && /MACSA/.test(stats[3]));

// ── El gráfico del ritmo del grupo ──
const ritmo = await p.evaluate(() => [...document.querySelectorAll('.rp-chart .col title')].map(e => e.textContent));
console.log('ritmo:', JSON.stringify(ritmo));
ok('el gráfico muestra las reuniones de cada período', ritmo.length >= 5);
ok('y no saltea un año sin reuniones', ritmo.some(t => /^2023 · 0 reuniones/.test(t)));
ok('con un solo color de dato, el de la marca',
  await p.evaluate(() => new Set([...document.querySelectorAll('.rp-chart path')]
    .map(e => e.getAttribute('fill'))).size === 1));

// ── Filtro por año ──
const anios = await p.evaluate(() => [...document.querySelectorAll('.rp-anio option')].map(o => o.value));
console.log('años:', JSON.stringify(anios));
ok('el selector ofrece los años de las bitácoras', anios.includes('2026') && anios.includes('2022'));
await p.selectOption('.rp-anio', '2026');
await p.waitForTimeout(300);
const t2026 = await leerTabla();
ok('filtrando 2026 bajan las veces (MACSA 2, El Sueño 2)',
  t2026.find(x => /MACSA/.test(x.empresa))?.n === 2 && t2026.find(x => /Sueño/.test(x.empresa))?.n === 2);
ok('pero la última presentación sigue siendo la real, no la del filtro',
  /3 ago 2026/.test(t2026.find(x => /MACSA/.test(x.empresa))?.ultima || ''));
ok('y el gráfico pasa a mostrar los meses de ese año',
  await p.evaluate(() => /por mes/.test(document.querySelector('.rp-seccion').textContent)));
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
await p.waitForTimeout(600);
await p.evaluate(() => configPestana('archivos'));   // las carpetas de Drive viven acá
await p.waitForTimeout(900);
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


// ── Las reglas del calendario salen de la planilla y se cumplen ──
await p.evaluate(() => navigate('calendario'));
await p.waitForTimeout(600);
const reglas = await p.evaluate(() => ({
  diaSemana: document.getElementById('cfg-calendario-diaSemana')?.value,
  cadencia: document.getElementById('cfg-calendario-cadenciaSemanas')?.value,
  separacion: document.getElementById('cfg-calendario-semanasEntrePresentaciones')?.value,
  enRotacion: document.querySelectorAll('.disp-fila').length,
}));
console.log('reglas:', JSON.stringify(reglas));
ok('el calendario muestra las reglas que dice la planilla',
  reglas.diaSemana === '1' && reglas.cadencia === '1');
ok('y una fila por empresa en rotación (8 activas de 9)', reglas.enRotacion === 8);

p.on('dialog', d => d.accept());
await p.fill('#cfg-from', '2026-12-01');
await p.fill('#cfg-to', '2027-11-30');
await p.evaluate(() => calGenerate());
await p.waitForTimeout(2000);
const anio = await p.evaluate(() =>
  MEETINGS.filter(x => x.date >= '2026-12-01' && x.date <= '2027-11-30').map(x => x.date + ' ' + x.assignment));
const agenda = anio.filter(a => a <= '2027-02-28');
console.log('agenda:', JSON.stringify(agenda, null, 1));
ok('respeta «no_disponible»: MACSA no presenta entre diciembre y febrero',
  !agenda.some(a => /MACSA/.test(a)));
ok('respeta «activa»: la empresa fuera de rotación no recibe fechas',
  !agenda.some(a => /Becker/.test(a)));
ok('respeta SIN_REUNION: enero entero queda sin reunión',
  agenda.filter(a => a.startsWith('2027-01')).every(a => /Sin reunión/.test(a)));
// Con 26 semanas entre presentaciones cada empresa presenta unas dos veces al
// año: las fechas que sobran se completan con ronda y técnica, 1 a 2.
const rellenos = {
  ronda: anio.filter(a => /Ronda de novedades/.test(a)).length,
  tecnica: anio.filter(a => /Técnica/.test(a)).length,
};
console.log('relleno del año:', JSON.stringify(rellenos));
ok('programa la ronda de novedades según la planilla', rellenos.ronda > 0);
ok('programa la técnica según la planilla', rellenos.tecnica > 0);
ok('y respeta la proporción 1 a 2 de la planilla',
  rellenos.tecnica >= rellenos.ronda * 1.5 && rellenos.tecnica <= rellenos.ronda * 2.5);

// ── La revisión de lo cargado se ve donde se arregla ──
await p.evaluate(() => navigate('config'));
await p.waitForTimeout(600);
await p.evaluate(() => configPestana('contenido'));
await p.waitForTimeout(700);
await p.waitForSelector('#config-sources .card-title', { timeout: 8000 });
const revision = await p.evaluate(() =>
  [...document.querySelectorAll('#config-sources .card-title')].map(e => e.textContent.trim()).join(' | '));
console.log('revisión:', revision.slice(0, 120));
ok('Configuración revisa lo cargado y lo dice', /Revisi/.test(revision));

console.log('ERRORES JS:', errores.length ? errores : 'ninguno');
await b.close();
