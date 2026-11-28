// Norma editorial de informes PDF/PNG (docs/ESTANDAR_EDITORIAL_INFORMES.md): patrones prohibidos, encabezado uniforme
// y pie institucional. Compartida por tools/qa-informes.cjs (cuatro plantillas) y tools/qa-informes-r3.cjs (R3).
const assert = require('assert/strict');
// Norma editorial (docs/ESTANDAR_EDITORIAL_INFORMES.md): sin referencias internas, columnas de Excel, archivos fuente,
// versiones, fórmulas ni textos metodológicos; pie solo «Negocios de Caña · CASUR» y numeración.
const FORBIDDEN = [/\((AD|AE|AF|AG|BE|BF|P)\)/, /\b(AD|AE|AF|AG|BE|BF)\/(AD|AE|AF|AG|BE|BF)\b/, /\bcolumna\b/i, /\.xlsx?\b/i, /Generaci[oó]n/i, /aforo\.\d+/i, /\b\d{4}\.\d{2}\.\d{2}\b/, /Consolidad/i, /motor oficial/i,
  /estimado utilizable/i, /universo de molienda/i, /no es aforo/i, /plan de cosecha;/i, /Ponderad[oa] por/i, /÷/, /\bFuente\b/i, /Participaci[oó]n/i, /Estado maestro/i, /Estado TCH/i, /Cambio TCH/i, /Variabilidad/i,
  /\bVs (CASUR|zona|variedad|riego|hist)/i, /Alerta/i, /TCH ejecutado/i, /Rango de cortes/i, /Naturaleza/i, /Documento de consulta/i, /\bUso\b/, /\(aforo\)|\(Histórico\)/i, /Km pond/i, /Dist\. ref/i, /Acción/, /escenario; no sustituye/i, /Toneladas? ÷/i, /Referencia actual/i, /Parcial ·/i, /aforo/i,
  /Maquila/i, /categor[ií]a original/i, /CodSuerte/i, /\bmotor\b/i, /solo Histórico/i, /Resumen consolidado de las suertes/i];
const editorial = (T, name) => { for (const re of FORBIDDEN) assert.doesNotMatch(T, re, name + ' contiene ' + re);
  // Encabezado uniforme aprobado: «Negocios de Caña · CASUR» y «Consulta: DD-MMM-AAAA · hora» en la cabecera de la página 1.
  const top = T.split('\n').slice(0, 4).join('\n'); assert.match(top, /Negocios de Caña · CASUR/, name + ' marca en el encabezado'); assert.match(top, /Consulta: \d{2}-[A-Z][a-z]{2}-\d{4} · \d{2}:\d{2}/, name + ' consulta en el encabezado');
  const foot = T.split('\f').filter(x => x.trim()).map(pg => pg.trim().split('\n').slice(-1)[0].trim()); foot.forEach((l, i) => assert.match(l, new RegExp('^Negocios de Caña · CASUR\\s+Página ' + (i + 1) + ' de ' + foot.length + '$'), name + ' pie p.' + (i + 1) + ': ' + l)); };

module.exports = {FORBIDDEN, editorial};
