import { chromium } from 'playwright-core';

const SHOT = new URL('.', import.meta.url).pathname + 'capturas';
const ok = (n, c) => console.log((c ? '✅' : '❌') + ' ' + n);

const AUTH_API = 'http://localhost:8099/api/auth';
 await fetch(AUTH_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: '_reset' }) });

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errores = [];
p.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));

await p.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
await p.waitForTimeout(700);

// 1. Sin portero, el sitio se ve
ok('sin login exigido el sitio se ve', await p.evaluate(() => !document.getElementById('gate').classList.contains('open')));

// 2. Prender el portero desde Configuración
await p.evaluate(() => openDashLogin());
await p.fill('#login-pwd', 'faro26');
await p.evaluate(() => tryDashLogin());
await p.waitForTimeout(500);
ok('la clave de edición se valida contra el servidor', await p.evaluate(() => dashEditing === true && ADMIN_PASSWORD === 'faro26'));
await p.evaluate(() => navigate('config'));
await p.waitForTimeout(600);
await p.evaluate(() => cambiarRequerirLogin(true));
await p.waitForTimeout(400);
await p.screenshot({ path: SHOT + '/05-config-accesos.png', fullPage: true });

// 3. Recargar: ahora pide cuenta
await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(600);
ok('con el portero prendido aparece la pantalla de acceso',
  await p.evaluate(() => document.getElementById('gate').classList.contains('open')));
await p.screenshot({ path: SHOT + '/06-gate.png', fullPage: true });

// 4. Registro
await p.click('#gate-tab-registro');
await p.fill('#gate-r-nombre', 'Juanchi');
await p.fill('#gate-r-empresa', 'MACSA Agro');
await p.fill('#gate-r-email', 'macsa@ejemplo.com');
await p.fill('#gate-r-pwd', 'macsa2026');
await p.click('#gate-panel-registro .gate-btn');
await p.waitForTimeout(400);
const msgReg = await p.textContent('#gate-msg');
ok('el registro deja la cuenta pendiente', /pendiente de autorizaci/i.test(msgReg));

// 5. Login rechazado mientras está pendiente
await p.fill('#gate-email', 'macsa@ejemplo.com');
await p.fill('#gate-pwd', 'macsa2026');
await p.click('#gate-panel-login .gate-btn');
await p.waitForTimeout(400);
ok('no deja entrar sin autorización', /no fue autorizada/i.test(await p.textContent('#gate-msg')));
await p.screenshot({ path: SHOT + '/07-pendiente.png', fullPage: true });

// 6. El admin autoriza (desde otra pestaña, como haría Cecilia)
const p2 = await b.newPage();
await p2.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
await p2.waitForTimeout(500);
await p2.evaluate(() => openDashLogin());
await p2.fill('#login-pwd', 'faro26');
await p2.evaluate(() => tryDashLogin());
await p2.waitForTimeout(400);
await p2.evaluate(() => cambiarEstadoUsuario('macsa@ejemplo.com', 'autorizado'));
await p2.waitForTimeout(400);
await p2.close();

// 7. Ahora sí entra
await p.click('#gate-panel-login .gate-btn');
await p.waitForTimeout(900);
ok('con la cuenta autorizada entra', await p.evaluate(() => !document.getElementById('gate').classList.contains('open')));
ok('el dashboard carga los datos ya logueado',
  await p.evaluate(() => document.querySelectorAll('.rp-card').length === 8));
ok('aparece el chip de sesión',
  await p.evaluate(() => { const c = document.getElementById('sesion-chip'); return c && c.style.display !== 'none' && /MACSA/.test(c.textContent); }));
await p.screenshot({ path: SHOT + '/08-logueado.png', fullPage: true });

// 8. La sesión sobrevive un reload
await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(800);
ok('la sesión persiste al recargar', await p.evaluate(() => !document.getElementById('gate').classList.contains('open')));

// 9. Salir
await p.evaluate(() => gateLogout());
await p.waitForTimeout(500);
ok('al salir vuelve la pantalla de acceso', await p.evaluate(() => document.getElementById('gate').classList.contains('open')));

