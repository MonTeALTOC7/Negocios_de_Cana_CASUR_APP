/* ============================================================
   production-data-adapter.js
   Capa de adaptación explícita: Administrador SIAGRI → Maestro de
   Suertes (Producción). Toma el dataset YA validado del Convertidor
   y produce las filas en formato hoja REPORTE (el MISMO puente que
   Producción usa para importar el Excel oficial), más un resumen y
   las validaciones críticas ANTES de aplicar.

   IMPORTANTE (reutilización): NO reimplementa reglas de edad, estado,
   TCH, renovación, zonas, productores, áreas ni estadísticas. El
   dataset del Convertidor ya trae esas reglas resueltas (edad,
   estado, tenencia, tipo de riego, corte/renovación, etc.). El
   builder de Producción es quien agrega/estadística a partir de
   estas filas REPORTE. Este adaptador solo mapea + valida + resume.

   NO confundir con `cronologico_master.json` (otro esquema). Aquí se
   produce el formato REPORTE (filas), que es lo que consume el
   Centro Maestro de Producción. No se sobreescribe `historico.json`.
   ============================================================ */

/* Columnas REPORTE (mismo contrato que el Convertidor y Producción). */
export const MASTER_COLUMNS = [
  'Hac-Sue', 'Cod', 'Hacienda', 'Suerte', 'Area', 'Variedad', 'Edad',
  'TCH_Z2526', 'TCH_Estimado_Z2627', 'Ton_Estimadas_Z2627', '#_de_Corte',
  'Surco', 'Textura', 'F. Ult. Cte', 'F. Siembra', 'Km', 'Tch.Inic', 'Tch.Act',
  'Destino', 'Tenencia', 'Tipo_de_Riego', '#_de_Riegos', 'ERP', 'ZONA',
  'Estado', 'Observación',
];

/* Mapeo record → fila REPORTE (equivalente 1:1 a toMasterRow del Convertidor). */
export function recordToReportRow(r) {
  return {
    'Hac-Sue': r.hacSue, Cod: r.cod, Hacienda: r.hacienda, Suerte: r.suerte,
    Area: r.area, Variedad: r.variedad, Edad: r.edad,
    TCH_Z2526: r.tchPrev, TCH_Estimado_Z2627: r.tchEstimate,
    Ton_Estimadas_Z2627: r.tonsEstimate, '#_de_Corte': r.corte,
    Surco: r.surco, Textura: r.textura, 'F. Ult. Cte': r.fUltCte,
    'F. Siembra': r.fSiembra, Km: r.km, 'Tch.Inic': r.tchInic,
    'Tch.Act': r.tchAct, Destino: r.destino, Tenencia: r.tenencia,
    Tipo_de_Riego: r.tipoRiego, '#_de_Riegos': r.numRiegos,
    ERP: r.erp, ZONA: r.zona,
    Estado: r.stateValidated || r.stateDetected, 'Observación': r.observation || null,
  };
}

