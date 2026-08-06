// El correo es un accesorio: si no está configurado, nada debe fallar. Y cuando
// sí lo está, el mensaje tiene que salir bien armado. Acá se prueban las dos.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const limpiar = () => {
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
  delete process.env.SITIO_URL;
};

const cargar = async () => {
  const m = await import('../api/_mail.js?' + Math.random().toString(36).slice(2));
  return m;
};

test('sin configurar, no manda nada y no rompe', async () => {
  limpiar();
  const { correoConfigurado, enviarMail, urlDelSitio } = await cargar();
  assert.equal(correoConfigurado(), false);
  assert.equal(urlDelSitio(), '');
  const r = await enviarMail({ para: 'a@b.com', asunto: 'x', titulo: 'x', texto: 'x' });
  assert.deepEqual(r, { enviado: false, motivo: 'sin_configurar' });
});

test('con clave pero sin destinatario, tampoco intenta enviar', async () => {
  process.env.RESEND_API_KEY = 'k';
  process.env.MAIL_FROM = 'Grupo <no@x.com>';
  const { enviarMail } = await cargar();
  const r = await enviarMail({ para: [], asunto: 'x', titulo: 'x', texto: 'x' });
  assert.equal(r.motivo, 'sin_destinatario');
  limpiar();
});

test('la dirección del sitio se normaliza sin barra final', async () => {
  process.env.SITIO_URL = 'https://elfaro.example.com/';
  const { urlDelSitio } = await cargar();
  assert.equal(urlDelSitio(), 'https://elfaro.example.com');
  limpiar();
});

test('arma el pedido a Resend con remitente, destinatarios y las dos versiones', async () => {
  process.env.RESEND_API_KEY = 'clave-secreta';
  process.env.MAIL_FROM = 'Grupo El Faro <no-responder@ejemplo.com>';
  const { enviarMail } = await cargar();
  const original = global.fetch;
  let visto = null;
  global.fetch = async (url, opts) => {
    visto = { url, opts: { ...opts, body: JSON.parse(opts.body) } };
    return { ok: true, text: async () => '' };
  };
  const r = await enviarMail({
    para: ['uno@x.com', 'dos@x.com'],
    asunto: 'Restablecer tu contraseña',
    titulo: 'Elegí una contraseña nueva',
    texto: 'El enlace vale por 24 horas.',
    boton: 'Elegir contraseña nueva',
    url: 'https://sitio.test/?reset=abc123',
  });
  global.fetch = original;

  assert.equal(r.enviado, true);
  assert.equal(visto.url, 'https://api.resend.com/emails');
  assert.equal(visto.opts.headers.Authorization, 'Bearer clave-secreta');
  assert.equal(visto.opts.body.from, 'Grupo El Faro <no-responder@ejemplo.com>');
  assert.deepEqual(visto.opts.body.to, ['uno@x.com', 'dos@x.com']);
  assert.ok(visto.opts.body.html.includes('https://sitio.test/?reset=abc123'), 'el enlace va en el HTML');
  assert.ok(visto.opts.body.text.includes('https://sitio.test/?reset=abc123'), 'y también en la versión de texto');
  assert.ok(!/<script|onerror=/i.test(visto.opts.body.html), 'el HTML no lleva scripts');
  limpiar();
});

test('si Resend responde con error, se avisa pero no se tira excepción', async () => {
  process.env.RESEND_API_KEY = 'k';
  process.env.MAIL_FROM = 'Grupo <no@x.com>';
  const { enviarMail } = await cargar();
  const original = global.fetch;
  global.fetch = async () => ({ ok: false, status: 422, text: async () => 'dominio no verificado' });
  const r = await enviarMail({ para: 'a@b.com', asunto: 'x', titulo: 'x', texto: 'x' });
  global.fetch = original;
  assert.equal(r.enviado, false);
  assert.equal(r.motivo, 'HTTP 422');
  limpiar();
});

test('el contenido que viene de afuera se escapa, no se interpola crudo', async () => {
  process.env.RESEND_API_KEY = 'k';
  process.env.MAIL_FROM = 'Grupo <no@x.com>';
  const { enviarMail } = await cargar();
  const original = global.fetch;
  let cuerpo = null;
  global.fetch = async (_u, o) => { cuerpo = JSON.parse(o.body); return { ok: true, text: async () => '' }; };
  await enviarMail({
    para: 'a@b.com', asunto: 'x',
    titulo: '<img src=x onerror=alert(1)>',
    texto: 'Empresa "El Motivo" & socios <b>',
  });
  global.fetch = original;
  assert.ok(!cuerpo.html.includes('<img src=x'), 'el título se escapó');
  assert.ok(cuerpo.html.includes('&amp;'), 'los ampersands se escaparon');
  limpiar();
});
