/* ============================================================
   master-to-riego-adapter.js — Fase 6.2 (actualizado en Hotfix 6.2.1)
   Capa de adaptación explícita: Maestro Central de Suertes → dominio
   estructural de Riego. NO reescribe Riego; produce un índice compacto
   `farmCode|lot -> campos CENTRAL` que el propio bundle de Riego aplica
   como overlay sobre su `master[]` (ver Hotfix 6.1.3 + overlay 6.2/6.2.1
   en modules/riego/assets/index-*.js).

   CLASIFICACIÓN DE CAMPOS (determinada por inspección del importador real
   de Riego, NO supuesta — ver informe de entrega):

     CENTRAL   (viene del Maestro Central, se sobrescribe):
       farmCode, farmName, lot, area, variety, irrigationType, texture,
       zone, cropStartDate, erp, nrMaster.
       [Hotfix 6.2.1] nrMaster pasa de RIEGO-ONLY a CENTRAL: validado
       contra el baseline real que `Riego.master[].nrMaster` corresponde
       a `cronologico.json details[].numeroRiegos` / `#_de_Riegos` del
       REPORTE (1049/1053 coinciden exactamente; los 4 restantes tienen
       `numeroRiegos=null` y `nrMaster=0` — interpretando null como 0,
       1053/1053 coinciden). null/vacío → 0, misma semántica numérica
       que ya usa el importador real de Riego.

     RIEGO-ONLY (SIEMPRE se preserva, nunca se sobrescribe desde el Maestro):
       key (se recalcula igual en ambos lados, no es un dato a preservar),
       budget, interval — DERIVADOS dentro del propio importador de Riego
                    a partir de irrigationType (regla local, no una
                    columna del Excel); se preservan tal cual estén para
                    no alterar configuración/overrides ya aplicados. Para
                    una suerte NUEVA (sin fila previa en Riego), se
                    calculan con la MISMA regla real del importador
                    (/gravedad|aspers|ventana|mini/i sobre irrigationType).
       active     — proviene de un set de exclusión propio de Riego
                    (Z2, suertes inactivadas administrativamente en
                    Riego), independiente del estado en Producción. Para
                    una suerte NUEVA se calcula con la MISMA regla real
                    (pertenencia al set Z2), nunca inventada.

     DERIVADO (calculado, no copiado literalmente):
       cropStartDate = fecha MÁS RECIENTE entre F. Siembra y F. Ult. Cte
       (misma fórmula exacta que usa el importador real de Riego:
       `[fSiembra,fUltCte].filter(Boolean).sort().at(-1)`). Como
       cronologico.json ya entrega ambas fechas en formato ISO
       AAAA-MM-DD, un ordenamiento de cadenas es válido y equivalente.
   ============================================================ */

/* ---- Versionado: comparación estructurada (fecha + secuencia entera) ----
   Mismo esquema y misma técnica ya validada en Producción (Fase 4.4.x):
   "AAAA.MM.DD-tag.NNNN". Compara primero por fecha real, luego por la
   secuencia como ENTERO (nunca como texto): "1055" debe ganarle a "930". */
export function parseMaestroVersion(v) {
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d{4})\.(\d{2})\.(\d{2})-([a-zA-Z0-9]+)\.(\d+)$/);
  if (!m) return null;
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]), seq = Number(m[5]);
  if (year < 2020 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (!Number.isSafeInteger(seq) || seq < 0) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return { date: year * 10000 + month * 100 + day, seq };
}
export function compareMaestroVersions(a, b) {
  if (a === b) return 0;
  const pa = parseMaestroVersion(a);
  const pb = parseMaestroVersion(b);
  if (!pa || !pb) return null;
  if (pa.date !== pb.date) return pa.date > pb.date ? 1 : -1;
  if (pa.seq !== pb.seq) return pa.seq > pb.seq ? 1 : -1;
  return 0;
}

/* Normalización de llave Hacienda|Suerte — MISMA semántica que `LE()` real
   de Riego (mayúsculas + relleno de un solo dígito con cero). Utilitario
   genérico de 2 líneas, no lógica de negocio; se reimplementa aquí porque
   este adaptador corre en el shell, fuera del bundle de Riego. */
function normText(v) { return v == null ? '' : String(v).trim(); }
function normLot(v) {
  const t = normText(v).toUpperCase();
  return /^\d$/.test(t) ? `0${t}` : t;
}

/* cropStartDate: misma fórmula exacta que el importador real de Riego
   (fecha más reciente entre F. Siembra y F. Ult. Cte). Ambas ya vienen en
   ISO AAAA-MM-DD desde el Cronológico/REPORTE, así que el orden de
   cadenas es correcto y equivalente al `dc()+sort()` real de Riego. */
function cropStartDate(fSiembra, fUltCte) {
  const dates = [fSiembra, fUltCte].filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/* Construye el índice central { byKey, version, generated, rows } a partir
   de FILAS REPORTE (mismo formato que produce el adaptador de Producción,
   Fase 4: Hac-Sue/Cod/Hacienda/Suerte/Area/Variedad/Tipo_de_Riego/Textura/
   ZONA/F. Siembra/F. Ult. Cte/ERP). Usado tanto para publicar el Maestro
   Central recién aplicado en Centro Maestro como para el backfill desde
   `produccion_current`. Validación defensiva de Sucuya (Cod 16): si
   aparece, la función completa devuelve null (no se aplica nada; el
   llamador debe conservar el Maestro anterior válido). */
export function buildMaestroCentralFromReportRows(reportRows, meta) {
  if (!Array.isArray(reportRows) || !reportRows.length) return null;
  const version = meta && meta.dataVersion;
  if (!parseMaestroVersion(version)) return null;
  const byKey = {};
  for (const r of reportRows) {
    const farmCodeRaw = String(r.Cod ?? '').replace(/[^0-9]/g, '');
    if (farmCodeRaw === '16') return null; /* Sucuya: rechazo total, no aplicación parcial */
    const farmCode = normText(r.Cod);
    const lot = normLot(r.Suerte);
    if (!farmCode || !lot) continue;
    const key = `${farmCode}|${lot}`;
    byKey[key] = {
      farmCode, farmName: normText(r.Hacienda), lot,
      area: Number(r.Area) || 0,
      variety: normText(r.Variedad),
      irrigationType: normText(r.Tipo_de_Riego),
      texture: normText(r.Textura),
      zone: normText(r.ZONA),
      cropStartDate: cropStartDate(r['F. Siembra'], r['F. Ult. Cte']),
      erp: normText(r.ERP),
      nrMaster: Number(r['#_de_Riegos'] == null || r['#_de_Riegos'] === '' ? 0 : r['#_de_Riegos']),
    };
  }
  const rows = Object.keys(byKey).length;
  if (!rows) return null;
  return { byKey, version, generated: (meta && meta.generatedAt) || new Date().toISOString(), rows };
}