// 10. Sin sesión, la API no entrega datos
const status = await p.evaluate(async () => (await fetch('/api/db?group_id=grupo4')).status);
// ── Enlace de acceso a mano: sirve aunque el sitio no pueda mandar correo ──
await p.evaluate(() => { ADMIN_PASSWORD = 'faro26'; navigate('config'); });
await p.waitForTimeout(500);
await p.evaluate(() => configPestana('sitio'));
await p.waitForTimeout(900);
const hayBoton = await p.evaluate(() =>
  [...document.querySelectorAll('.acc-actions button')].some(b => /Enlace de acceso/.test(b.textContent)));
ok('cada cuenta tiene un botón para generar el enlace de acceso', hayBoton);

await p.evaluate(() => {
  const b = [...document.querySelectorAll('.acc-actions button')].find(x => /Enlace de acceso/.test(x.textContent));
  b.click();
});
await p.waitForTimeout(900);
const enlace = await p.evaluate(() => {
  const c = [...document.querySelectorAll('.acc-enlace')].find(e => !e.hidden);
  return c ? { texto: c.textContent, url: (c.querySelector('.acc-enlace-url') || {}).textContent || '' } : null;
});
console.log('enlace:', JSON.stringify(enlace && enlace.url));
ok('el enlace se genera y queda a la vista para copiarlo', !!(enlace && /\?reset=[a-f0-9]{16,}/.test(enlace.url)));
ok('y dice cuánto vale y para quién es', /24 horas/.test(enlace.texto) && /una sola vez/.test(enlace.texto));

// El enlace tiene que abrir la pantalla de elegir contraseña
await p.goto(enlace.url, { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
ok('al abrirlo, el sitio pide elegir una contraseña nueva',
  /contraseña nueva/i.test(await p.textContent('#gate-msg') + await p.textContent('body')));

ok('la API responde 401 sin sesión', status === 401);

// restaurar el mock para las otras suites
await p.evaluate(async () => { await authPost('requerirLogin', { password: 'faro26', valor: false }); });
console.log('ERRORES JS:', errores.length ? errores : 'ninguno');

// ── El primero que llega ──
// Un sitio con el portero prendido y sin ninguna cuenta autorizada tiene que
// dejar entrar a quien lo administra. Si no, nadie entra nunca: no se puede
// llegar al panel para autorizar la primera cuenta.
await fetch(AUTH_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: '_reset' }) });
await fetch(AUTH_API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'requerirLogin', password: 'faro26', valor: true }) });

const pc = await b.newPage({ viewport: { width: 1200, height: 900 } });
const errc = [];
pc.on('pageerror', e => errc.push('PAGEERROR: ' + e.message));
await pc.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
await pc.waitForTimeout(1200);

ok('sin cuenta y con el portero prendido, aparece la pantalla de acceso',
  await pc.evaluate(() => document.getElementById('gate').classList.contains('open')));
ok('y ofrece entrar como coordinación',
  await pc.evaluate(() => !!document.getElementById('gate-coord-link')));

await pc.evaluate(() => gateCoordAbrir());
await pc.fill('#gate-coord-pwd', 'clave-incorrecta');
await pc.evaluate(() => gateCoordEntrar());
await pc.waitForTimeout(600);
ok('con la clave equivocada no entra',
  await pc.evaluate(() => document.getElementById('gate').classList.contains('open')));

await pc.fill('#gate-coord-pwd', 'faro26');
await pc.evaluate(() => gateCoordEntrar());
await pc.waitForTimeout(1800);
ok('con la clave de coordinación entra, sin tener cuenta',
  await pc.evaluate(() => !document.getElementById('gate').classList.contains('open')));
ok('y entra en modo edición, para poder configurar y autorizar cuentas',
  await pc.evaluate(() => dashEditing === true));
ok('la API le contesta con sesión: los datos del grupo cargan',
  await pc.evaluate(() => EMPRESAS.length > 0));

await pc.evaluate(() => { navigate('config'); configPestana('sitio'); });
await pc.waitForTimeout(1000);
ok('y llega al panel de cuentas para autorizar al primero',
  await pc.evaluate(() => !!document.getElementById('config-accesos') &&
    !/Ingresá con la clave/.test(document.getElementById('config-accesos').textContent)));
console.log('ERRORES JS (coordinación):', errc.length ? errc : 'ninguno');

await b.close();
