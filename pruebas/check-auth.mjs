import { chromium } from 'playwright-core';

const SHOT = new URL('.', import.meta.url).pathname + 'capturas';
const ok = (n, c) => console.log((c ? '✅' : '❌') + ' ' + n);

await fetch('http://localhost:8099/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: '_reset' }) });

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
  await p.evaluate(() => document.querySelectorAll('.rp-stat').length === 4));
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
ok('la API responde 401 sin sesión', status === 401);

// restaurar el mock para las otras suites
await p.evaluate(async () => { await authPost('requerirLogin', { password: 'faro26', valor: false }); });
console.log('ERRORES JS:', errores.length ? errores : 'ninguno');
await b.close();
