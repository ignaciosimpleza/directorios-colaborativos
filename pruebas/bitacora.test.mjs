// El parser de bitácoras, contra encabezados REALES sacados de los documentos
// del grupo (MACSA y Altos de Bermúdez). Si un facilitador escribe la fecha de
// otra forma, esta prueba es el lugar donde sumarla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desdeEncabezados, desdeBloques, fechaDeTexto, reunionesDesdeHtml, reunionesDesdeDocxXml } from '../api/_bitacora.js';

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
  const { reuniones: r } = desdeEncabezados(MACSA);
  assert.equal(r.length, 22, 'son las 22 que lista el índice del documento');
  assert.equal(r[0].fecha, '2026-08-03');
  assert.equal(r.at(-1).fecha, '2021-07-06');
});

test('deja el título sin la fecha', () => {
  const { reuniones: r } = desdeEncabezados(MACSA);
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
  const { reuniones: r } = reunionesDesdeHtml(html);
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
  const { reuniones: r } = reunionesDesdeDocxXml(xml);
  assert.deepEqual(r.map(x => x.fecha), ['2026-04-13', '2022-06-02']);
});

// ── Las otras dos formas que aparecen en las bitácoras reales del grupo ──

// El Motivo: el encabezado es siempre el mismo y no tiene fecha; la fecha está
// en el renglón de abajo. Además hay secciones que directamente no la tienen.
const EL_MOTIVO = [
  { nivel: 1, texto: 'Grupo Estratégico: EL MOTIVO', contexto: [] },
  { nivel: 1, texto: 'Consigna 3: Análisis interno. Brechas y Causas. Continuación.', contexto: ['Repaso de la empresa'] },
  { nivel: 1, texto: 'Grupo Estratégico: EL MOTIVO', contexto: ['Presentación de la empresa | 26 de agosto de 2021'] },
  { nivel: 1, texto: 'Grupo Estratégico: EL MOTIVO', contexto: ['Presentación de la empresa | 13 de julio de 2021'] },
];

test('cuenta la reunión cuando la fecha está en la línea de abajo, no en el título', () => {
  const { reuniones, sinFecha } = desdeBloques(EL_MOTIVO);
  assert.deepEqual(reuniones.map(r => r.fecha), ['2021-08-26', '2021-07-13']);
  assert.equal(reuniones[0].titulo, 'Presentación de la empresa',
    'si el encabezado no aporta nada, el título sale de la línea con la fecha');
  assert.equal(sinFecha.length, 2, 'y avisa cuáles quedaron sin fecha legible');
});

// Beheran Sarciat: «1 DE JUNIO» y «09 de Febrero», sin año en el encabezado.
const BEHERAN = [
  { nivel: 1, texto: 'FECHA Y TÍTULO: 1 DE JUNIO – Reunión de Accionistas junio 2026', contexto: ['EMPRESA: El Porvenir (presentación Alfredo Beheran)'] },
  { nivel: 1, texto: '🗓️09 de Febrero - Primera presentación de la empresa', contexto: ['Duración: 60 minutos.'] },
];

test('lee las fechas sin año, deduciéndolo de la reunión vecina', () => {
  const { reuniones } = desdeBloques(BEHERAN);
  assert.deepEqual(reuniones.map(r => r.fecha), ['2026-06-01', '2026-02-09']);
  assert.equal(reuniones[1].anioDeducido, true, 'queda marcado que el año se dedujo');
  assert.equal(reuniones[0].titulo, 'Reunión de Accionistas');
  assert.equal(reuniones[1].titulo, 'Primera presentación de la empresa');
});

test('si el documento va de la más vieja a la más nueva, el año también sale bien', () => {
  const { reuniones } = desdeBloques([
    { nivel: 1, texto: 'Reunión | 10 de noviembre de 2025', contexto: [] },
    { nivel: 1, texto: '15 de marzo - Segunda reunión', contexto: [] },
  ]);
  assert.deepEqual(reuniones.map(r => r.fecha), ['2026-03-15', '2025-11-10']);
});

test('sin ninguna fecha completa, no se inventa un año', () => {
  const { reuniones, sinFecha } = desdeBloques([{ nivel: 1, texto: '15 de marzo - Reunión', contexto: [] }]);
  assert.equal(reuniones.length, 0);
  assert.equal(sinFecha.length, 1);
});

test('la prosa larga de abajo del encabezado no aporta fechas', () => {
  const largo = 'En 2010 se fue comprando a los distintos condóminos y desde el 3 de mayo de 2012 la empresa creció sin pausa hasta llegar a las 2246 hectáreas productivas que tiene hoy.';
  const { reuniones } = desdeBloques([{ nivel: 1, texto: 'Análisis interno', contexto: [largo] }]);
  assert.equal(reuniones.length, 0, 'el contexto solo mira renglones cortos, tipo línea de fecha');
});
