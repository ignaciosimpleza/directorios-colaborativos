// Configuración es el lugar donde se define el grupo: acá se verifica que se
// pueda cargar todo desde el sitio, que se guarde, y que impacte en el resto.
import { chromium } from 'playwright-core';

const SHOT = new URL('.', import.meta.url).pathname + 'capturas';
const ok = (n, c) => console.log((c ? '✅' : '❌') + ' ' + n);
const API = 'http://localhost:8099/api/auth';

await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: '_reset' }) });

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1400, height: 1100 } });
const errores = [];
p.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));
p.on('dialog', d => d.accept());

const entrarAConfig = async () => {
  await p.evaluate(() => openDashLogin());
  await p.fill('#login-pwd', 'faro26');
  await p.evaluate(() => tryDashLogin());
  await p.waitForTimeout(400);
  await p.evaluate(() => navigate('config'));
  await p.waitForTimeout(900);
};

await p.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
await p.waitForTimeout(1000);

ok('las reglas de la agenda las carga el navegador desde el mismo archivo que la API',
  await p.evaluate(() => typeof window.Reglas?.parseNoDisponible === 'function'));

await entrarAConfig();
const tabs = await p.evaluate(() => [...document.querySelectorAll('.cfg-tab')].map(e => e.textContent));
ok('Configuración está separada en pestañas', tabs.join('|') === 'El grupo|Agenda|Archivos|El sitio');

// ── Importar lo que ya existía en una planilla ──
await p.evaluate(() => importarDesdePlanilla());
await p.waitForTimeout(1500);
const imp = await p.evaluate(() => ({
  estado: document.getElementById('import-status')?.textContent || '',
  empresas: (CONFIG.empresas || []).length,
  calendario: CONFIG.calendario,
}));
ok('se puede traer de una planilla lo ya escrito', /Importado/.test(imp.estado) && imp.empresas === 9);
ok('y trae también las reglas de la agenda', imp.calendario.rondaNovedadesCada === 6);

// ── Editar un texto y que impacte en el sitio ──
await p.fill('#cfg-grupo-nombre', 'Grupo Estratégico Nuevo');
await p.waitForTimeout(1400);   // el guardado es diferido
ok('cambiar el nombre del grupo se refleja en el menú',
  (await p.textContent('#brand-name')) === 'Grupo Estratégico Nuevo');
ok('y queda guardado', await p.evaluate(async () => {
  const r = await fetch('/api/db?group_id=grupo4');
  const j = await r.json();
  return j.content?.config_grupo?.grupo?.nombre === 'Grupo Estratégico Nuevo';
}));

// ── Agregar una empresa desde el sitio ──
const antes = await p.evaluate(() => CONFIG.empresas.length);
await p.evaluate(() => cfgAgregar('empresas', 'ficha'));
await p.waitForTimeout(1400);
const idx = antes;   // la nueva queda al final
await p.fill(`#cfg-empresas-${idx}-nombre`, 'Empresa Nueva S.A.');
await p.waitForTimeout(1500);
const nueva = await p.evaluate(i => {
  const e = CONFIG.empresas[i];
  return { nombre: e.nombre, slug: e.slug, activa: e.activa, enElSitio: EMPRESAS.some(x => x.nombre === 'Empresa Nueva S.A.') };
}, idx);
console.log('empresa nueva:', JSON.stringify(nueva));
ok('se puede agregar una empresa desde Configuración', nueva.nombre === 'Empresa Nueva S.A.');
ok('el slug se arma solo', nueva.slug === 'empresa-nueva-s-a');
ok('y aparece en el sitio sin recargar', nueva.enElSitio);

// ── Desactivar una empresa impacta en el resto ──
await p.evaluate(i => cfgSetFicha('empresas', i, 'activa', 'siNo', { checked: false, id: 'x' }), idx);
await p.waitForTimeout(1500);
ok('desactivar una empresa la saca de la rotación, sin borrarla',
  await p.evaluate(() => {
    const e = EMPRESAS.find(x => x.nombre === 'Empresa Nueva S.A.');
    return e && e.activa === false;
  }));

// ── «No puede presentar»: se valida con las mismas reglas del calendario ──
await p.evaluate(() => navigate('config'));
await p.waitForTimeout(800);
await p.evaluate(() => { document.querySelector('#bloque-empresas details')?.setAttribute('open', ''); });
const campoND = `#cfg-empresas-0-noDisponible`;
await p.fill(campoND, 'diciembre a febrero');
await p.waitForTimeout(600);
ok('«cuándo no puede presentar» avisa que entendió la regla',
  /entendida/.test(await p.textContent(campoND + '-valida')));
await p.fill(campoND, 'cuando termine la cosecha');
await p.waitForTimeout(600);
ok('y avisa cuando NO entiende, en vez de ignorarlo',
  /No se entendió/.test(await p.textContent(campoND + '-valida')));
await p.fill(campoND, 'diciembre a febrero');
await p.waitForTimeout(1400);

// ── La agenda usa lo configurado acá ──
await p.evaluate(() => configPestana('agenda'));
await p.waitForTimeout(800);
await p.selectOption('#cfg-calendario-diaSemana', '3');
await p.waitForTimeout(1400);
ok('cambiar el día de reunión queda guardado',
  await p.evaluate(() => CALCFG.diaSemana === 3));

await p.evaluate(() => navigate('calendario'));
await p.waitForTimeout(600);
await p.fill('#cfg-from', '2026-12-01');
await p.fill('#cfg-to', '2027-02-28');
await p.evaluate(() => calGenerate());
await p.waitForTimeout(1800);
const agenda = await p.evaluate(() =>
  MEETINGS.filter(x => x.date >= '2026-12-01' && x.date <= '2027-02-28').map(x => x.date + ' ' + x.assignment));
console.log('agenda:', JSON.stringify(agenda.slice(0, 6)));
ok('la agenda se genera el día configurado (miércoles)',
  agenda.every(a => new Date(a.slice(0, 10) + 'T12:00:00').getDay() === 3));
ok('respeta el «no puede presentar» cargado desde el sitio',
  !agenda.some(a => /El Motivo/.test(a)));
ok('respeta las semanas sin reunión importadas',
  agenda.filter(a => a >= '2027-01-04' && a <= '2027-01-25').every(a => /Sin reunión/.test(a)));

await p.evaluate(() => navigate('config'));
await p.waitForTimeout(900);
await p.screenshot({ path: SHOT + '/31-config.png', fullPage: true });

console.log('ERRORES JS:', errores.length ? errores : 'ninguno');
await b.close();