function codeNumber(v) {
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/* Validaciones críticas ANTES de aplicar. Devuelve { pass, checks[] }. */
export function validateForProduction(records) {
  const checks = [];
  const add = (id, ok, detail) => checks.push({ id, ok, detail });

  /* 1) Sucuya · Cod Hacienda 16 = 0 (regla permanente) */
  const sucuya = records.filter((r) => codeNumber(r.cod) === 16).length;
  add('sucuya_cod16', sucuya === 0, `Registros Cod 16 = ${sucuya}`);

  /* 2) Llave Hac-Sue presente en todos */
  const sinLlave = records.filter((r) => !r.hacSue || String(r.hacSue).trim() === '').length;
  add('hac_sue_presente', sinLlave === 0, `Sin Hac-Sue = ${sinLlave}`);

  /* 3) Duplicados de llave Hac-Sue */
  const seen = new Map();
  const dupes = new Set();
  for (const r of records) {
    const k = String(r.hacSue || '').trim();
    if (!k) continue;
    if (seen.has(k)) dupes.add(k); else seen.set(k, true);
  }
  add('sin_duplicados', dupes.size === 0, `Llaves duplicadas = ${dupes.size}`);

  /* 4) Integridad de campos críticos usados por Producción */
  const req = ['hacienda', 'suerte', 'area', 'zona'];
  let incompletos = 0;
  for (const r of records) {
    if (req.some((f) => r[f] === undefined || r[f] === null || String(r[f]).trim() === '')) incompletos += 1;
  }
  add('integridad_campos', incompletos === 0, `Registros incompletos = ${incompletos}`);

  const pass = checks.every((c) => c.ok);
  return { pass, checks, dupes: [...dupes] };
}

function sumArea(records) {
  return records.reduce((s, r) => s + (Number(r.area) || 0), 0);
}

/* Resumen comparativo prev→new (no aplica nada; solo describe el cambio). */
export function buildSummary(records, previousReportRows) {
  const prev = Array.isArray(previousReportRows) ? previousReportRows : [];
  const prevByKey = new Map(prev.map((row) => [String(row['Hac-Sue'] || '').trim(), row]));
  const newKeys = new Set(records.map((r) => String(r.hacSue || '').trim()));

  let nuevas = 0, modificadas = 0;
  for (const r of records) {
    const k = String(r.hacSue || '').trim();
    const before = prevByKey.get(k);
    if (!before) { nuevas += 1; continue; }
    const changed =
      Number(before.Area) !== Number(r.area) ||
      String(before.Estado || '') !== String(r.stateValidated || r.stateDetected || '') ||
      Number(before.TCH_Estimado_Z2627) !== Number(r.tchEstimate);
    if (changed) modificadas += 1;
  }
  const inactivadas = prev.filter((row) => !newKeys.has(String(row['Hac-Sue'] || '').trim())).length;
  const sucuyaExcluidas = records.filter((r) => codeNumber(r.cod) === 16).length; /* debe ser 0 */

  return {
    registrosAnteriores: prev.length,
    registrosNuevos: records.length,
    nuevasSuertes: nuevas,
    modificadas,
    inactivadas,
    areaAnterior: Number(sumArea(prev.map((row) => ({ area: row.Area }))).toFixed(2)),
    areaNueva: Number(sumArea(records).toFixed(2)),
    sucuyaExcluidas,
    fechaActualizacion: new Date().toISOString().slice(0, 10),
  };
}

/* Nueva versión de DATOS (≠ versión de código VF54.6). */
export function nextDataVersion(sourceName) {
  const d = new Date();
  const stamp = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  const rev = `${d.getHours()}${String(d.getMinutes()).padStart(2, '0')}`;
  return `${stamp}-siagri.${rev}`;
}

/*
  Adapta el dataset del Convertidor a un paquete listo para Producción.
  Entrada: convertidorDataset = { records:[...], meta:{ source } }
           previousReportRows (opcional) = filas REPORTE del dataset previo
  Salida:  { ok, validations, summary, dataVersion, reportRows, meta }
  No aplica nada por sí mismo: el llamador debe mostrar el resumen y
  confirmar antes de guardar en `casur_master_data`.
*/
export function adaptSiagriToProduction(convertidorDataset, previousReportRows = []) {
  const records = (convertidorDataset && convertidorDataset.records) || [];
  const validations = validateForProduction(records);
  const reportRows = records.map(recordToReportRow);
  const summary = buildSummary(records, previousReportRows);
  const source = (convertidorDataset && convertidorDataset.meta && convertidorDataset.meta.source) || 'SIAGRI';
  summary.source = source;
  const dataVersion = nextDataVersion(source);
  return {
    ok: validations.pass,
    validations,
    summary,
    dataVersion,
    reportRows,
    meta: { columns: MASTER_COLUMNS, source, rows: reportRows.length, generatedAt: new Date().toISOString() },
  };
}
