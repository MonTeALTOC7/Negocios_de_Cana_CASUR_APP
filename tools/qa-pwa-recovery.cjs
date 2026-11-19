/* QA real de Issue #59 / V1.6.1 en Chromium (misma ingeniería de Service Workers que Brave).
   Uso: node tools/qa-pwa-recovery.cjs <directorio-salida> [--baseline-only]
   Escenarios (cada uno en un perfil aislado, servidor local en 127.0.0.1):
     A  Reproducción del incidente: 1.5.6 instalada, instantánea ausente, se publica 1.6.0 → 503 y el SW nuevo no instala.
     B  Misma situación con la candidata 1.6.1 → instala (waiting), activa al cerrar ventanas y conserva datos.
     C  Instalación nueva 1.6.1, manifiesto local perdido, con red → recuperación automática de la misma release.
     D  Manifiesto perdido y sin red → pantalla de recuperación usable; al volver la red, «Reparar» restaura.
     E  Servidor con otra release → manifiesto rechazado; «Re-registrar» reinicia solo el SW de este scope.
   Nunca borra CacheStorage, localStorage ni IndexedDB: los datos centinela se verifican al final de cada escenario. */
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process'), assert = require('assert/strict');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..'), out = path.resolve(process.argv[2] || 'qa-pwa-recovery-out'), baselineOnly = process.argv.includes('--baseline-only');
fs.mkdirSync(out, {recursive: true});
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.geojson': 'application/json'};
const trees = {};
function tree(name, ref) {
  if (ref === 'candidate') return (trees[name] = root);
  const dir = path.join(out, 'tree-' + name); fs.rmSync(dir, {recursive: true, force: true}); fs.mkdirSync(dir, {recursive: true});
  cp.execSync(`git archive ${ref} | tar -x -C ${JSON.stringify(dir)}`, {cwd: root, shell: '/bin/bash'});
  return (trees[name] = dir);
}
const state = {root: null, offline: false, manifest: null};
const server = http.createServer((req, res) => {
  try {
    if (state.offline) { res.destroy(); return; }
    let file = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (file === '/outside.html') { res.writeHead(200, {'Content-Type': 'text/html'}); res.end('<!doctype html><title>outside</title>'); return; }
    file = file.replace(/^\/app\//, '');
    if (!file || file.endsWith('/')) file += 'index.html';
    const full = path.join(state.root, file);
    if (file.includes('..') || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    let body = fs.readFileSync(full);
    if (file === 'core/versions/runtime-assets.json' && state.manifest) body = Buffer.from(JSON.stringify(state.manifest(JSON.parse(body))));
    res.writeHead(200, {'Content-Type': mime[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache'}); res.end(body);
  } catch (error) { res.writeHead(500); res.end(String(error)); }
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);
async function until(fn, label, timeout = 60000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = e.message; } await sleep(300); }
  throw new Error('Timeout: ' + label + ' (' + JSON.stringify(last) + ')');
}
const swState = (p, base) => p.evaluate(async scope => {
  const r = await navigator.serviceWorker.getRegistration(scope);
  return {active: r?.active?.state || null, waiting: r?.waiting?.state || null, installing: r?.installing?.state || null, controlled: !!navigator.serviceWorker.controller, caches: await caches.keys()};
}, base);
const plant = p => p.evaluate(async () => {
  localStorage.setItem('casur-qa-sentinel', 'borrador-tch-no-guardado');
  await new Promise((ok, no) => { const r = indexedDB.open('casur-qa-sentinel', 1); r.onupgradeneeded = () => r.result.createObjectStore('s'); r.onsuccess = () => { const t = r.result.transaction('s', 'readwrite'); t.objectStore('s').put('visita-123', 'k'); t.oncomplete = () => { r.result.close(); ok(); }; t.onerror = no; }; r.onerror = no; });
  await (await caches.open('estimador-tch-qa-sentinel')).put('/sentinel', new Response('cache-de-otro-modulo'));
});
const verifyData = p => p.evaluate(async () => {
  const idb = await new Promise((ok, no) => { const r = indexedDB.open('casur-qa-sentinel'); r.onsuccess = () => { const g = r.result.transaction('s').objectStore('s').get('k'); g.onsuccess = () => { r.result.close(); ok(g.result); }; }; r.onerror = no; });
  const c = await caches.open('estimador-tch-qa-sentinel');
  return {local: localStorage.getItem('casur-qa-sentinel'), idb, cache: await (await c.match('/sentinel'))?.text()};
});
const intact = {local: 'borrador-tch-no-guardado', idb: 'visita-123', cache: 'cache-de-otro-modulo'};
async function newProfile(browser, viewport = {width: 1536, height: 900}) {
  const ctx = await browser.newContext({viewport}), page = await ctx.newPage();
  page.on('pageerror', e => log('   [pageerror]', e.message.slice(0, 140)));
  page.on('dialog', d => d.accept());
  return {ctx, page};
}
async function bootInstalled(page, base) {
  await page.goto(base);
  await until(() => page.evaluate(() => !!navigator.serviceWorker.controller), 'SW controla la página', 90000).catch(async () => { await page.reload(); });
  await page.reload();
  await until(async () => (await swState(page, base)).controlled, 'cliente controlado', 60000);
  await until(() => page.locator('#appVersion').count(), 'shell visible', 60000);
  await sleep(1500);
}
const dropManifests = (p, version) => p.evaluate(async v => { await caches.delete('casur_master_release_manifests'); const c = await caches.open('casur_master_shell_v' + v); await c.delete(new URL('./core/versions/runtime-assets.json', location.href).href); }, version);

(async () => {
  tree('v156', '1f9fe9a'); tree('v160', '2b8bac5f91a5b6a8ae74ebaa049d221ab80f671b'); tree('candidate', 'candidate');
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}/app/`, outside = `http://127.0.0.1:${server.address().port}/outside.html`;
  const browser = await chromium.launch(), results = [];
  const record = (id, ok, note) => { results.push({id, ok, note}); log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${note}`); };
  try {
    // ---------------------------------------------------------------- A / B: upgrade desde 1.5.6 sin instantánea
    for (const [id, target, version] of [['A', 'v160', '1.6.0'], ['B', 'candidate', '1.6.1']]) {
      if (id === 'B' && baselineOnly) continue;
      log(`\n== Escenario ${id}: 1.5.6 instalada, instantánea ausente, se publica ${version} ==`);
      state.root = trees.v156; state.manifest = null; state.offline = false;
      const {ctx, page} = await newProfile(browser); const diag = [];
      ctx.on('serviceworker', w => w.on('console', m => diag.push(m.text())));
      await bootInstalled(page, base); await plant(page);
      await dropManifests(page, '1.5.6'); await page.evaluate(() => caches.delete('casur_master_shell_v1.5.6'));
      state.root = trees[target];
      const response = await page.goto(base, {waitUntil: 'commit'});
      const body = (await page.content()).replace(/<[^>]+>/g, '').trim().slice(0, 80);
      log(`   navegación con la instantánea ausente: HTTP ${response.status()} · «${body}»`);
      if (id === 'A') {
        assert.equal(response.status(), 503); assert.match(body, /Versión instalada no disponible/);
        await sleep(24000);
        const st = await swState(page, base);
        record('A', st.waiting === null && st.active === 'activated', `1.6.0 NO llega a waiting tras 24 s (${JSON.stringify({waiting: st.waiting, installing: st.installing})}); la navegación sigue en 503 de texto plano`);
        await page.screenshot({path: path.join(out, 'A-incidente-503.png')});
      } else {
        const waiting = await until(async () => (await swState(page, base)).waiting, '1.6.1 en waiting', 70000);
        record('B1', waiting === 'installed', 'el worker 1.6.1 se instala y queda en espera aunque falte la instantánea 1.5.6 (antes: bloqueado)');
        // cerrar todas las ventanas de la app → el worker en espera se activa; datos intactos
        await page.close(); const probe = await ctx.newPage(); await probe.goto(outside);
        await until(async () => (await probe.evaluate(async s => (await navigator.serviceWorker.getRegistration(s))?.active?.scriptURL ? (await navigator.serviceWorker.getRegistration(s)).waiting === null : false, base)), '1.6.1 activo', 40000);
        const home = await ctx.newPage(); const r2 = await home.goto(base);
        await until(() => home.locator('#appVersion').textContent().then(t => /1\.6\.1/.test(t)), 'shell 1.6.1', 60000);
        record('B2', r2.status() === 200, `tras cerrar ventanas la app abre en ${await home.locator('#appVersion').textContent()} (HTTP ${r2.status()})`);
        const data = await verifyData(home); assert.deepEqual(data, intact);
        record('B3', true, 'localStorage, IndexedDB y caché de otro módulo conservados: ' + JSON.stringify(data));
        await home.screenshot({path: path.join(out, 'B-actualizada-1536.png')});
      }
      log('   consola SW:', diag.filter(Boolean).slice(0, 3));
      await ctx.close();
    }
    if (baselineOnly) { log('\n(solo línea base)'); }
    else {
      // ---------------------------------------------------------------- C: manifiesto perdido, con red
      log('\n== Escenario C: 1.6.1 instalada, manifiesto local perdido, con red ==');
      state.root = trees.candidate; state.manifest = null; state.offline = false;
      let {ctx, page} = await newProfile(browser); await bootInstalled(page, base); await plant(page);
      const cachesBefore = (await swState(page, base)).caches;
      await dropManifests(page, '1.6.1');
      const rc = await page.goto(base);
      await until(() => page.locator('#appVersion').textContent().then(t => /1\.6\.1/.test(t)), 'shell recuperado', 60000);
      const restored = await page.evaluate(async () => !!(await (await caches.open('casur_master_release_manifests')).keys()).length);
      record('C', rc.status() === 200 && restored, `recuperación automática de la misma release: HTTP ${rc.status()}, manifiesto restaurado=${restored}`);
      const afterC = (await swState(page, base)).caches; assert.ok(cachesBefore.every(n => afterC.includes(n)), 'ninguna caché desapareció');
      assert.deepEqual(await verifyData(page), intact);
      await ctx.close();

      // ---------------------------------------------------------------- D: sin red → pantalla usable → reparar
      log('\n== Escenario D: manifiesto perdido y sin red ==');
      ({ctx, page} = await newProfile(browser)); await bootInstalled(page, base); await plant(page); await dropManifests(page, '1.6.1');
      state.offline = true;
      const rd = await page.goto(base, {waitUntil: 'commit'});
      await page.locator('#repair').waitFor({timeout: 20000});
      const title = await page.locator('h1').textContent();
      record('D1', rd.status() === 503 && /no está disponible/.test(title), `sin red: pantalla de recuperación (HTTP ${rd.status()}) «${title}», sin 503 de texto plano`);
      await page.screenshot({path: path.join(out, 'D-recuperacion-1536.png')});
      await page.setViewportSize({width: 390, height: 844}); await page.screenshot({path: path.join(out, 'D-recuperacion-390.png')}); await page.setViewportSize({width: 1536, height: 900});
      await page.locator('#repair').click(); await sleep(1500);
      const msg = await page.locator('#status').textContent();
      record('D2', /conexión/.test(msg), `«Reparar» sin red informa sin cambiar nada: «${msg}»`);
      await page.locator('#retry').click(); await page.locator('#repair').waitFor({timeout: 20000});
      record('D3', true, '«Reintentar» sin red recarga una sola vez y vuelve a la pantalla de recuperación (sin bucle)');
      state.offline = false;
      await page.locator('#repair').click();
      await until(() => page.locator('#appVersion').textContent().then(t => /1\.6\.1/.test(t)), 'reparada', 60000);
      record('D4', true, '«Reparar esta versión» con red restaura la release verificada y abre la app');
      assert.deepEqual(await verifyData(page), intact); await ctx.close();

      // ---------------------------------------------------------------- E: otra release en el servidor + re-registrar
      log('\n== Escenario E: servidor con otra release y re-registro voluntario ==');
      ({ctx, page} = await newProfile(browser)); await bootInstalled(page, base); await plant(page);
      const namesBefore = (await swState(page, base)).caches; await dropManifests(page, '1.6.1');
      state.manifest = m => ({...m, releaseId: '1.6.1-ffffffffffffffff'});
      const re = await page.goto(base, {waitUntil: 'commit'}); await page.locator('#repair').waitFor({timeout: 20000});
      const text = await page.locator('main p').first().textContent();
      record('E1', re.status() === 503 && /otra versión/.test(text), `manifiesto de otra release rechazado: «${text}»`);
      await page.locator('#repair').click(); await sleep(2500);
      record('E2', /otra versión/.test(await page.locator('#status').textContent()), 'la reparación voluntaria también rechaza otra release');
      state.manifest = null; // el servidor vuelve a servir la release correcta
      await page.locator('#reregister').click(); await sleep(1500);
      const unreg = await page.locator('#status').textContent();
      record('E3', /Cerrá todas las ventanas/.test(unreg), `«Re-registrar» da de baja solo el registro de este scope y pide cerrar ventanas: «${unreg.slice(0, 60)}…»`);
      await page.close();
      const probe = await ctx.newPage(); await probe.goto(outside);
      await until(() => probe.evaluate(async s => (await navigator.serviceWorker.getRegistration(s)) === undefined, base), 'registro retirado al cerrar ventanas', 40000);
      const fresh = await ctx.newPage(); await fresh.goto(base);
      await until(() => fresh.locator('#appVersion').textContent().then(t => /1\.6\.1/.test(t)), 'app tras re-registrar', 90000);
      const st = await until(async () => { const s = await swState(fresh, base); return s.active === 'activated' && s.controlled ? s : null; }, 'SW registrado de nuevo', 90000);
      record('E4', namesBefore.every(n => st.caches.includes(n)), 'tras reabrir con conexión el SW se registra de nuevo; todas las cachés previas siguen y la app abre en 1.6.1');
      assert.deepEqual(await verifyData(fresh), intact);
      await fresh.screenshot({path: path.join(out, 'E-reregistrada-1536.png')});
      await ctx.close();
    }
  } finally { await browser.close(); server.close(); }
  fs.writeFileSync(path.join(out, 'resultados.json'), JSON.stringify(results, null, 2));
  const failed = results.filter(r => !r.ok); log(`\n${results.length - failed.length}/${results.length} comprobaciones superadas`); process.exitCode = failed.length ? 1 : 0;
})().catch(error => { console.error('QA ERROR:', error); process.exit(1); });
