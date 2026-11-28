// PoC aislado (no forma parte del runtime publicado): coexistencia de una PWA anidada «Visitas de Campo» bajo el
// Service Worker raíz de la App Maestra. Trabaja sobre una COPIA temporal del árbol (git archive HEAD): no modifica el
// repositorio, ni versiones, ni runtime-assets.json, ni datos. Usa un servidor estático propio en 127.0.0.1.
//
// Variante A = SW actual sin cambios (solo se añade el módulo y su bundle al manifiesto de la copia).
// Variante B = la copia del SW prepara el bundle bajo demanda en una navegación directa con red (cambio candidato).
//
// Uso: node tools/poc/pwa-visitas-coexistencia.cjs [OUT_JSON]
const {chromium} = require('playwright'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const {execFileSync} = require('child_process');
const repo = path.resolve(__dirname, '..', '..'), outFile = process.argv[2];
const BASE_PATH = '/Negocios_de_Cana_CASUR_APP/';
const TYPES = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css',
  '.json':'application/json', '.webmanifest':'application/manifest+json', '.png':'image/png', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.ico':'image/x-icon', '.geojson':'application/json'};

function buildCopy(variant) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'casur-poc-visitas-' + variant + '-'));
  execFileSync('bash', ['-c', `git -C "${repo}" archive HEAD | tar -x -C "${dir}"`]);
  const v = path.join(dir, 'modules/visitas'); fs.mkdirSync(v, {recursive: true});
  fs.copyFileSync(path.join(dir, 'shared/assets/icons/icon-192.png'), path.join(v, 'icon-192.png'));
  fs.copyFileSync(path.join(dir, 'shared/assets/icons/icon-512.png'), path.join(v, 'icon-512.png'));
  fs.writeFileSync(path.join(v, 'manifest.webmanifest'), JSON.stringify({
    name: 'Visitas de Campo Productores de Caña', short_name: 'Visitas de Campo', id: './', start_url: './', scope: './',
    display: 'standalone', background_color: '#F6F8FA', theme_color: '#0F2A33', lang: 'es-NI',
    icons: [{src: 'icon-192.png', sizes: '192x192', type: 'image/png'}, {src: 'icon-512.png', sizes: '512x512', type: 'image/png'}]}, null, 1));
  fs.writeFileSync(path.join(v, 'index.html'), `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Visitas de Campo</title><link rel="manifest" href="manifest.webmanifest"></head><body><h1 id="ok">Visitas de Campo · PoC</h1>
<script type="module">
// Registra el MISMO SW raíz (scope ./ de la App Maestra) si la entrada es directa: nunca un SW propio.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('../../sw.js', {scope: '../../', updateViaCache: 'none'});
window.POC_VISITAS = {ready: true};
// Lectura compartida same-origin del almacén central (solo lectura; no crea la base si no existe).
indexedDB.databases?.().then(list => { window.POC_VISITAS.dbs = list.map(d => d.name); });
</script></body></html>`);
  // Bundle propio «visitas» con dependencias core+geo (copia temporal del generador; el repositorio no cambia).
  const gen = path.join(dir, 'tools/runtime-assets.mjs');
  fs.writeFileSync(gen, fs.readFileSync(gen, 'utf8').replace('labores|inventario)', 'labores|inventario|visitas)')
    .replace("conciliacion:['core'],", "conciliacion:['core'],visitas:['core','geo'],"));
  if (variant === 'B') {
    const sw = path.join(dir, 'sw.js'), src = fs.readFileSync(sw, 'utf8');
    const needle = "const saved=await verifiedBundleCache(manifest,id,false);";
    if (!src.includes(needle)) throw Error('PoC: punto de inserción del SW no encontrado');
    fs.writeFileSync(sw, src.replace(needle, "let saved=await verifiedBundleCache(manifest,id,false);\n  if(!saved&&event.request.mode==='navigate'&&id==='visitas'){try{await prepareVerifiedBundle(id,manifest.releaseId);saved=await verifiedBundleCache(manifest,id,false);}catch{}}"));
  }
  execFileSync('node', ['tools/runtime-assets.mjs', '--write'], {cwd: dir});
  return dir;
}

