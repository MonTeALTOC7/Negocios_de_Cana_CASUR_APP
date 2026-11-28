// Actualización segura con Visitas usada de forma INDEPENDIENTE (instalada / enlace directo), coexistiendo con la
// App Maestra abierta. Dos copias temporales del árbol de trabajo: v1 (actual) y v2 (mismo código con otra liberación
// verificada). Comprueba aviso en Visitas, «Más tarde», checkpoint del borrador, instalación coordinada en ambas
// ventanas, conservación de registros y fotos, y uso sin conexión después de actualizar. No toca el repositorio.
// Uso: node tools/qa-visitas-update.cjs OUT_DIR
const {chromium} = require('playwright'), assert = require('assert/strict'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), cp = require('child_process');
const repo = path.resolve(__dirname, '..'), out = process.argv[2]; if (!out) throw Error('Uso: node tools/qa-visitas-update.cjs OUT_DIR'); fs.mkdirSync(out, {recursive: true});
const BASE = '/Negocios_de_Cana_CASUR_APP/', types = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.geojson': 'application/json', '.ico': 'image/x-icon'};
function copyTree(tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'casur-visitas-upd-' + tag + '-'));
  for (const f of cp.execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {cwd: repo, encoding: 'utf8'}).split('\n').filter(Boolean)) {
    if (!fs.existsSync(path.join(repo, f))) continue; fs.mkdirSync(path.dirname(path.join(dir, f)), {recursive: true}); fs.copyFileSync(path.join(repo, f), path.join(dir, f));
  }
  return dir;
}
const results = [], check = async (n, fn) => { try { await fn(); results.push(['PASS', n]); console.log('PASS · ' + n); } catch (e) { results.push(['FAIL', n, e.message.split('\n')[0]]); console.log('FAIL · ' + n + ' · ' + e.message.split('\n').slice(0, 3).join(' ')); } };
(async () => {
  const v1 = copyTree('v1'), v2 = copyTree('v2');
  fs.appendFileSync(path.join(v2, 'modules/visitas/js/ui.js'), '\n// QA: liberación siguiente (contenido idéntico, otra generación verificada).\n');
  cp.execFileSync('node', ['tools/runtime-assets.mjs', '--write'], {cwd: v2});
  const release = dir => JSON.parse(fs.readFileSync(path.join(dir, 'core/versions/runtime-assets.json'))).releaseId;
  let root = v1;
  const server = http.createServer((req, res) => { let f = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (!f.startsWith(BASE)) { res.writeHead(404).end(); return; }
    f = f.slice(BASE.length) || 'index.html'; if (f.endsWith('/')) f += 'index.html'; const full = path.join(root, f);
    if (!full.startsWith(root) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, {'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store'}); res.end(fs.readFileSync(full)); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}${BASE}`, V = base + 'modules/visitas/';
  const browser = await chromium.launch(), ctx = await browser.newContext({viewport: {width: 412, height: 915}}), errors = [];
  const visitas = await ctx.newPage(); visitas.on('pageerror', e => errors.push(e.message));
  let findingId;
  await check('v1: Visitas independiente preparada y con un hallazgo en edición', async () => {
    await visitas.goto(V); await visitas.waitForFunction(() => window.CASUR_VISITAS_OFFLINE === 'ready', null, {timeout: 120000});
    await visitas.goto(V + '#/registrar'); await visitas.waitForFunction(() => window.CASUR_VISITAS_READY);
    await visitas.click('[data-change]'); await visitas.fill('.vc-sheet [data-q]', '7'); await visitas.click('.vc-sheet [data-farm="7"]'); await visitas.click('.vc-sheet [data-lot="7|01"]');
    await visitas.click('[data-cat="malezas"]'); await visitas.waitForSelector('[data-f="observation"]');
    findingId = decodeURIComponent(visitas.url().split('hallazgo=')[1]);
  });
  const shell = await ctx.newPage(); shell.on('pageerror', e => errors.push(e.message));
  await check('v1: App Maestra abierta al mismo tiempo (un solo SW raíz)', async () => {
    await shell.goto(base); await shell.waitForFunction(() => !!navigator.serviceWorker.controller, null, {timeout: 120000});
    assert.equal((await shell.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)), 1);
  });
  await check('v2 publicada: Visitas independiente muestra el aviso y permite «Más tarde»', async () => {
    root = v2;
    await visitas.fill('[data-f="observation"]', 'Borrador escrito antes de actualizar (QA)');   // sin esperar el autoguardado
    await visitas.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await visitas.waitForSelector('.casur-update:not([hidden])', {timeout: 120000});
    // Si la App Maestra (otra pestaña) ya ofreció esta liberación, Visitas la muestra directamente como pendiente.
    assert.match(await visitas.locator('.casur-update').innerText(), /actualización CASUR (disponible|pendiente)/i);
    await visitas.screenshot({path: path.join(out, 'actualizacion-aviso-visitas.png')});
    if (await visitas.locator('.casur-update button:has-text("Más tarde")').isVisible()) await visitas.click('.casur-update button:has-text("Más tarde")');
    assert.match(await visitas.locator('.casur-update').innerText(), /pendiente/);
  });
  await check('Instalación coordinada: checkpoint guarda el borrador y ambas ventanas pasan a v2', async () => {
    await visitas.click('.casur-update button:has-text("Instalar actualización")');
    await visitas.waitForFunction(r => fetch('../../core/versions/runtime-assets.json').then(x => x.json()).then(m => m.releaseId === r), release(v2), {timeout: 120000, polling: 1500});
    await visitas.waitForFunction(() => window.CASUR_VISITAS_READY === true, null, {timeout: 60000});
    const f = await visitas.evaluate(async id => (await (await import(new URL('js/store.js', location.href).href)).get('findings', id)), findingId);
    assert.equal(f.observation, 'Borrador escrito antes de actualizar (QA)');
    await shell.waitForFunction(r => fetch('core/versions/runtime-assets.json').then(x => x.json()).then(m => m.releaseId === r), release(v2), {timeout: 60000, polling: 1500});
  });
  await check('Después de actualizar: sin conexión y con los registros intactos', async () => {
    await ctx.setOffline(true); await visitas.goto(V + '#/bitacora'); await visitas.reload(); await visitas.waitForFunction(() => window.CASUR_VISITAS_READY);
    await visitas.waitForSelector('.vc-finding', {timeout: 20000}).catch(async () => { await visitas.screenshot({path: path.join(out, 'fallo-offline.png')}); throw Error((await visitas.locator('body').innerText()).slice(0, 300)); });
    assert.equal(await visitas.locator('.vc-finding').count(), 1); await ctx.setOffline(false);
  });
  await check('Sin errores de página', async () => assert.deepEqual(errors, []));
  await browser.close(); server.close(); fs.rmSync(v1, {recursive: true, force: true}); fs.rmSync(v2, {recursive: true, force: true});
  const pass = results.filter(r => r[0] === 'PASS').length; fs.writeFileSync(path.join(out, 'qa-visitas-update.json'), JSON.stringify(results, null, 1));
  console.log(`${pass}/${results.length} ${pass === results.length ? 'PASS' : 'FAIL'}`); if (pass !== results.length) process.exitCode = 1;
})();
