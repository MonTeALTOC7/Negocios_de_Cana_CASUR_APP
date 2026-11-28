// QA posterior a la publicación, contra la URL oficial de producción (GitHub Pages). Solo lectura: perfiles aislados.
// Verifica versión publicada (App, Producción, generación), Service Worker, apertura de todos los módulos públicos desde
// el shell sin errores, y reapertura sin conexión de los módulos que funcionan offline. PC (1536 px) y Android (Pixel 7).
// Uso: node tools/qa-produccion-publicada.cjs BASE OUT_DIR APP_VERSION RELEASE_ID DATA_VERSION
const {chromium, devices} = require('playwright'), assert = require('assert/strict'), fs = require('fs'), path = require('path');
const [base, out, appVersion, releaseId, dataVersion] = process.argv.slice(2);
if (!base || !out || !appVersion || !releaseId || !dataVersion) throw Error('Usage: node tools/qa-produccion-publicada.cjs BASE OUT_DIR APP_VERSION RELEASE_ID DATA_VERSION');
fs.mkdirSync(out, {recursive: true});
const MODULES = [['produccion', false], ['tch', false], ['riego', true], ['insumos', false], ['inventario', true], ['labores', false]];
const results = [], check = async (name, fn) => { try { await fn(); results.push(['PASS', name]); console.log('PASS · ' + name); } catch (e) { results.push(['FAIL', name, e.message.split('\n').slice(0, 3).join(' ')]); console.log('FAIL · ' + name + ' · ' + e.message.split('\n')[0]); } };
(async () => {
  const browser = await chromium.launch();
  for (const [device, opts] of [['pc', {viewport: {width: 1536, height: 1000}}], ['android', {...devices['Pixel 7']}]]) {
    const ctx = await browser.newContext(opts), page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push('page: ' + e.message)); page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
    const state = () => page.evaluate(() => { const f = document.querySelector('#mFrame'); return {hash: location.hash, src: f?.src, ready: f?.contentDocument?.readyState, kids: f?.contentDocument?.body?.children.length}; });
    const frame = async id => { try { await page.waitForFunction(m => { const f = document.querySelector('#mFrame'); return f && f.src.includes('/modules/' + m + '/') && f.contentDocument?.readyState === 'complete' && f.contentDocument.body?.children.length > 0; }, id, {timeout: 120000}); }
      catch (e) { throw Error('módulo ' + id + ' no abrió: ' + JSON.stringify(await state())); }
      // Como una persona: se espera a que el módulo registre su puente con el shell (checkpoint de salida) antes de seguir.
      const fr = page.frames().find(f => f.url().includes('/modules/' + id + '/')); await fr.waitForFunction(() => window.CASUR_MODULE_BRIDGE, null, {timeout: 20000}).catch(() => {}); await page.waitForTimeout(1500); return fr; };
    await check(`[${device}] Versión publicada: App ${appVersion}, release ${releaseId}, Service Worker activo`, async () => {
      await page.goto(base, {waitUntil: 'domcontentloaded'}); await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {timeout: 120000});
      await page.waitForFunction(v => document.getElementById('appVersion')?.textContent === 'v' + v, appVersion, {timeout: 60000});
      const r = await page.evaluate(async () => (await (await fetch('core/versions/runtime-assets.json', {cache: 'no-store'})).json()).releaseId); assert.equal(r, releaseId);
      await page.screenshot({path: path.join(out, device + '-inicio.png')});
    });
    for (const [id] of MODULES) await check(`[${device}] Módulo ${id}: abre desde el shell`, async () => {
      await page.goto(base + '#/modulo/' + id); const f = await frame(id);
      if (id === 'produccion') { await f.waitForFunction(() => window.CASUR_PRODUCTION_READY, null, {timeout: 120000});
        assert.equal(await f.evaluate(() => CRONO_DATA.meta.dataVersion), dataVersion); assert.match(await f.evaluate(() => document.body.innerText), /V1\.8\.3/);
        assert.equal(await f.evaluate(() => !!window.CASUR_VISUAL_EXPORT), true, 'exportadores'); }
      await page.screenshot({path: path.join(out, device + '-' + id + '.png')});
    });
    await check(`[${device}] Sin conexión: reapertura del shell y de los módulos locales`, async () => {
      await page.goto(base + '#/modulo/produccion'); await frame('produccion'); await page.waitForTimeout(4000);
      await ctx.setOffline(true);
      for (const [id, online] of MODULES) { if (online) continue; await page.goto(base + '#/modulo/' + id); const f = await frame(id); if (id === 'produccion') await f.waitForFunction(() => window.CASUR_PRODUCTION_READY, null, {timeout: 120000}); }
      await page.goto(base); await page.waitForFunction(v => document.getElementById('appVersion')?.textContent === 'v' + v, appVersion, {timeout: 60000});
      await page.screenshot({path: path.join(out, device + '-offline.png')}); await ctx.setOffline(false);
    });
    await check(`[${device}] Sin errores de página ni de consola`, async () => assert.deepEqual(errors.filter(e => !/net::ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e)), []));
    await ctx.close();
  }
  await browser.close();
  const pass = results.filter(r => r[0] === 'PASS').length; fs.writeFileSync(path.join(out, 'qa-produccion.json'), JSON.stringify({base, appVersion, releaseId, dataVersion, results}, null, 1));
  console.log(`${pass}/${results.length} ${pass === results.length ? 'PASS' : 'FAIL'}`); if (pass !== results.length) process.exitCode = 1;
})();
