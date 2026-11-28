// QA de migración y recuperación de Visitas (datos SINTÉTICOS, perfiles aislados).
//  1. Base VC01 (IndexedDB v1) con un borrador SIN productor (como lo creaba «Nueva visita» en 1.0.0) y una visita completa
//     con hallazgos embebidos, foto y seguimiento → la app abre todas las pantallas, migra a v3 sin perder nada y permite
//     completar el borrador.
//  2. Base 1.1/1.2 (IndexedDB v2) con visita, hallazgo, foto y seguimiento → v3 conserva ids, fechas, relaciones y
//     originales, y agrega el contexto propio (productor, suerte, instantánea) desde la visita.
// Uso: node tools/qa-visitas-migracion.cjs BASE_URL OUT_DIR
const {chromium} = require('playwright'), assert = require('assert/strict'), fs = require('fs'), path = require('path');
const [base, out] = process.argv.slice(2);
if (!base || !out) throw Error('Uso: node tools/qa-visitas-migracion.cjs BASE_URL OUT_DIR');
fs.mkdirSync(out, {recursive: true});
const V = base + 'modules/visitas/', results = [];
const check = async (name, fn) => { try { await fn(); results.push(['PASS', name]); console.log('PASS · ' + name); } catch (e) { results.push(['FAIL', name, e.message.split('\n')[0]]); console.log('FAIL · ' + name + ' · ' + e.message.split('\n').slice(0, 4).join(' ')); } };
const ready = p => p.waitForFunction(() => window.CASUR_VISITAS_READY === true, null, {timeout: 120000});
const db = (p, fn, arg) => p.evaluate(async ([src, a]) => { const s = await import(new URL('js/store.js', location.href).href); return (0, eval)(src)(s, a); }, [fn.toString(), arg]);
const NOW = '2026-11-20T15:00:00.000Z', SNAP = {dataVersion: '2026.11.22-aforo.1102', aforoDate: '2026-10-12', takenAt: NOW,
  records: [{key: '7|01', identity: {farmCode: '7', lot: '01', lotCode: '701'}, farm: {code: '7', name: 'Amayo', zone: '5-Productores'}, attributes: {variety: 'X'}, state: {}, provenance: {sourceDate: '2026-10-12'}}]};
// Crea una base con el esquema de una versión anterior (mismo origen) ANTES de abrir Visitas.
const SEED = ([version, stores, data, jpgArr]) => new Promise((ok, ko) => {
  const r = indexedDB.open('casur-visitas', version);
  r.onupgradeneeded = () => { for (const [name, idx] of Object.entries(stores)) { const s = r.result.createObjectStore(name, {keyPath: name === 'settings' ? 'key' : 'id'}); for (const [i, k] of idx) s.createIndex(i, k); } };
  r.onsuccess = () => { const t = r.result.transaction(Object.keys(data), 'readwrite');
    for (const [n, list] of Object.entries(data)) for (const x of list) t.objectStore(n).put(x.blob ? {...x, blob: new Blob([new Uint8Array(jpgArr)], {type: 'image/jpeg'})} : x);
    t.oncomplete = () => { r.result.close(); ok(); }; t.onerror = () => ko(t.error); };
  r.onerror = () => ko(r.error);
});
const V1_STORES = {visits: [['updatedAt', 'updatedAt'], ['producerCode', 'producer.code'], ['status', 'status']], followups: [['visitId', 'visitId'], ['state', 'state'], ['kind', 'kind']], photos: [['visitId', 'visitId'], ['backupState', 'backupState']], backups: [['createdAt', 'createdAt']], settings: []};
const V2_STORES = {...V1_STORES, findings: [['visitId', 'visitId'], ['producerCode', 'producerCode'], ['observedAt', 'observedAt']]};

