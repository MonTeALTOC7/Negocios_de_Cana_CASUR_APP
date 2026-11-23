// Plan de Cosecha Z26/27 · construcción reproducible de la generación de datos de Producción (Issue #67).
// Ejecuta los MISMOS motores de la app (XLSX → workbookSheets → inspectSheets → parseCandidate →
// prepareUpdate → CASUR_BUILD_CRONO_DATA) en Chromium, con una capa explícita de ajustes autorizados.
// Las fuentes Excel NO se versionan: se leen desde rutas locales y se verifican por SHA-256.
//
// Uso: node tools/serve-maestro-preview.mjs --ref <SHA base> --port 4590 &
//      node tools/plan-z2627/build-aforo-z2627.cjs http://127.0.0.1:4590/Negocios_de_Cana_CASUR_APP/ AFORO.xlsx CONSOLIDADO.xlsx OUT_DIR [--write]
// Sin --write solo valida y deja el informe en OUT_DIR. Con --write reemplaza los siete archivos de
// modules/produccion/data; en historico.* solo cambia meta.dataVersion (registros idénticos, verificado).
const {chromium} = require('playwright'), fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert/strict');
const [base, aforoPath, consPath, outDir] = process.argv.slice(2), write = process.argv.includes('--write');
if (!outDir) throw Error('Uso: build-aforo-z2627.cjs BASE AFORO.xlsx CONSOLIDADO.xlsx OUT_DIR [--write]');
const root = path.resolve(__dirname, '..', '..'), dataDir = path.join(root, 'modules/produccion/data');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
// Fuentes aceptadas. El AFORO recibido (2e3c…) es el original 7a44… con AH de AIDOSA 908/09,10,15 ya
// cambiado a «Semilla» (corrección autorizada); el propietario aceptó continuar con él (verificado celda a celda).
const SOURCES = {
  aforo: {file: 'Productores _Servicios_Z2627.xlsx', sheet: 'AFORO_26-27', sha256: '2e3cfedb0682024753f7dca7f484326641e281bf018de44f823052369dfada60', documentedOriginal: '7a44b75b50d5c7b8ed19b1d2f6447ca25122e73802e2c2ef2d1846bed8768f98'},
  consolidado: {file: 'CASUR_Actualizacion_Oficial_Propuesta_Plan_Z2627_Plantilla.xlsx', sheet: 'MAESTRO Z2627', sha256: '3277b48696d426b7906ccb6a0fedc0cfe2ceb55570cef0147455633c75d013fe'},
};
const DATA_VERSION = '2026.11.22-aforo.1102', SOURCE_DATE = '2026-11-22', IMPORTED_AT = '2026-11-22T12:00:00.000Z';
// Mapeo explícito, campo → letra de columna. Igual a la generación 1101 salvo AD (actTCH) y BE (Fecha Cosecha).
const MAPPING = {code: 'B', lot: 'D', name: 'C', area: 'E', combined: 'AC', classification: 'AH', destination: 'R', estimateTch: 'AD', estimateTons: 'AE',
  previousTch: 'P', variety: 'G', cut: 'H', sowing: 'N', lastCut: 'O', km: 'F', spacing: 'K', texture: 'J', zone: 'AA', irrigation: 'V',
  irrigationCount: 'W', tenure: 'T', erp: 'X', cropType: 'S', age: 'Y', proposedDate: 'BE', proposedCut: 'BF', baseDate: 'BG'};
const col = letter => [...letter].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

