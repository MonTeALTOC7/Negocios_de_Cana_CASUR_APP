// QA MC01 en navegador (perfiles aislados, servidor local o preview HTTPS):
//  1. Diagnóstico del Maestro Central en el Centro Maestro (online y offline) sin escribir ni crear bases.
//  2. Contrato con generación local fijada por el propietario (sintética, solo en el perfil de prueba).
//  3. Camino C transaccional: atomicidad, coherencia, rechazo de versiones y recuperación.
// Uso: node tools/qa-maestro-central.cjs BASE_URL OUT_DIR
const {chromium} = require('playwright'), assert = require('assert/strict'), fs = require('fs'), path = require('path');
const [base, out] = process.argv.slice(2);
if (!base || !out) throw Error('Uso: node tools/qa-maestro-central.cjs BASE_URL OUT_DIR');
fs.mkdirSync(out, {recursive: true});
const results = [];
const check = async (name, fn) => { try { await fn(); results.push(['PASS', name]); console.log('PASS · ' + name); }
  catch (e) { results.push(['FAIL', name, e.message.split('\n')[0]]); console.log('FAIL · ' + name + ' · ' + e.message.split('\n').slice(0, 3).join(' ')); } };
const dbState = page => page.evaluate(async () => {
  const list = (await indexedDB.databases()).map(d => d.name).sort(), out = {list};
  if (list.includes('casur_master_data')) {
    const db = await new Promise(r => { const q = indexedDB.open('casur_master_data'); q.onsuccess = () => r(q.result); });
    out.keys = await new Promise(r => { const q = db.transaction('datasets').objectStore('datasets').getAllKeys(); q.onsuccess = () => r(q.result.map(String).sort()); }); db.close();
  }
  return out;
});
const openCentro = async page => {
  await page.goto(base + '#/');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {timeout: 120000});
  await page.evaluate(() => sessionStorage.setItem('casur_master_centro_unlocked', '1'));   // solo el perfil de prueba
  await page.goto(base + '#/centro-maestro'); await page.reload();
  await page.waitForSelector('#maestroDiagnostics[data-ready="true"]', {timeout: 120000});
  return page.locator('#maestroDiagnostics').innerText();
};

