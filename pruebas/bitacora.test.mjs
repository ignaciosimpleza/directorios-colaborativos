// El parser de bitácoras, contra encabezados REALES sacados de los documentos
// del grupo (MACSA y Altos de Bermúdez). Si un facilitador escribe la fecha de
// otra forma, esta prueba es el lugar donde sumarla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desdeEncabezados, fechaDeTexto, reunionesDesdeHtml, reunionesDesdeDocxXml } from '../api/_bitacora.js';

const MACSA = [
  'Grupo Estratégico: MACSA AGRO',                                   // título del doc: no es reunión
  'Lunes 3 Agosto de 2026 Reunión MACSA Crecimiento empresarial',
  '13 DE ABRIL DE 2026 – Avance Líneas Estratégicas MACSA',
  '',
  'Lunes 17 de Noviembre de 2025 - Presentación MACSA',
  '21 de Julio 2025 Resumen de la presentación de MACSA',
  '12 de diciembre de 2024. Desafíos del directorio',
  '24 de Octubre de 2024. Avances',
  '08 de Agosto de 2024 - PLAN 24-25',
  '04 de abril de 2024',
  '23 de noviembre 2023',
  '24 de agosto 2023',
  '18 de mayo 2023',
  '2 de marzo 2023',
  '24 de noviembre 2022',
  'Brechas, causas y línea estratégica | 29 de Septiembre 2022',
  'Brechas, causas y línea estratégica | 11 de Agosto 2022',
  'Brecha, causas y línea estratégica | 2 de junio 2022',
  'Brecha, causas y línea estratégica | 31 de marzo 2022',
  'Brecha, causas y línea estratégica | 16 de febrero 2022',
  'Brecha, causas y línea estratégica | 3 de noviembre 2021',
  'Análisis interno y brecha | 22 de septiembre de 2021',
  'Escenarios | 12 de agosto de 2021',
  'Presentación de la empresa | 06 de julio de 2021',
];

test('cuenta las reuniones de una bitácora real', () => {
  const r = desdeEncabezados(MACSA);
  assert.equal(r.length, 22, 'son las 22 que lista el índice del documento');
  assert.equal(r[0].fecha, '2026-08-03');
  assert.equal(r.at(-1).fecha, '2021-07-06');
});

test('deja el título sin la fecha', () => {
  const r = desdeEncabezados(MACSA);
  assert.equal(r[0].titulo, 'Reunión MACSA Crecimiento empresarial');
  assert.equal(r.at(-1).titulo, 'Presentación de la empresa');
});

test('reconoce las formas de escribir la fecha que usa el grupo', () => {
  const casos = {
    '13 DE JULIO DE 2026 - Avances': '2026-07-13',
    '21 de Julio 2025 Resumen': '2025-07-21',
    'Lunes 3 Agosto de 2026 Reunión': '2026-08-03',
    'Reunión - 3/8/2026': '2026-08-03',
    'Acta 2026-08-03': '2026-08-03',
  };
  for (const [texto, esperada] of Object.entries(casos)) {
    assert.equal(fechaDeTexto(texto)?.fecha, esperada, texto);
  }
});

test('no inventa reuniones con texto del cuerpo', () => {
  assert.equal(fechaDeTexto('La empresa opera desde 2014'), null);
  assert.equal(fechaDeTexto('Duración: 65 minutos'), null);
});

test('lee un Google Doc exportado a HTML, con acentos y todo', () => {
  const html = `<h1><span>Grupo Estrat&eacute;gico</span></h1>
    <h1><span>13 DE ABRIL DE 2026 &ndash; Avance L&iacute;neas Estrat&eacute;gicas</span></h1>
    <p>Fecha: 13 de julio de 2026 — esto es cuerpo, no cuenta</p>
    <h2><span>An&aacute;lisis interno | 22 de septiembre de 2021</span></h2>`;
  const r = reunionesDesdeHtml(html);
  assert.equal(r.length, 2);
  assert.equal(r[0].titulo, 'Avance Líneas Estratégicas');
  assert.equal(r[1].fecha, '2021-09-22');
});

test('lee un .docx, con los encabezados en español o en inglés', () => {
  const xml = `<w:document><w:body>
    <w:p><w:pPr><w:pStyle w:val="Ttulo1"/></w:pPr><w:r><w:t>13 DE ABRIL DE 2026 </w:t></w:r><w:r><w:t>- Avance</w:t></w:r></w:p>
    <w:p><w:r><w:t>Cuerpo con fecha 5 de mayo de 2020 que no cuenta.</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Brecha | 2 de junio 2022</w:t></w:r></w:p>
  </w:body></w:document>`;
  const r = reunionesDesdeDocxXml(xml);
  assert.deepEqual(r.map(x => x.fecha), ['2026-04-13', '2022-06-02']);
});
