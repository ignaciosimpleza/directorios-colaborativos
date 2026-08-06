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
ok('Configuración está separada en pestañas', tabs.join('|') === 'Instrucciones|El grupo|Archivos|El sitio');

// ── Instrucciones: sirven para cualquier grupo, no solo para éste ──
await p.evaluate(() => configPestana('instrucciones'));
await p.waitForTimeout(600);
const ins = await p.evaluate(() => ({
  pasos: [...document.querySelectorAll('#config-sources .card:first-child .ins-paso-tit')].map(e => e.textContent.trim()),
  pasosCorreo: [...document.querySelectorAll('.ins-paso-tit')].map(e => e.textContent.trim()),
  arboles: document.querySelectorAll('.ins-arbol').length,
  obligatorias: document.querySelectorAll('.ins-obl').length,
  opcionales: document.querySelectorAll('.ins-opc').length,
  atajos: document.querySelectorAll('.ins-ir').length,
  texto: document.getElementById('config-sources').textContent,
}));
console.log('instrucciones:', JSON.stringify(ins.pasos));
ok('hay una pestaña de instrucciones con los pasos en orden', ins.pasos.length === 8);
ok('e incluye los pasos para configurar el correo', /Crear una cuenta en resend/.test(ins.pasosCorreo.join('|')));
ok('el sitio dice si el correo está configurado o no',
  await p.evaluate(() => /no está configurado/.test(document.querySelector('.ins-estado').textContent)));
ok('y nombra las variables que hay que cargar',
  /RESEND_API_KEY/.test(ins.texto) && /MAIL_FROM/.test(ins.texto) && /SITIO_URL/.test(ins.texto));
ok('muestra cómo se estructura Drive y cómo se escribe la bitácora', ins.arboles === 2);
ok('distingue lo obligatorio de lo opcional', ins.obligatorias >= 3 && ins.opcionales >= 4);
ok('cada paso lleva a donde se completa', ins.atajos >= 5);
ok('el equipo tiene dónde cargar el email al que llegan los avisos',
  await p.evaluate(async () => { configPestana('contenido'); await new Promise(r => setTimeout(r, 600)); return !!document.getElementById('cfg-equipo-0-email'); }));
ok('no nombra a ningún grupo en particular: sirve para cualquiera',
  !/El Faro|MACSA|Cecilia/.test(ins.texto));
ok('dice la cuenta de servicio con la que hay que compartir', /gserviceaccount\.com/.test(ins.texto));
await p.evaluate(() => configPestana('contenido'));
await p.waitForTimeout(500);

// ── Importar lo que ya existía en una planilla ──
await p.evaluate(() => importarDesdePlanilla());
await p.waitForTimeout(1500);
const imp = await p.evaluate(() => ({
  estado: document.getElementById('import-status')?.textContent || '',
  empresas: (CONFIG.empresas || []).length,
  calendario: CONFIG.calendario,
}));
ok('se puede traer de una planilla lo ya escrito', /Importado/.test(imp.estado) && imp.empresas === 9);
ok('y trae también las reglas de la agenda',
  imp.calendario.semanasEntrePresentaciones === 26 && imp.calendario.proporcionTecnica === 2);

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

// ── «No puede presentar» se administra en el Calendario, no en Configuración ──
await p.evaluate(() => navigate('calendario'));
await p.waitForTimeout(900);
ok('la agenda se administra en el Calendario', await p.evaluate(() =>
  [...document.querySelectorAll('.agenda-bloque-tit')].map(e => e.textContent.trim()).join('|')
    .includes('Disponibilidad de las empresas')));
ok('con una fila por empresa activa', await p.evaluate(() => document.querySelectorAll('.disp-fila').length === 8));
const campoND = '#cfg-disp-0';
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

// ── La agenda usa lo configurado ahí mismo ──
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
ok('respeta el «no puede presentar» cargado desde el Calendario',
  !agenda.some(a => /El Motivo/.test(a)));

// ── El conflicto se ve en la fila del calendario ──
await p.evaluate(() => {
  MEETINGS.push({ date: '2027-01-20', assignment: 'El Motivo S.A.', obs: '', topic: '', fixed: false });
  renderCalendarLista();
});
await p.waitForTimeout(400);
const avisos = await p.evaluate(() => [...document.querySelectorAll('.cal-aviso')].map(e => e.textContent));
ok('si se asigna una empresa a una fecha en la que no puede, la fila lo advierte',
  avisos.includes('no disponible'));
ok('respeta las semanas sin reunión importadas',
  agenda.filter(a => a >= '2027-01-04' && a <= '2027-01-25').every(a => /Sin reunión/.test(a)));

await p.evaluate(() => navigate('config'));
await p.waitForTimeout(900);
await p.screenshot({ path: SHOT + '/31-config.png', fullPage: true });


