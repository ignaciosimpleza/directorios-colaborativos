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
await p.waitForSelector('.rp-card', { timeout: 15000 });
await p.waitForTimeout(400);

// ── Una tarjeta por empresa, con lo que se lee de su bitácora ──
const leerTarjetas = () => p.evaluate(() =>
  [...document.querySelectorAll('.rp-card')].map(c => ({
    empresa: c.querySelector('.rp-card-emp').textContent.trim(),
    sinBitacora: c.classList.contains('apagada'),
    agendada: c.classList.contains('agendada'),
    n: +(c.querySelector('.rp-card-n')?.textContent.trim() || -1),
    datos: [...c.querySelectorAll('.rp-dato')].map(d => d.textContent.replace(/\s+/g, ' ').trim()),
  })));
const tarjetas = await leerTarjetas();
console.log('tarjetas:', JSON.stringify(tarjetas.map(t => t.empresa + ' ' + t.n)));
ok('hay una tarjeta por empresa en rotación (8 activas de 9)', tarjetas.length === 8);
ok('la empresa marcada como inactiva no tiene tarjeta', !tarjetas.some(x => /Becker/.test(x.empresa)));
ok('MACSA cuenta 7 reuniones de su bitácora', tarjetas.find(x => /MACSA/.test(x.empresa))?.n === 7);
ok('El Sueño cuenta 3', tarjetas.find(x => /Sueño/.test(x.empresa))?.n === 3);

const macsa = tarjetas.find(x => /MACSA/.test(x.empresa));
console.log('MACSA:', JSON.stringify(macsa.datos));
ok('la tarjeta dice desde cuándo viene presentando', /PRIMERA 29 sep 2022/i.test(macsa.datos[0]));
ok('cuándo fue la última', /ÚLTIMA 3 ago 2026/i.test(macsa.datos[1]));
ok('y cuándo le toca, cruzando con el Calendario', /PRÓXIMA \d+ \w+ 2026/i.test(macsa.datos[2]));
ok('la empresa con fecha agendada queda marcada con el acento de marca', macsa.agendada === true);
ok('la que no tiene fecha lo dice, no queda en blanco',
  tarjetas.some(x => x.datos.some(d => /Sin agendar/.test(d))));

// ── La empresa sin bitácora: una tarjeta que dice qué falta y dónde se arregla ──
const sinBit = tarjetas.filter(x => x.sinBitacora);
ok('las empresas sin bitácora tienen su tarjeta aparte', sinBit.length === 4);
ok('y llevan el link a donde se configura',
  await p.evaluate(() => document.querySelectorAll('.rp-card.apagada .rp-card-link').length === 4));

// ── El número se puede auditar contra el documento ──
await p.evaluate(() => document.querySelectorAll('.rp-card-n[onclick]')[0].click());
await p.waitForTimeout(250);
ok('al tocar el número se ven las fechas que el sitio leyó',
  await p.evaluate(() => [...document.querySelectorAll('.rp-card-fechas')].some(e => !e.hidden && e.textContent.trim())));

// ── Nada de barras ni de tabla ──
ok('no hay gráfico de barras ni tabla en el bloque',
  await p.evaluate(() => !document.querySelector('#card-reuniones .rp-chart, #card-reuniones .rp-tabla')));

// ── Filtro por período ──
const anios = await p.evaluate(() => [...document.querySelectorAll('.rp-anio option')].map(o => o.value));
console.log('años:', JSON.stringify(anios));
ok('el selector ofrece los años de las bitácoras', anios.includes('2026') && anios.includes('2022'));
await p.selectOption('.rp-anio', '2026');
await p.waitForTimeout(400);
const t2026 = await leerTarjetas();
ok('filtrando 2026 las tarjetas muestran solo ese año (MACSA 2, El Sueño 2)',
  t2026.find(x => /MACSA/.test(x.empresa))?.n === 2 && t2026.find(x => /Sueño/.test(x.empresa))?.n === 2);
ok('y la primera reunión pasa a ser la del año filtrado',
  /PRIMERA 13 abr 2026/i.test(t2026.find(x => /MACSA/.test(x.empresa))?.datos[0] || ''));
await p.selectOption('.rp-anio', 'todos');
await p.waitForTimeout(400);

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

// ── Actividad reciente = últimas reuniones con fecha y tema ──
const act = await p.evaluate(() =>
  [...document.querySelectorAll('#actividad-reciente .act-item')].map(e => ({
    fecha: e.querySelector('.act-fecha').textContent.trim(),
    empresa: e.querySelector('.act-emp').textContent.trim(),
    nro: (e.querySelector('.act-nro') || {}).textContent || '',
    frase: e.querySelector('.act-frase').textContent.trim(),
  })));
console.log('actividad:', JSON.stringify(act.slice(0, 2)));
ok('la actividad reciente lista las últimas reuniones', act.length === 8);
ok('y la más nueva va primero', act[0].fecha === '3 ago 2026' && /MACSA/.test(act[0].empresa));
ok('cada paso dice qué número de reunión es de esa empresa', /Reunión 7/.test(act[0].nro));
ok('y trae la frase textual de la bitácora, sin resumirla',
  /plan de inversiones para la campaña que viene/.test(act[0].frase));
ok('cuando la bitácora no trae frase, no se inventa ninguna',
  await p.evaluate(() => [...document.querySelectorAll('.act-frase.vacia')].length > 0));

// Cada paso lleva a donde se profundiza
await p.evaluate(() => document.querySelector('.act-emp').click());
await p.waitForTimeout(500);
ok('el nombre de la empresa lleva a su ficha',
  await p.evaluate(() => currentSection === 'empresa-detalle'));
await p.evaluate(() => navigate('dashboard'));
await p.waitForTimeout(600);
ok('la tarjeta del tablero también lleva a la ficha, a la bitácora y al calendario',
  await p.evaluate(() => document.querySelectorAll('.rp-card:not(.apagada) .rp-card-pie a').length >= 3));

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