function serve(dir) {
  const server = http.createServer((req, res) => {
    let file = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!file.startsWith(BASE_PATH)) { res.writeHead(404).end(); return; }
    file = file.slice(BASE_PATH.length); if (!file || file.endsWith('/')) file += 'index.html';
    const full = path.join(dir, file);
    if (!full.startsWith(dir) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, {'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-store'}); res.end(fs.readFileSync(full));
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

(async () => {
  const report = {};
  const browser = await chromium.launch();
  for (const variant of ['A', 'B']) {
    const dir = buildCopy(variant), server = await serve(dir), base = `http://127.0.0.1:${server.address().port}${BASE_PATH}`;
    const r = report[variant] = {};
    const ctx = await browser.newContext({viewport: {width: 412, height: 900}}), page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
    const inspect = async () => {
      const m = await cdp.send('Page.getAppManifest').catch(e => ({errors: [e.message]}));
      const inst = await cdp.send('Page.getInstallabilityErrors').catch(e => ({installabilityErrors: [{errorId: e.message}]}));
      const parsed = (() => { try { return JSON.parse(m.data || '{}'); } catch { return {}; } })();
      return {manifestUrl: m.url, id: parsed.id, scope: parsed.scope, installabilityErrors: (inst.installabilityErrors || []).map(e => e.errorId),
        controlled: await page.evaluate(() => !!navigator.serviceWorker.controller), swScope: await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope || null)};
    };
    // 1) Entrada directa en perfil nuevo (enlace directo / instalación de Visitas sin haber abierto la App Maestra).
    let resp = await page.goto(base + 'modules/visitas/', {waitUntil: 'load'});
    r.directFirst = {status: resp.status(), rendered: await page.locator('#ok').count() === 1};
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {timeout: 60000}).catch(() => {});
    await page.waitForTimeout(1500);
    resp = await page.reload({waitUntil: 'load'});
    r.directReloadControlled = {status: resp.status(), rendered: await page.locator('#ok').count() === 1, text: (await page.evaluate(() => document.body.innerText)).slice(0, 120)};
    r.visitasInstall = await inspect();
    // 2) App Maestra: manifiesto raíz, sin cambios.
    await page.goto(base, {waitUntil: 'load'}); await page.waitForTimeout(1500);
    r.rootInstall = await inspect();
    // 3) Preparación del bundle desde el shell (lo que haría abrir Visitas desde Inicio con red).
    r.prepare = await page.evaluate(async () => {
      const manifest = await (await fetch('core/versions/runtime-assets.json')).json();
      return new Promise(res => { const ch = new MessageChannel(); ch.port1.onmessage = ({data}) => { if (data.type !== 'PROGRESS') res(data.type + (data.code ? ':' + data.code : '')); };
        navigator.serviceWorker.controller.postMessage({type: 'PREPARE_BUNDLE', bundleId: 'visitas', releaseId: manifest.releaseId}, [ch.port2]); setTimeout(() => res('timeout'), 60000); });
    });
    resp = await page.goto(base + 'modules/visitas/', {waitUntil: 'load'});
    r.directAfterPrepare = {status: resp.status(), rendered: await page.locator('#ok').count() === 1};
    // 4) Sin conexión: Visitas directa y App Maestra siguen abriendo desde la caché verificada.
    await ctx.setOffline(true);
    resp = await page.goto(base + 'modules/visitas/', {waitUntil: 'load'}).catch(e => ({status: () => e.message}));
    r.offlineVisitas = {status: resp.status(), rendered: await page.locator('#ok').count() === 1};
    resp = await page.goto(base, {waitUntil: 'load'}).catch(e => ({status: () => e.message}));
    r.offlineRoot = {status: resp.status(), shell: await page.locator('#appVersion').count() === 1};
    await ctx.setOffline(false);
    r.registrations = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(x => x.scope));
    await ctx.close(); server.close(); fs.rmSync(dir, {recursive: true, force: true});
  }
  await browser.close();
  const out = JSON.stringify(report, null, 1); console.log(out); if (outFile) fs.writeFileSync(outFile, out + '\n');
})().catch(e => { console.error(e); process.exit(1); });