// ── Relleno con rondas y técnicas, según la proporción configurada ──
await p.evaluate(() => navigate('calendario'));
await p.waitForTimeout(800);
await p.fill('#cfg-calendario-semanasEntrePresentaciones', '20');
await p.waitForTimeout(1500);
await p.evaluate(() => { MEETINGS.length = 0; });
await p.fill('#cfg-from', '2026-09-01');
await p.fill('#cfg-to', '2027-06-30');
await p.evaluate(() => calGenerate());
await p.waitForTimeout(2000);
const cuenta = await p.evaluate(() => MEETINGS.reduce((a, m) => {
  a[m.assignment] = (a[m.assignment] || 0) + 1; return a;
}, {}));
const rondas = cuenta['Ronda de novedades'] || 0;
const tecnicas = cuenta['Técnica'] || 0;
console.log('relleno:', JSON.stringify({ rondas, tecnicas }));
ok('las fechas libres se completan con rondas y técnicas', rondas > 0 && tecnicas > 0);
ok('y respetan la proporción cargada (1 ronda cada 2 técnicas)',
  tecnicas >= rondas * 1.5 && tecnicas <= rondas * 2.5);

await p.fill('#cfg-calendario-proporcionRonda', '0');
await p.waitForTimeout(1500);
await p.evaluate(() => { MEETINGS.length = 0; });
await p.evaluate(() => calGenerate());
await p.waitForTimeout(1800);
const soloTec = await p.evaluate(() => ({
  r: MEETINGS.filter(m => m.assignment === 'Ronda de novedades').length,
  t: MEETINGS.filter(m => m.assignment === 'Técnica').length,
}));
ok('con proporción 0 de rondas, solo se programan técnicas', soloTec.r === 0 && soloTec.t > 0);
await p.fill('#cfg-calendario-proporcionRonda', '1');
await p.waitForTimeout(1400);

// ── La bitácora se puede indicar como documento, no solo como carpeta ──
await p.evaluate(() => navigate('config'));
await p.waitForTimeout(700);
await p.evaluate(() => { document.querySelectorAll('#bloque-empresas details').forEach(d => d.setAttribute('open', '')); });
await p.waitForTimeout(300);
const hayCampos = await p.evaluate(() => ({
  carpeta: !!document.getElementById('cfg-empresas-0-carpetaId'),
  presentaciones: !!document.getElementById('cfg-empresas-0-presentacionesId'),
  bitacora: !!document.getElementById('cfg-empresas-0-bitacoraId'),
}));
ok('cada empresa tiene campos separados para carpeta, presentaciones y bitácora',
  hayCampos.carpeta && hayCampos.presentaciones && hayCampos.bitacora);

// Se pega el enlace completo del documento y debe quedar solo el id
await p.fill('#cfg-empresas-0-bitacoraId', 'https://docs.google.com/document/d/doc-macsa/edit?usp=drivesdk');
await p.evaluate(() => document.getElementById('cfg-empresas-0-bitacoraId').dispatchEvent(new Event('change')));
await p.waitForTimeout(1500);
ok('del enlace pegado se extrae el id del documento',
  await p.evaluate(() => CONFIG.empresas[0].bitacoraId === 'doc-macsa'));
const comprobado = await p.textContent('#cfg-empresas-0-bitacoraId-valida');
console.log('comprobación:', JSON.stringify(comprobado));
ok('y el sitio dice ahí mismo qué encontró en ese documento', /reuniones con fecha/.test(comprobado));

// Un enlace que no se puede abrir tiene que decirlo, no quedarse callado
await p.fill('#cfg-empresas-0-bitacoraId', 'https://docs.google.com/document/d/no-existe/edit');
await p.evaluate(() => document.getElementById('cfg-empresas-0-bitacoraId').dispatchEvent(new Event('change')));
await p.waitForTimeout(1200);
const fallo = await p.evaluate(() => {
  const e = document.getElementById('cfg-empresas-0-bitacoraId-valida');
  return { texto: e.textContent, err: e.className.includes('err') };
});
console.log('enlace inválido:', JSON.stringify(fallo));
ok('y si el documento no se puede leer, lo avisa en rojo', fallo.err && fallo.texto.length > 10);
await p.fill('#cfg-empresas-0-bitacoraId', 'doc-macsa');
await p.evaluate(() => document.getElementById('cfg-empresas-0-bitacoraId').dispatchEvent(new Event('change')));
await p.waitForTimeout(1400);
const leida = await p.evaluate(async () => {
  Object.keys(BITACORAS).forEach(k => delete BITACORAS[k]);
  const e = EMPRESAS.find(x => x.bitacoraId === 'doc-macsa');
  const b = await bitacoraDe(e);
  return { reuniones: (b.reuniones || []).length, aviso: b.aviso || '' };
});
console.log('bitácora por documento:', JSON.stringify(leida));
ok('el documento indicado se lee y devuelve sus reuniones', leida.reuniones === 7);

console.log('ERRORES JS (final):', errores.length ? errores : 'ninguno');
await b.close();