(async () => {
  const aforoBytes = fs.readFileSync(aforoPath), consBytes = fs.readFileSync(consPath);
  assert.equal(sha(aforoBytes), SOURCES.aforo.sha256, 'SHA-256 del AFORO no autorizado');
  assert.equal(sha(consBytes), SOURCES.consolidado.sha256, 'SHA-256 del consolidado no autorizado');
  const adjustments = JSON.parse(fs.readFileSync(path.join(__dirname, 'ajustes-autorizados.json'), 'utf8'));
  fs.mkdirSync(outDir, {recursive: true});
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + 'modules/produccion/');
    await page.waitForFunction(() => window.CASUR_PRODUCTION_READY && window.CASUR_OPERATIONAL_IMPORT && window.CASUR_BUILD_CRONO_DATA, null, {timeout: 90000});
    const result = await page.evaluate(async ({aforoB64, consB64, SOURCES, MAPPING, DATA_VERSION, SOURCE_DATE, IMPORTED_AT, adjustments}) => {
      if (window.CRONO_DATA.meta.dataVersion !== '2026.10.25-aforo.1101') throw Error('La base debe ser la generación oficial 1101, no una local: ' + window.CRONO_DATA.meta.dataVersion);
      if (!window.XLSX) await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'vendor/xlsx.bundle.js'; s.onload = ok; s.onerror = ko; document.head.append(s); });
      const {workbookSheets} = await import(new URL('../../core/imports/workbook-reader.js', location.href).href);
      const E = window.CASUR_OPERATIONAL_IMPORT, bytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const col = letter => [...letter].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
      // ---- Fuente oficial ----
      const sheets = workbookSheets(XLSX.read(bytes(aforoB64), {type: 'array', cellDates: false, cellNF: true, cellFormula: true}), XLSX);
      // «-» en AD/AE/AF/AG de filas que no son Molienda = sin aforo (vacío). En Molienda seguiría siendo error.
      const dashes = [], aforoSheet = sheets.find(s => s.name === SOURCES.aforo.sheet);
      aforoSheet.rows.forEach((row, i) => { if (!row || i < 3) return; const cls = E.norm(row[col('AH')]);
        for (const c of ['AD', 'AE', 'AF', 'AG']) if (String(row[col(c)] ?? '').trim() === '-') { if (cls === 'molienda') throw Error('«-» en ' + c + (i + 1) + ' de Molienda'); dashes.push({row: i + 1, key: String(row[col('B')]).trim() + String(row[col('D')]).trim(), column: c}); row[col(c)] = null; } });
      const inspection = E.inspectSheets(sheets), candidate = inspection.candidates.find(c => c.sheetName === SOURCES.aforo.sheet && c.inventory);
      if (!candidate) throw Error('AFORO_26-27 no detectada como inventario');
      const overrides = Object.fromEntries(Object.keys(E.aliases).map(f => [f, MAPPING[f] ? col(MAPPING[f]) : -1]));
      const mappingAudit = Object.fromEntries(Object.entries(MAPPING).map(([f, l]) => [f, {column: l, header: candidate.headers[col(l)]}]));
      const source = {file: SOURCES.aforo.file, sha256: SOURCES.aforo.sha256, sourceDate: SOURCE_DATE, season: '26/27', sheet: candidate.sheetName, headerRow: candidate.headerRow + 1,
        headerVersion: 'Version del 12.10.2026', documentedOriginalSha256: SOURCES.aforo.documentedOriginal,
        consolidatedSha256: SOURCES.consolidado.sha256};
      const parsed = E.parseCandidate(sheets, candidate, source, overrides);
      const errors = parsed.issues.filter(i => i.level === 'error'); if (errors.length) throw Error('Errores críticos: ' + JSON.stringify(errors.slice(0, 5)));
      const byKey = new Map(parsed.records.map(r => [r.key, r]));
      // ---- Consolidado autorizado (valores vigentes por identidad) ----
      const cs = XLSX.read(bytes(consB64), {type: 'array', cellDates: true}), raw = XLSX.utils.sheet_to_json(cs.Sheets[SOURCES.consolidado.sheet], {header: 1, raw: true, defval: null});
      const hi = raw.findIndex(r => r.includes('Cod. lote')), H = raw[hi], at = name => H.indexOf(name);
      const iso = v => v instanceof Date ? new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : v ?? null;
      const cons = new Map(raw.slice(hi + 1).filter(r => r[at('Cod. lote')] != null).map(r => [String(r[at('Cod. lote')]).trim(), Object.fromEntries(H.map((h, i) => [h, iso(r[i])]))]));
      // ---- Capa de ajustes autorizados (verifica «before») ----
      const applied = [];
      for (const a of adjustments.adjustments) {
        const r = byKey.get(a.key); if (!r) throw Error('Ajuste sin identidad: ' + a.key);
        const before = a.field === 'cut' ? (r.fields.cut == null ? null : String(r.fields.cut).trim()) : r.dates[a.field]?.iso ?? null;
        if (before !== a.before) throw Error(`Ajuste ${a.key}.${a.field}: origen ${before} ≠ declarado ${a.before}`);
        const prov = r.provenance[a.field] || (r.provenance[a.field] = {sheet: candidate.sheetName, row: r.source.row, column: col(MAPPING[a.field]) + 1, header: candidate.headers[col(MAPPING[a.field])]});
        prov.authorizedAdjustment = {before: a.before, after: a.after, issue: adjustments.issue, authority: adjustments.authority, note: a.note};
        if (a.field === 'cut') r.fields.cut = a.after; else r.dates[a.field] = E.dateValue(a.after);
        applied.push({key: a.key, field: a.field, before: a.before, after: a.after});
      }
      for (const x of adjustments.alreadyInSource) {
        const r = byKey.get(x.key), v = x.field === 'classification' ? r.classification : E.number(r.fields[x.field]);
        if (v !== x.value) throw Error(`Valor autorizado ausente en la fuente: ${x.key}.${x.field}=${v}`);
      }
      // «Semilla AS» y equivalentes: se muestra el destino vigente; el valor bruto queda en la procedencia.
      const normalized = [];
      for (const r of parsed.records) {
        const visible = cons.get(r.key)?.['Destino visible'], rawDest = r.fields.destination;
        if (visible && rawDest != null && String(rawDest).trim() !== visible) { r.provenance.destination = {...r.provenance.destination, normalizedFrom: rawDest, normalizedTo: visible, reason: 'Destino visible autorizado (Semilla sin sufijos)'}; r.fields.destination = visible; normalized.push({key: r.key, from: rawDest, to: visible}); }
      }
      // ---- Generación con el motor de la app ----
      const base = window.CRONO_DATA.producers.flatMap(p => p.details.map(r => ({...r, code: r.code || p.code, name: r.name || p.name, dataVersion: r.dataVersion || window.CRONO_DATA.meta.dataVersion})));
      const proposal = E.prepareUpdate(base, parsed, {dataVersion: DATA_VERSION, importedAt: IMPORTED_AT, decisions: window.CASUR_OPERATIONAL_DECISIONS});
      // Escenario optimista AF/AG: solo Molienda con estimado utilizable; nunca alimenta los KPI oficiales.
      const optimistic = {tons: 0, area: 0, lots: 0, belowOfficial: []};
      const sheet = sheets.find(s => s.name === candidate.sheetName);
      for (const r of proposal.catalog) {
        const p = E.participation(r); r.forecastOptimistic = null;
        if (r.sourcePresence !== 'present' || !p.usable) continue;
        const rec = byKey.get(r.codLote), row = sheet.rows[rec.source.row - 1], tch = E.number(row[col('AF')]), tons = E.number(row[col('AG')]);
        if (tch === null || tons === null) continue;
        r.forecastOptimistic = {season: '26/27', tch, tons, source: {file: source.file, sheet: candidate.sheetName, row: rec.source.row, columns: {tch: 'AF · ' + candidate.headers[col('AF')], tons: 'AG · ' + candidate.headers[col('AG')]}}};
        optimistic.tons += tons; optimistic.area += r.inventoryArea; optimistic.lots++;
        if (tch < E.number(r.forecast.tch)) optimistic.belowOfficial.push({key: r.codLote, official: E.number(r.forecast.tch), optimistic: tch});
      }
      optimistic.tch = optimistic.area ? optimistic.tons / optimistic.area : null;
      // Alertas de programación: BE a menos de 6 meses de la fecha base del ciclo (no se modifica BE).
      const alerts = [];
      for (const r of proposal.catalog) {
        if (!E.participation(r).milling || !r.plan?.date?.iso || !r.fBase) continue;
        const months = (Date.parse(r.plan.date.iso) - Date.parse(r.fBase)) / 86400000 / 30.4375;
        if (months < 6) alerts.push({key: r.codLote, plan: r.plan.date.iso, base: r.fBase, months: Math.round(months * 100) / 100});
      }
      alerts.forEach(a => proposal.issues.push({level: 'warning', code: 'plan-age', key: a.key, message: `BE ${a.plan} a ${a.months} meses de la fecha base ${a.base}; validar con Programación (BE no se modifica).`}));
      const crono = window.CASUR_BUILD_CRONO_DATA(proposal.catalog, source.file);
      crono.meta = {...crono.meta, source: source.file, sheet: candidate.sheetName, rows: proposal.catalog.length, rawRows: parsed.records.length, sourceProfiles: parsed.profiles,
        rule: 'Catálogo permanente; área activa de Molienda/Semilla; estimado de molienda separado del TCH ejecutado.',
        tchEst2627EffectiveDate: SOURCE_DATE, estimateSeason: '26/27', dataVersion: DATA_VERSION, sourceSha256: source.sha256, generated: SOURCE_DATE, publishedAt: null,
        importedAt: IMPORTED_AT, operationalContract: 1, previousDataVersion: window.CRONO_DATA.meta.dataVersion, manualChanges: false,
        harvestPlanLabel: 'Fecha para cosecha 26/27', sourceHeaderVersion: source.headerVersion, consolidatedSha256: SOURCES.consolidado.sha256,
        authorizedAdjustments: applied.length, optimisticScenario: {season: '26/27', tons: optimistic.tons, area: optimistic.area, tch: optimistic.tch, lots: optimistic.lots, columns: 'AF/AG', role: 'Escenario secundario; no sustituye AD/AE'}};
      proposal.catalog.forEach(r => { r.tchEst2627Fecha = r.tchEst2627 !== null ? SOURCE_DATE : null; r.tchEst2627Fuente = r.tchEst2627 !== null ? source.file : null; });
      crono.operational = {totals: proposal.totals, harvestLines: [], planAudit: proposal.planAudit || null, planAlerts: alerts, optimisticBelowOfficial: optimistic.belowOfficial};
      E.validateGeneration({...proposal, cronologico: crono});
      // ---- Validación fila a fila contra el consolidado autorizado ----
      const rows = new Map(crono.producers.flatMap(p => p.details).map(r => [r.codLote, r])), mismatches = [];
      const near = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.005;
      for (const [key, c] of cons) {
        const r = rows.get(key); if (!r) { mismatches.push([key, 'missing']); continue; }
        const p = E.participation(r), cls = r.sourcePresence === 'absent' ? 'Catálogo inactivo' : r.classification;
        const checks = [['clase', cls, c['Clasificación vigente']], ['área activa', p.activeArea, c['Área activa (ha)'], 1], ['área molienda', p.millingArea, c['Área molienda (ha)'], 1],
          ['área semilla', p.active && !p.milling ? p.activeArea : 0, c['Área semilla (ha)'], 1], ['t oficial', p.estimatedTons || 0, c['Ton oficial computable'], 1],
          ['t optimista', r.forecastOptimistic?.tons || 0, c['Ton optimista computable'], 1]];
        if (r.sourcePresence === 'present') checks.push(['NC', r.corte == null ? null : String(r.corte), c['NC vigente'] == null ? null : String(c['NC vigente'])], ['siembra', r.fSiembra || null, c['Siembra vigente']], ['últ. corte', r.fUltCte || null, c['Últ. corte vigente']], ['destino', r.destino, c['Destino visible']]);
        if (p.milling) checks.push(['BE', r.plan?.date?.iso, c['BE · Fecha para cosecha 26/27']], ['BF', r.plan?.cut, c['BF · Tipo de corte']], ['AD', E.number(r.forecast?.tch), c['AD · TCH oficial'], 1]);
        for (const [name, a, b, numeric] of checks) if (numeric ? !near(a, b) : (a ?? null) !== (b ?? null)) mismatches.push([key, name, a, b]);
      }
      const t = proposal.totals;
      return {crono, mismatches, applied, normalized, dashes, alerts, optimistic, mappingAudit, issues: proposal.issues, differences: proposal.differences,
        totals: {catalog: t.catalog, inventoried: t.inventoried, active: t.active, milling: t.milling, seed: t.seed, absent: t.absent, inactive: t.inactive, activeArea: t.activeArea, millingArea: t.millingArea, seedArea: t.seedArea, millingTons: t.millingTons, millingTch: t.millingTch, usable: t.usable, pendingMillingArea: t.pendingMillingArea, byClass: t.byClass},
        producers: crono.producers.length};
    }, {aforoB64: aforoBytes.toString('base64'), consB64: consBytes.toString('base64'), SOURCES, MAPPING, DATA_VERSION, SOURCE_DATE, IMPORTED_AT, adjustments});
    assert.deepEqual(errors, [], 'errores de página');
    // ---- Controles de integridad del Issue #67 ----
    const t = result.totals, near = (a, b, e = 0.005) => Math.abs(a - b) < e;
    const controls = [['identidades', t.catalog === 1053], ['inventariadas', t.inventoried === 1046], ['catálogo sin presencia', t.absent === 7], ['haciendas', result.producers === 100],
      ['Molienda 946', t.milling === 946], ['Semilla 49', t.seed === 49], ['activa 9,574.66', near(t.activeArea, 9574.66)], ['molienda 9,101.68', near(t.millingArea, 9101.68)],
      ['semilla 472.98', near(t.seedArea, 472.98)], ['t oficiales 561,658.27', near(t.millingTons, 561658.27)], ['TCH 61.7093', near(t.millingTch, 61.7093, 0.0001)],
      ['optimista 597,888.40 t', near(result.optimistic.tons, 597888.40)], ['TCH optimista 65.6899', near(result.optimistic.tch, 65.6899, 0.0001)],
      ['AF<AD = 3 (14/27, 125/04, 993/19)', JSON.stringify(result.optimistic.belowOfficial.map(x => x.key).sort()) === JSON.stringify(['1427', '12504', '99319'].sort())],
      ['fuera de producción 58', t.inactive === 58], ['sin estimado pendiente', near(t.pendingMillingArea, 0)], ['ajustes aplicados 13', result.applied.length === 13],
      ['alerta 6/04', result.alerts.some(a => a.key === '604')], ['0 diferencias con el consolidado', result.mismatches.length === 0]];
    const report = {dataVersion: DATA_VERSION, sources: SOURCES, mapping: result.mappingAudit, totals: t, optimistic: result.optimistic, controls: controls.map(([n, ok]) => ({control: n, ok})),
      authorizedAdjustments: result.applied, destinationNormalized: result.normalized.length, dashAsEmpty: result.dashes, planAlerts: result.alerts, mismatches: result.mismatches,
      warnings: result.issues.reduce((m, i) => (m[i.code] = (m[i.code] || 0) + 1, m), {}), differences: result.differences.reduce((m, d) => { const k = d.kind + (d.field ? ':' + d.field : ''); m[k] = (m[k] || 0) + 1; return m; }, {})};
    fs.writeFileSync(path.join(outDir, 'informe-generacion.json'), JSON.stringify(report, null, 2) + '\n');
    fs.writeFileSync(path.join(outDir, 'diferencias-por-campo.json'), JSON.stringify(result.differences, null, 1) + '\n');
    fs.writeFileSync(path.join(outDir, 'avisos.json'), JSON.stringify(result.issues, null, 1) + '\n');
    for (const [n, ok] of controls) console.log((ok ? 'OK   ' : 'FAIL ') + n);
    if (result.mismatches.length) console.log('Diferencias:', JSON.stringify(result.mismatches.slice(0, 20)));
    if (controls.some(([, ok]) => !ok)) throw Error('Controles de integridad no superados; no se escribe ningún dato.');
    // ---- Archivos de datos (mismo formato que la generación vigente) ----
    const release = {version: DATA_VERSION, source: SOURCES.aforo.file, sheet: SOURCES.aforo.sheet, publishedAt: null, generated: SOURCE_DATE, tchEst2627EffectiveDate: SOURCE_DATE,
      sourceSha256: SOURCES.aforo.sha256, cronologicoRows: result.crono.global?.suertes ?? 1053, historicoRows: JSON.parse(fs.readFileSync(path.join(dataDir, 'version.json'), 'utf8')).historicoRows};
    // Histórico: same records; only meta.dataVersion follows the generation (as the app packager does).
    const historico = JSON.parse(fs.readFileSync(path.join(dataDir, 'historico.json'), 'utf8'));
    const previousHistorico = JSON.stringify({...historico, meta: {...historico.meta, dataVersion: null}});
    historico.meta = {...historico.meta, sourceDataVersion: historico.meta.sourceDataVersion || historico.meta.dataVersion || null, dataVersion: DATA_VERSION};
    assert.equal(JSON.stringify({...historico, meta: {...historico.meta, dataVersion: null}}), previousHistorico, 'Histórico: solo cambia meta.dataVersion');
    const files = {'version.json': JSON.stringify(release) + '\n', 'version.js': 'window.CASUR_RELEASE=' + JSON.stringify(release) + ';\n',
      'historico.json': JSON.stringify(historico) + '\n', 'historico.js': 'window.CASUR_REMOTE_HISTORICO=' + JSON.stringify(historico) + ';\n',
      'cronologico.json': JSON.stringify(result.crono) + '\n', 'cronologico.js': 'window.CASUR_REMOTE_CRONO=' + JSON.stringify(result.crono) + ';\n'};
    const target = write ? dataDir : path.join(outDir, 'data');
    fs.mkdirSync(target, {recursive: true});
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(target, name), content);
    const integrity = {schemaVersion: 1, dataVersion: DATA_VERSION, files: {}};
    for (const n of ['version.json', 'version.js', 'cronologico.json', 'cronologico.js', 'historico.json', 'historico.js']) integrity.files[n] = sha(fs.readFileSync(path.join(target, n)));
    fs.writeFileSync(path.join(target, 'integrity.json'), JSON.stringify(integrity, null, 2) + '\n');
    console.log(`Generación ${DATA_VERSION} ${write ? 'escrita en modules/produccion/data' : 'validada en ' + target}`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message || e); process.exit(1); });
