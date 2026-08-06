// Envío de correo, por Resend.
//
// El correo es un accesorio: si no está configurado, el sitio funciona igual y
// nada falla. Por eso todas las funciones de acá devuelven en vez de tirar
// error, y quien las llama nunca depende de que el mail haya salido.
//
// Variables de entorno en Vercel:
//   RESEND_API_KEY   la clave de resend.com
//   MAIL_FROM        el remitente. Ej: Grupo El Faro <no-responder@tu-dominio.com>
//   SITIO_URL        la dirección pública del sitio, para armar el link de reset
//   AVISOS_A         opcional. A quién avisar de cuentas pendientes si el equipo
//                    cargado en Configuración no tiene emails.

const API = 'https://api.resend.com/emails';

export function correoConfigurado() {
  return !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

// La dirección pública del sitio. Va como variable porque el sitio se muestra
// embebido en un iframe: los encabezados del pedido no son confiables para
// armar un link que la persona va a abrir en su navegador.
export function urlDelSitio() {
  return String(process.env.SITIO_URL || '').replace(/\/+$/, '');
}

export async function enviarMail({ para, asunto, titulo, texto, boton, url, pie }) {
  if (!correoConfigurado()) return { enviado: false, motivo: 'sin_configurar' };
  const destinos = (Array.isArray(para) ? para : [para]).filter(Boolean);
  if (!destinos.length) return { enviado: false, motivo: 'sin_destinatario' };
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: destinos,
        subject: asunto,
        html: cuerpoHtml({ titulo, texto, boton, url, pie }),
        text: cuerpoTexto({ titulo, texto, boton, url, pie }),
      }),
    });
    if (!r.ok) {
      const detalle = await r.text().catch(() => '');
      console.warn('No se pudo enviar el correo:', r.status, detalle.slice(0, 300));
      return { enviado: false, motivo: `HTTP ${r.status}` };
    }
    return { enviado: true };
  } catch (e) {
    console.warn('No se pudo enviar el correo:', e.message);
    return { enviado: false, motivo: e.message };
  }
}

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Un mail sobrio, en la tipografía y los colores del sitio. Sin imágenes ni
// rastreadores: menos motivos para caer en spam.
function cuerpoHtml({ titulo, texto, boton, url, pie }) {
  return `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#F9F4ED;font-family:'Sora',Helvetica,Arial,sans-serif;color:#616A6B">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fff;border:1px solid rgba(97,106,107,0.14);border-radius:12px">
    <tr><td style="padding:28px 30px">
      <h1 style="margin:0 0 14px;font-size:18px;font-weight:600;color:#1E2A2E">${esc(titulo)}</h1>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.65">${esc(texto)}</p>
      ${boton && url ? `<a href="${esc(url)}" style="display:inline-block;background:#0B8F66;color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:11px 20px;border-radius:8px">${esc(boton)}</a>
      <p style="margin:18px 0 0;font-size:12px;color:#7F7F7F;line-height:1.6">Si el botón no funciona, copiá esta dirección en el navegador:<br><span style="word-break:break-all">${esc(url)}</span></p>` : ''}
      ${pie ? `<p style="margin:22px 0 0;padding-top:16px;border-top:1px solid rgba(97,106,107,0.14);font-size:12px;color:#7F7F7F;line-height:1.6">${esc(pie)}</p>` : ''}
    </td></tr>
  </table></body></html>`;
}

function cuerpoTexto({ titulo, texto, boton, url, pie }) {
  return [titulo, '', texto, url ? `\n${boton}: ${url}` : '', pie ? `\n${pie}` : '']
    .filter(x => x !== '').join('\n');
}