(async () => {
  const browser = await chromium.launch();
  const jpg = Buffer.from(await (await browser.newPage()).evaluate(async () => { const c = document.createElement('canvas'); c.width = 64; c.height = 48; c.getContext('2d').fillRect(0, 0, 64, 48); return [...new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/jpeg'))).arrayBuffer())]; }));
  for (const [label, version, stores, data] of [
    ['VC01 (v1)', 1, V1_STORES, {
      visits: [{id: 'visita-v1-borrador', schema: 1, status: 'borrador', rev: 1, createdAt: NOW, updatedAt: NOW, startedAt: NOW, author: {name: ''}, producer: null, scope: 'suertes', lots: [], reason: '', fields: {}, observations: '', findings: [], masterSnapshot: null, revisions: []},
        {id: 'visita-v1-completa', schema: 1, status: 'cerrada', rev: 3, createdAt: NOW, updatedAt: NOW, startedAt: NOW, author: {name: 'Técnico QA'}, producer: {code: '7', name: 'Amayo', zone: '5-Productores'}, scope: 'suertes',
          lots: [{key: '7|01', selection: 'manual'}], reason: 'Seguimiento', fields: {}, observations: 'Observación VC01', findings: [{id: 'hallazgo-v1-a', category: 'Malezas', text: 'Coquillo VC01', lotKey: '7|01', severity: 'Media'}], masterSnapshot: SNAP, revisions: []}],
      followups: [{id: 'recomendacion-v1', kind: 'recomendacion', visitId: 'visita-v1-completa', findingId: null, producerCode: '7', producerName: 'Amayo', lotKey: '7|01', text: 'Control VC01', state: 'Pendiente', createdAt: NOW, updatedAt: NOW, rev: 1, history: [{state: 'Pendiente', at: NOW}]}],
      photos: [{id: 'foto-v1', schema: 1, visitId: 'visita-v1-completa', lotKey: '7|01', blob: true, type: 'image/jpeg', size: jpg.length, sha256: 'x', addedAt: NOW, backupState: 'local', location: {source: 'none'}}]}],
    ['Visitas 1.1/1.2 (v2)', 2, V2_STORES, {
      visits: [{id: 'visita-v2', schema: 2, status: 'abierta', rev: 2, createdAt: NOW, updatedAt: NOW, startedAt: NOW, author: {name: 'Técnico QA'}, producer: {code: '7', name: 'Amayo', zone: '5-Productores'}, scope: 'suertes', lotKeys: ['7|01'], lotSources: {'7|01': 'gps'}, general: {notes: 'Visita 1.2'}, masterSnapshot: SNAP, revisions: []}],
      findings: [{id: 'hallazgo-v2', schema: 2, visitId: 'visita-v2', producerCode: '7', lotKey: '7|01', category: 'plagas', createdAt: NOW, updatedAt: NOW, rev: 2, observedAt: NOW, observation: 'Barrenador 1.2', details: {}, severity: null, gps: {source: 'device', lat: 11.4, lon: -85.8, accuracy: 6}, status: 'Abierto', history: [{state: 'Abierto', at: NOW}]}],
      followups: [{id: 'recomendacion-v2', kind: 'recomendacion', visitId: 'visita-v2', findingId: 'hallazgo-v2', producerCode: '7', producerName: 'Amayo', lotKey: '7|01', text: 'Control 1.2', state: 'En gestión', createdAt: NOW, updatedAt: NOW, rev: 2, history: [{state: 'Pendiente', at: NOW}, {state: 'En gestión', at: NOW}]}],
      photos: [{id: 'foto-v2', schema: 2, visitId: 'visita-v2', findingId: 'hallazgo-v2', followupId: null, lotKey: '7|01', role: 'inicial', blob: true, type: 'image/jpeg', size: jpg.length, sha256: 'y', addedAt: NOW, backupState: 'local', location: {source: 'exif', lat: 11.4, lon: -85.8, accuracy: 3}, caption: 'Foto 1.2'}]}],
  ]) {
    const ctx = await browser.newContext({viewport: {width: 390, height: 844}}), page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + 'core/versions/versions.js');
    await page.evaluate(SEED, [version, stores, JSON.parse(JSON.stringify(data, (k, v) => k === 'blob' ? true : v)), [...jpg]]);
    await check(`${label}: todas las pantallas abren sin errores`, async () => {
      for (const r of ['inicio', 'productores', 'mapa', 'registrar', 'gestion', 'evidencias', 'informes', 'visitas', 'datos']) {
        await page.goto(V + '#/' + r); await ready(page); await page.waitForTimeout(r === 'mapa' ? 2500 : 700);
        const txt = await page.locator('#view').innerText(); assert.doesNotMatch(txt, /No se pudo abrir esta pantalla/, `${r}: ${txt.slice(0, 160)}`);
      }
      assert.deepEqual(errors, []);
    });
    await check(`${label}: migración v3 no destructiva (ids, relaciones, originales y contexto propio)`, async () => {
      const st = await page.evaluate(async () => { const s = await import(new URL('js/store.js', location.href).href); const d = await s.openStore();
        return {version: d.version, photoIdx: [...d.transaction('photos').objectStore('photos').indexNames], visits: await s.all('visits'), findings: await s.all('findings'), followups: await s.all('followups'), photos: (await s.all('photos')).map(p => ({...p, blob: !!p.blob, size: p.size}))}; });
      assert.equal(st.version, 3); assert.ok(st.photoIdx.includes('findingId') && st.photoIdx.includes('producerCode'));
      assert.equal(st.visits.length, data.visits.length, 'ninguna visita perdida');
      for (const v of data.visits) assert.ok(st.visits.some(x => x.id === v.id), 'conserva ' + v.id);
      for (const p of data.photos) { const m = st.photos.find(x => x.id === p.id); assert.ok(m && m.blob && m.size === jpg.length, 'foto original conservada ' + p.id); assert.equal(m.visitId, p.visitId); assert.equal(m.producer?.code, '7', 'contexto desde la visita'); assert.equal(m.schema, 3); }
      for (const f of st.findings) { assert.equal(f.schema, 3); assert.equal(f.producer?.code, '7'); assert.ok(f.visitId); assert.equal(f.record?.key, '7|01'); assert.equal(f.status, 'Abierto'); }
      for (const f of data.findings || []) assert.ok(st.findings.some(x => x.id === f.id && x.observedAt === f.observedAt && x.rev === f.rev), 'hallazgo conservado ' + f.id);
      if (version === 1) assert.ok(st.findings.some(x => x.id === 'hallazgo-v1-a' && x.observation === 'Coquillo VC01'), 'hallazgo embebido de VC01 migrado');
      for (const f of data.followups) assert.ok(st.followups.some(x => x.id === f.id && x.producer?.code === '7' && x.history.length === f.history.length), 'seguimiento conservado ' + f.id);
    });
    if (version === 1) await check('VC01: el borrador sin productor se informa en Inicio y se completa sin perder su identidad', async () => {
      await page.goto(V + '#/inicio'); await ready(page); await page.waitForSelector('.vc-card--pending');
      assert.match(await page.locator('.vc-card--pending').innerText(), /Visita sin productor/);
      await page.screenshot({path: path.join(out, 'migracion-inicio-borrador.png')});
      await page.click('.vc-card--pending a[href="#/visita/visita-v1-borrador"]'); await page.waitForSelector('[data-complete]');
      await page.click('[data-complete]'); await page.fill('.vc-sheet [data-q]', 'amayo'); await page.click('.vc-sheet [data-farm="7"]'); await page.click('.vc-sheet [data-lot="7|02"]');
      await page.waitForFunction(() => !document.querySelector('[data-complete]'), null, {timeout: 15000});
      const v = await db(page, s => s.get('visits', 'visita-v1-borrador'));
      assert.equal(v.producer.code, '7'); assert.deepEqual(v.lotKeys, ['7|02']); assert.ok(v.masterSnapshot?.records?.length); assert.equal(v.createdAt, NOW); assert.equal(v.revisions.at(-1).changed[0], 'producer');
    });
    if (version === 2) await check('1.2: después de migrar, un hallazgo de campo nuevo convive con los anteriores y no crea visitas', async () => {
      await page.evaluate(async () => (await import(new URL('js/model.js', location.href).href)).setManualTarget('7', '7|01'));
      await page.goto(V + '#/registrar?accion=hallazgo'); await ready(page); await page.click('[data-cat="malezas"]'); await page.waitForSelector('[data-f="observation"]');
      const st = await db(page, async s => ({v: (await s.all('visits')).length, f: (await s.all('findings')).map(f => [f.id, f.visitId])}));
      assert.equal(st.v, 1); assert.equal(st.f.length, 2); assert.ok(st.f.some(([, v]) => v === null));
      await page.goto(V + '#/productor/7?tab=cronologia'); await ready(page); await page.waitForSelector('.vc-timeline');
      assert.match(await page.locator('.vc-timeline').innerText(), /Hallazgo de campo · Malezas[\s\S]*Hallazgo · Plagas/);
    });
    await check(`${label}: sin errores de página`, async () => assert.deepEqual(errors, []));
    await ctx.close();
  }
  await browser.close();
  const pass = results.filter(r => r[0] === 'PASS').length;
  fs.writeFileSync(path.join(out, 'qa-visitas-migracion.json'), JSON.stringify({base, results}, null, 1));
  console.log(`${pass}/${results.length} ${pass === results.length ? 'PASS' : 'FAIL'}`); if (pass !== results.length) process.exitCode = 1;
})();