(async () => {
  const browser = await chromium.launch();
  for (const [device, opts] of [['pc', {viewport: {width: 1440, height: 1000}}], ['movil', {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, deviceScaleFactor: 1}]]) {
    const ctx = await browser.newContext(opts), page = await ctx.newPage(), errors = [];
    await ctx.addInitScript(() => addEventListener('error', e => console.error('UNHANDLED error-event ' + e.message + ' ' + e.filename + ':' + e.lineno + ' ' + Object.prototype.toString.call(e.error) + ' ' + JSON.stringify(e.error))));
    await ctx.addInitScript(() => addEventListener('unhandledrejection', e => console.error('UNHANDLED ' + (e.reason?.name || typeof e.reason) + ': ' + (e.reason?.message ?? String(e.reason)) + ' ' + String(e.reason?.stack || '').split('\n').slice(0, 3).join(' '))));
    page.on('console', m => { if (m.text().startsWith('UNHANDLED')) errors.push(m.text()); });
    page.on('pageerror', e => errors.push(String(e?.message ?? e) + ' @ ' + String(e?.stack ?? '').split('\n').slice(0, 3).join(' ')));
    await check(`[${device}] Diagnóstico: generación oficial, fuente efectiva y maestros de los módulos`, async () => {
      const text = await openCentro(page);
      assert.match(text, /2026\.11\.22-aforo\.1102/); assert.match(text, /12-Oct-2026/); assert.match(text, /Generación local\s*Ninguna/);
      assert.match(text, /Fuente efectiva\s*Oficial/); assert.match(text, /1[.,]053/);
      for (const m of ['Riegos Ejecutados', 'Insumos Entregados', 'Estimador TCH', 'Seguimiento de Labores']) assert.ok(text.includes(m), m);
      assert.match(text, /Área 148/);
      await page.locator('#maestroDiagnostics details').first().evaluate(d => { d.open = true; });
      const detail = await page.locator('#maestroDiagnostics details').first().innerText();
      assert.match(detail, /51\s+suertes presentes no productivas/); assert.match(detail, /7\s+ausentes/); assert.match(detail, /49\s+diferencias menores/); assert.match(detail, /41\s+por conciliar/);
      await page.locator('#maestroDiagnostics').scrollIntoViewIfNeeded(); await page.screenshot({path: path.join(out, device + '-diagnostico.png'), fullPage: false});
    });
    await check(`[${device}] Diagnóstico de solo lectura: no crea bases ni registros`, async () => {
      const after = await dbState(page);
      await page.locator('[data-diag-refresh]').click(); await page.waitForSelector('#maestroDiagnostics[data-ready="true"]');
      assert.deepEqual(await dbState(page), after);
      assert.ok(!(after.keys || []).length, 'casur_master_data sin registros: ' + JSON.stringify(after));
    });
    await check(`[${device}] Diagnóstico sin conexión`, async () => {
      await ctx.setOffline(true); await page.reload();
      await page.waitForSelector('#maestroDiagnostics[data-ready="true"]', {timeout: 60000});
      assert.match(await page.locator('#maestroDiagnostics').innerText(), /Fuente efectiva\s*Oficial/);
      await ctx.setOffline(false);
    });
    if (device === 'pc') {
      await check('Camino C: transacción única, coherencia, rechazos sin escritura y recuperación', async () => {
        const r = await page.evaluate(async () => {
          const ms = await import(new URL('core/shared-data/master-store.js', location.href).href);
          const ad = await import(new URL('master/adapters/master-to-riego-adapter.js', location.href).href);
          const rows = [{Cod: '901', Hacienda: 'Sintética', Suerte: '1', Area: 3.5, Variedad: 'X', Tipo_de_Riego: 'Secano', ZONA: '1-Sur', 'F. Siembra': '2025-01-01', 'F. Ult. Cte': '2026-01-01', '#_de_Riegos': 0}];
          const make = v => ({payload: {reportRows: rows, dataVersion: v, summary: {}, meta: {}}, central: ad.buildMaestroCentralFromReportRows(rows, {dataVersion: v})});
          const keys = async () => { const db = await new Promise(r => { const q = indexedDB.open('casur_master_data'); q.onsuccess = () => r(q.result); });
            const v = await new Promise(r => { const q = db.transaction('datasets').objectStore('datasets').getAll(); q.onsuccess = () => r(q.result); }); db.close();
            return Object.fromEntries(v.map(x => [x.key, x.payload?.dataVersion || x.payload?.version || x.payload?.production?.dataVersion || null])); };
          const err = async fn => { try { await fn(); return null; } catch (e) { return e.message; } };
          const out = {};
          const a = make('2030.01.01-siagri.1'); await ms.commitSiagriDataset(a.payload, {approved: true, expectedVersion: null, maestro: a.central});
          out.first = await keys();
          const b = make('2030.01.02-siagri.1');
          out.staleExpected = await err(() => ms.commitSiagriDataset(b.payload, {approved: true, expectedVersion: null, maestro: b.central}));
          out.mismatch = await err(() => ms.commitSiagriDataset(b.payload, {approved: true, expectedVersion: '2030.01.01-siagri.1', maestro: a.central}));
          out.notApproved = await err(() => ms.commitSiagriDataset(b.payload, {expectedVersion: '2030.01.01-siagri.1', maestro: b.central}));
          out.afterRejects = await keys();
          await ms.saveMaestroSuertes(make('2031.01.01-siagri.1').central);   // un Maestro Central más nuevo ya guardado
          out.olderThanMaestro = await err(() => ms.commitSiagriDataset(b.payload, {approved: true, expectedVersion: '2030.01.01-siagri.1', maestro: b.central}));
          out.afterOlder = await keys();
          await ms.saveMaestroSuertes(a.central);
          await ms.commitSiagriDataset(b.payload, {approved: true, expectedVersion: '2030.01.01-siagri.1', maestro: b.central});
          out.second = await keys();
          out.reuse = await err(() => ms.commitSiagriDataset(a.payload, {approved: true, expectedVersion: '2030.01.02-siagri.1', maestro: a.central}));
          await ms.restoreOperationalPrevious({approved: true, expectedVersion: '2030.01.02-siagri.1'});
          out.restored = await keys();
          return out;
        });
        assert.equal(r.first.produccion_current, '2030.01.01-siagri.1'); assert.equal(r.first.maestro_suertes_current, '2030.01.01-siagri.1');
        assert.ok(r.first['operational_generation:2030.01.01-siagri.1']);
        assert.match(r.staleExpected, /La generación cambió/); assert.match(r.mismatch, /no conciliado/); assert.match(r.notApproved, /no aprobada/);
        assert.deepEqual(r.afterRejects, r.first);
        assert.match(r.olderThanMaestro, /igual o más nuevo/); assert.equal(r.afterOlder.produccion_current, '2030.01.01-siagri.1');
        assert.equal(r.second.produccion_current, '2030.01.02-siagri.1'); assert.equal(r.second.maestro_suertes_current, '2030.01.02-siagri.1');
        assert.equal(r.second.operational_previous, '2030.01.01-siagri.1');
        assert.match(r.reuse, /ya fue utilizada/);
        assert.equal(r.restored.produccion_current, '2030.01.01-siagri.1'); assert.equal(r.restored.maestro_suertes_current, '2030.01.01-siagri.1');
        fs.writeFileSync(path.join(out, 'camino-c.json'), JSON.stringify(r, null, 1));
      });
      await check('Contrato con generación local fijada por el propietario (sintética)', async () => {
        await page.evaluate(async () => {
          const crono = await (await fetch('modules/produccion/data/cronologico.json')).json();
          crono.meta.dataVersion = '2026.10.25-aforo.1101'; crono.meta.manualChanges = false;
          const payload = {dataVersion: crono.meta.dataVersion, meta: {manualChanges: false},
            operationalDataset: {contractVersion: 1, dataVersion: crono.meta.dataVersion, catalog: [{codLote: '1'}], cronologico: crono}};
          const db = await new Promise(r => { const q = indexedDB.open('casur_master_data'); q.onsuccess = () => r(q.result); });
          await new Promise(r => { const t = db.transaction('datasets', 'readwrite'); t.objectStore('datasets').put({key: 'produccion_current', payload, savedAt: new Date().toISOString()}); t.oncomplete = r; });
          db.close(); localStorage.setItem('casur-production-source', 'personal');
        });
        await page.reload(); await page.waitForSelector('#maestroDiagnostics[data-ready="true"]', {timeout: 120000});
        const text = await page.locator('#maestroDiagnostics').innerText();
        assert.match(text, /Fuente efectiva\s*Local · 2026\.10\.25-aforo\.1101/); assert.match(text, /Generación local fijada/);
        await page.evaluate(() => localStorage.setItem('casur-production-source', 'official')); await page.reload();
        await page.waitForSelector('#maestroDiagnostics[data-ready="true"]', {timeout: 120000});
        assert.match(await page.locator('#maestroDiagnostics').innerText(), /Fuente efectiva\s*Oficial · 2026\.11\.22-aforo\.1102/);
      });
    }
    await check(`[${device}] Sin errores de página`, async () => assert.deepEqual(errors, [], errors.join(' | ')));
    await ctx.close();
  }
  await browser.close();
  const pass = results.filter(r => r[0] === 'PASS').length;
  fs.writeFileSync(path.join(out, 'qa-maestro-central.json'), JSON.stringify({base, results}, null, 1));
  console.log(`${pass}/${results.length} ${pass === results.length ? 'PASS' : 'FAIL'}`); if (pass !== results.length) process.exitCode = 1;
})();
