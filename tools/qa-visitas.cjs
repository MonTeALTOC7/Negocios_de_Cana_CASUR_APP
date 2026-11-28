// QA Visitas de Campo 1.1 (rediseño). Perfiles aislados; visitas, textos y fotos SINTÉTICOS.
// Escenarios de aceptación 1–7 + GPS (preciso, impreciso, fuera, permiso denegado, conflicto con selección manual,
// cambio de suerte), fotos (GPS antes de abrir la cámara, EXIF, galería sin EXIF), etiquetado y tarjeta, autoguardado
// con fallo de escritura, concurrencia entre pestañas, respaldo/restauración (multiparte, incompleto, corrupción,
// conflicto de contenido), acceso directo, App Maestra, offline y capturas responsive.
// Uso: node tools/qa-visitas.cjs BASE_URL OUT_DIR
const {chromium} = require('playwright'), assert = require('assert/strict'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const [base, out] = process.argv.slice(2);
if (!base || !out) throw Error('Uso: node tools/qa-visitas.cjs BASE_URL OUT_DIR');
fs.mkdirSync(out, {recursive: true});
const V = base + 'modules/visitas/';
const results = [];
let PAGE = null;
const check = async (name, fn) => { try { if (PAGE) await closeOverlays(PAGE).catch(() => {}); await fn(); results.push(['PASS', name]); console.log('PASS · ' + name); }
  catch (e) { results.push(['FAIL', name, e.message.split('\n').slice(0, 4).join(' ')]); console.log('FAIL · ' + name + ' · ' + e.message.split('\n').slice(0, 4).join(' ')); } };
const repo = path.resolve(__dirname, '..'), geo = JSON.parse(fs.readFileSync(path.join(repo, 'shared/geo/data/manifest.json'), 'utf8'));
const anchor = lot => { const z = JSON.parse(fs.readFileSync(path.join(repo, 'shared/geo/data', geo.zones[geo.lotIndex[lot]].file), 'utf8')); return z.features.find(f => f.properties.lotId === lot).properties.anchor; };
const A701 = anchor('701'), A703 = anchor('703'), A24201 = anchor('24201');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

/* EXIF sintético (fecha y GPS) insertado tras SOI. */
function exifApp1({lat, lon, err, date}) {
  const entries0 = [[0x0132, 2, 20, Buffer.from(date + '\0', 'ascii')], [0x8825, 4, 1, null]];
  const dms = v => { const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = Math.round(((a - d) * 60 - m) * 60 * 10000); return [[d, 1], [m, 1], [s, 10000]]; };
  const gpsE = [[1, 2, 2, Buffer.from((lat < 0 ? 'S' : 'N') + '\0')], [2, 5, 3, dms(lat)], [3, 2, 2, Buffer.from((lon < 0 ? 'W' : 'E') + '\0')], [4, 5, 3, dms(lon)], [31, 5, 1, [[err, 1]]]];
  const ifdSize = n => 2 + n * 12 + 4, gpsAt = 8 + ifdSize(entries0.length), data = []; let off = gpsAt + ifdSize(gpsE.length);
  const put = b => { const at = off; data.push(b); off += b.length; return at; };
  const rat = l => { const b = Buffer.alloc(l.length * 8); l.forEach(([n, d], i) => { b.writeUInt32LE(n, i * 8); b.writeUInt32LE(d, i * 8 + 4); }); return b; };
  const ifd = es => { const b = Buffer.alloc(ifdSize(es.length)); b.writeUInt16LE(es.length, 0); es.forEach(([tag, type, count, v], i) => { const e = 2 + i * 12; b.writeUInt16LE(tag, e); b.writeUInt16LE(type, e + 2); b.writeUInt32LE(count, e + 4);
    if (tag === 0x8825) b.writeUInt32LE(gpsAt, e + 8); else if (type === 5) b.writeUInt32LE(put(rat(v)), e + 8); else if (v.length <= 4) v.copy(b, e + 8); else b.writeUInt32LE(put(v), e + 8); }); return b; };
  const i0 = ifd(entries0), ig = ifd(gpsE), tiff = Buffer.concat([Buffer.from([0x49, 0x49, 0x2A, 0, 8, 0, 0, 0]), i0, ig, ...data]);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]), seg = Buffer.alloc(4); seg.writeUInt16BE(0xFFE1, 0); seg.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([seg, body]);
}
const mobile = extra => ({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, deviceScaleFactor: 2, acceptDownloads: true, ...extra});
const shot = (p, name, full = false) => p.screenshot({path: path.join(out, name + '.png'), fullPage: full});
const ready = p => p.waitForFunction(() => window.CASUR_VISITAS_READY === true, null, {timeout: 120000});
const db = (p, fn, arg) => p.evaluate(async ([src, a]) => { const s = await import(new URL('js/store.js', location.href).href); return (0, eval)(src)(s, a); }, [fn.toString(), arg]);
async function walk(ctx, page, pts, acc = 5) { for (const [lon, lat] of pts) { await ctx.setGeolocation({latitude: lat, longitude: lon, accuracy: acc}); await page.waitForTimeout(450); } }
const jitter = ([lon, lat], n = 4) => Array.from({length: n}, (_, i) => [lon + i * 0.000004, lat + i * 0.000003]);
const closeOverlays = p => p.evaluate(() => { document.querySelectorAll('.vc-sheet,.vc-lightbox').forEach(n => n.remove()); document.body.classList.remove('vc-locked'); window.__VISITAS_FAIL_WRITES__ = false; });
const noOverflow = async p => { const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); assert.ok(o <= 1, 'desborde horizontal de ' + o + ' px'); };

(async () => {
  const browser = await chromium.launch();
  const scratch = await browser.newPage();
  const synth = async (type, color, w, h, text) => Buffer.from(await scratch.evaluate(async ([type, color, w, h, text]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, color); gr.addColorStop(1, '#0F2A33');
    g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.85)'; g.font = `bold ${Math.round(h / 10)}px sans-serif`; g.fillText(text, w * .08, h * .45);
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(120,200,120,${.2 + (i % 5) / 10})`; g.lineWidth = 6; g.beginPath(); g.moveTo(i * w / 40, h); g.lineTo(i * w / 40 + 30, h * .55); g.stroke(); }
    const blob = await new Promise(r => c.toBlob(r, type, 0.9)); return [...new Uint8Array(await blob.arrayBuffer())];
  }, [type, color, w, h, text]));
  const jpeg = await synth('image/jpeg', '#3E8E5A', 1600, 1200, 'Foto sintética QA'), jpegV = await synth('image/jpeg', '#7FA650', 1000, 1400, 'Vertical QA');
  const withExif = Buffer.concat([jpeg.subarray(0, 2), exifApp1({lat: A703[1], lon: A703[0], err: 3, date: '2026:11:28 09:15:00'}), jpeg.subarray(2)]);
  const png = await synth('image/png', '#5B7F3A', 900, 700, 'Galería sin EXIF');
  fs.writeFileSync(path.join(out, 'foto-exif.jpg'), withExif); fs.writeFileSync(path.join(out, 'foto-galeria.png'), png); fs.writeFileSync(path.join(out, 'foto-camara.jpg'), jpegV);
  await scratch.close();

  const ctx = await browser.newContext(mobile({geolocation: {latitude: A701[1], longitude: A701[0], accuracy: 5}, permissions: ['geolocation']}));
  const page = await ctx.newPage(), errors = []; PAGE = page;
  page.on('pageerror', e => errors.push(String(e?.message ?? e)));
  let findingId, visitId;

  await check('Acceso directo, SW raíz, bundle y datos listos sin conexión', async () => {
    assert.equal((await page.goto(V)).status(), 200); await ready(page);
    await page.waitForFunction(() => window.CASUR_VISITAS_OFFLINE === 'ready', null, {timeout: 120000});
    assert.equal((await page.reload()).status(), 200); await ready(page);
    const regs = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(r => new URL(r.scope).pathname));
    assert.deepEqual(regs, [new URL(base).pathname]);
    const cdp = await ctx.newCDPSession(page), m = await cdp.send('Page.getAppManifest');
    assert.match(m.url, /modules\/visitas\/manifest\.webmanifest$/); assert.deepEqual((await cdp.send('Page.getInstallabilityErrors')).installabilityErrors, []);
  });
  await check('Escenario 1 · GPS preciso: detección estable de finca y suerte sin elegir productor', async () => {
    await walk(ctx, page, jitter(A701, 5));
    await page.waitForFunction(() => document.querySelector('#gpsChip')?.dataset.s === 'confiable', null, {timeout: 30000});
    await page.waitForFunction(() => /Suerte 01/.test(document.querySelector('[data-here]')?.innerText || ''), null, {timeout: 15000});
    const here = await page.locator('[data-here]').innerText();
    assert.match(here, /Amayo/); assert.match(here, /Detectada por GPS/); assert.match(here, /variedad/i); assert.match(here, /probable por edad/);
    assert.match(await page.locator('#gpsChip').innerText(), /Amayo · 01/);
    await noOverflow(page); await shot(page, '01-inicio-gps');
  });
  await check('Escenario 1 · Registro rápido de un toque, foto con GPS asociado y observación breve', async () => {
    await page.click('a.vc-fab'); await page.waitForSelector('[data-cat="malezas"]');
    assert.match(await page.locator('[data-target]').innerText(), /Suerte 01[\s\S]*Detectada por GPS/);
    await shot(page, '02-registrar');
    await page.click('[data-cat="malezas"]'); await page.waitForSelector('[data-f="observation"]');
    assert.match(await page.locator('#toast').innerText(), /Malezas registrado en suerte 01/);
    findingId = decodeURIComponent(page.url().split('hallazgo=')[1]);
    const f = await db(page, (s, id) => s.get('findings', id), findingId);
    assert.equal(f.lotKey, '7|01'); assert.equal(f.gps.source, 'device'); assert.equal(f.severity, null); assert.deepEqual(f.details, {});
    visitId = f.visitId;
    await page.fill('[data-f="observation"]', 'Coquillo en la cabecera norte (QA sintética).');
    await page.locator('[data-capture]').dispatchEvent('pointerdown');
    await page.setInputFiles('[data-camera]', {name: 'IMG_camara.jpg', mimeType: 'image/jpeg', buffer: jpegV});
    await page.waitForFunction(() => document.querySelectorAll('.vc-ph img').length === 1, null, {timeout: 20000});
    await page.waitForTimeout(1500);
    const ph = await db(page, (s, id) => s.byIndex('photos', 'findingId' in {} ? 'x' : 'visitId', null).catch(() => null) || s.all('photos'), null);
    const cam = ph.find(p => p.originalName === 'IMG_camara.jpg');
    assert.equal(cam.sha256, sha(jpegV)); assert.equal(cam.size, jpegV.length); assert.ok(['device-before', 'device-after'].includes(cam.location.source)); assert.equal(cam.findingId, findingId);
    await page.waitForFunction(() => /Guardado/.test(document.querySelector('[data-saved]')?.innerText || ''), null, {timeout: 10000});
    await shot(page, '03-registro-rapido');
  });
  await check('Escenario 3 · Detalles técnicos opcionales: solo lo conocido, sin bloquear', async () => {
    await page.locator('details.vc-details summary').click();
    await page.check('input[data-detail="distribucion"][value="Parches"]', {force: true});
    await page.check('input[data-sev][value="Media"]', {force: true});
    await page.fill('[data-rec]', 'Aplicar control químico dirigido en la cabecera norte.'); await page.click('[data-add-rec]');
    await page.waitForTimeout(1200);
    const f = await db(page, (s, id) => s.get('findings', id), findingId);
    assert.deepEqual(f.details, {distribucion: 'Parches'}); assert.equal(f.severity.value, 'Media'); assert.equal(f.severity.source, 'tecnico');
    const fus = await db(page, (s, id) => s.all('followups').then(l => l.filter(x => x.findingId === id)), findingId);
    assert.equal(fus.length, 1); assert.equal(fus[0].state, 'Pendiente');
    await page.locator('details.vc-details').scrollIntoViewIfNeeded(); await shot(page, '04-detalles-tecnicos');
    await page.click('text=Listo'); await page.waitForURL(/#\/hallazgo\//); await page.waitForSelector('[data-card-img]');
  });
  await check('Fotos: EXIF propio (cámara) y galería sin EXIF sin ubicación del teléfono', async () => {
    await page.setInputFiles('[data-gallery]', [path.join(out, 'foto-exif.jpg'), path.join(out, 'foto-galeria.png')]);
    await page.waitForFunction(() => document.querySelectorAll('.vc-ph img').length >= 3, null, {timeout: 40000}).catch(async e => { throw Error('fotos en vista: ' + await page.locator('.vc-ph').count() + ' · ' + e.message); });
    const ph = await db(page, s => s.all('photos'));
    const ex = ph.find(p => p.originalName === 'foto-exif.jpg'), gal = ph.find(p => p.originalName === 'foto-galeria.png');
    assert.equal(ex.location.source, 'exif'); assert.equal(ex.location.accuracy, 3); assert.equal(ex.takenAt, '2026-11-28T09:15:00'); assert.equal(ex.sha256, sha(withExif));
    assert.equal(gal.location.source, 'none', 'una foto de galería no recibe la ubicación actual del teléfono');
    await shot(page, '05-hallazgo', true);
  });
  await check('Galería profesional, foto etiquetada y tarjeta de hallazgo (descargas y muestras)', async () => {
    await page.click('.vc-ph >> nth=0'); await page.waitForSelector('.vc-lightbox img');
    await shot(page, '06-visor-original');
    await page.click('[data-mode="etiquetada"]'); await page.waitForFunction(() => document.querySelector('.vc-lightbox img')?.src.startsWith('blob:') && document.querySelector('[data-mode="etiquetada"]')?.getAttribute('aria-pressed') === 'true', null, {timeout: 20000});
    await page.waitForTimeout(500); await shot(page, '07-visor-etiquetada');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-a="download"]')]);
    await dl.saveAs(path.join(out, 'muestra-foto-etiquetada-vertical.jpg'));
    await page.click('[data-a="next"]'); await page.waitForTimeout(400); await page.click('[data-mode="etiquetada"]'); await page.waitForTimeout(1500);
    const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('[data-a="download"]')]); await dl2.saveAs(path.join(out, 'muestra-foto-etiquetada-horizontal.jpg'));
    await page.click('[data-a="close"]');
    await page.click('[data-card-img]'); await page.waitForSelector('.vc-sheet img', {timeout: 30000});
    const [dl3] = await Promise.all([page.waitForEvent('download'), page.click('[data-dl]')]); await dl3.saveAs(path.join(out, 'muestra-tarjeta-hallazgo.png'));
    await shot(page, '08-tarjeta-preview'); await page.click('.vc-sheet [data-close] >> nth=1');
    const size = fs.statSync(path.join(out, 'muestra-tarjeta-hallazgo.png')).size; assert.ok(size > 50000);
  });
  await check('GPS impreciso y fuera de suerte: no se confirma ni se cambia el destino', async () => {
    await page.goto(V + '#/inicio'); await ready(page);
    await walk(ctx, page, jitter(A703, 4), 80);
    await page.waitForFunction(() => document.querySelector('#gpsChip')?.dataset.s === 'aproximada', null, {timeout: 15000});
    await walk(ctx, page, jitter([A701[0] + 0.02, A701[1] + 0.02], 4), 5);
    await page.waitForFunction(() => ['fuera', 'aproximada'].includes(document.querySelector('#gpsChip')?.dataset.s), null, {timeout: 15000});
    assert.match(await page.locator('[data-here]').innerText(), /¿Dónde estás\?/);
  });
  await check('Selección manual con prioridad; conflicto GPS informado sin bloquear; cambio de suerte sin alterar registros previos', async () => {
    await page.click('[data-here] [data-choose]'); await page.fill('.vc-sheet [data-q]', '7'); await page.click('.vc-sheet [data-farm="7"]'); await page.click('.vc-sheet [data-lot="7|02"]');
    await walk(ctx, page, jitter(A703, 5), 5);
    await page.waitForFunction(() => /GPS indica la suerte 03/.test(document.querySelector('[data-here]')?.innerText || ''), null, {timeout: 20000})
      .catch(async e => { throw Error(`${await page.locator('#gpsChip').innerText()} | ${(await page.locator('[data-here]').innerText()).slice(0, 160)} | ${e.message}`); });
    assert.match(await page.locator('[data-here]').innerText(), /Suerte 02[\s\S]*Elegida manualmente/);
    await shot(page, '09-conflicto-manual-gps');
    await page.click('a.vc-fab'); await page.waitForSelector('[data-cat="plagas"]'); await page.click('[data-cat="plagas"]'); await page.waitForSelector('[data-f="observation"]');
    const f2 = await db(page, s => s.all('findings').then(l => l.find(x => x.category === 'plagas')));
    assert.equal(f2.lotKey, '7|02'); assert.equal(f2.visitId, visitId, 'misma visita del día');
    const v = await db(page, (s, id) => s.get('visits', id), visitId); assert.deepEqual(v.lotKeys.sort(), ['7|01', '7|02']);
    const f1 = await db(page, (s, id) => s.get('findings', id), findingId); assert.equal(f1.lotKey, '7|01');
    await page.goto(V + '#/inicio'); await ready(page); await page.click('[data-here] [data-clear]');   // el técnico suelta la selección manual
    await walk(ctx, page, jitter(A703, 5), 5);
    await page.waitForFunction(() => /Suerte 03/.test(document.querySelector('[data-here]')?.innerText || ''), null, {timeout: 20000});
  });
  await check('Bitácora: búsqueda, filtros y deshacer captura accidental', async () => {
    await page.click('a.vc-fab'); await page.waitForSelector('[data-cat="riego"]'); await page.click('[data-cat="riego"]'); await page.waitForSelector('#toast:not([hidden])');
    await page.click('#toast button:has-text("Deshacer")'); await page.waitForURL(/#\/inicio/);
    await page.goto(V + '#/bitacora'); await ready(page); await page.waitForSelector('.vc-finding');
    assert.equal(await page.locator('.vc-finding').count(), 2, 'el registro deshecho no aparece');
    await page.fill('[data-q]', 'coquillo'); await page.waitForTimeout(300); assert.equal(await page.locator('.vc-finding').count(), 1);
    await page.fill('[data-q]', ''); await page.selectOption('[data-cat]', 'plagas'); await page.waitForTimeout(300); assert.equal(await page.locator('.vc-finding').count(), 1);
    await page.selectOption('[data-cat]', ''); await noOverflow(page); await shot(page, '10-bitacora');
  });
  await check('Mapa operativo: finca, suertes, ubicación y ficha de suerte', async () => {
    await page.goto(V + '#/mapa?finca=7'); await ready(page);
    await page.waitForFunction(() => document.querySelectorAll('#vcMap .leaflet-interactive').length > 10, null, {timeout: 60000}); await page.waitForTimeout(1500);
    await page.evaluate(() => document.querySelector('#vcMap').__casurMap); await shot(page, '11-mapa');
    await page.goto(V + '#/mapa?finca=7&suerte=' + encodeURIComponent('7|03')); await ready(page); await page.waitForSelector('[data-card]:not([hidden])', {timeout: 30000});
    assert.match(await page.locator('[data-card]').innerText(), /Suerte 03[\s\S]*Registrar aquí/); await page.waitForTimeout(800); await shot(page, '12-mapa-ficha');
  });
  await check('Escenario 2 · Visita manual desde oficina, retrospectiva y de varias suertes, sin GPS', async () => {
    const c2 = await browser.newContext(mobile({permissions: []})); const p2 = await c2.newPage(); p2.on('pageerror', e => errors.push(String(e?.message ?? e)));
    await p2.goto(V + '#/nueva'); await ready(p2);
    await p2.click('[data-change]'); await p2.fill('.vc-sheet [data-q]', 'Amayo'); await p2.click('.vc-sheet [data-farm="7"]'); await p2.click('.vc-sheet [data-lot="7|01"]');
    await p2.check('[data-lot][value="7|04"]', {force: true});
    await p2.fill('[data-when]', '2026-11-20T08:30'); await shot(p2, '13-nueva-visita-manual');
    await p2.click('[data-create]'); await p2.waitForURL(/#\/visita\//);
    const v = await db(p2, s => s.all('visits').then(l => l[0]));
    assert.equal(v.startedAt.slice(0, 10), '2026-11-20'); assert.deepEqual(v.lotKeys.sort(), ['7|01', '7|04']); assert.equal(v.deviceStart, null);
    await p2.click('a:has-text("Recomendación")'); await p2.fill('[data-text]', 'Programar resiembra en fallas de la suerte 04.'); await p2.click('[data-save]'); await p2.waitForURL(/#\/seguimiento\//);
    await c2.close();
  });
  await check('Escenario 7 · Sin permiso de ubicación: registro rápido igual funciona', async () => {
    const c3 = await browser.newContext(mobile({permissions: []})); const p3 = await c3.newPage(); p3.on('pageerror', e => errors.push(String(e?.message ?? e)));
    await p3.goto(V + '#/registrar'); await ready(p3);
    await p3.click('[data-change]'); await p3.fill('.vc-sheet [data-q]', '242'); await p3.click('.vc-sheet [data-farm="242"]'); await p3.click('.vc-sheet [data-lot=""]');
    await p3.click('[data-cat="seguimiento"]'); await p3.waitForSelector('[data-f="observation"]');
    const f = await db(p3, s => s.all('findings').then(l => l[0])); assert.equal(f.gps.source, 'none'); assert.equal(f.lotKey, null);
    await c3.close();
  });
  await check('Escenario 5 · Seguimiento: estado, nota, evidencia y visita vinculada', async () => {
    await page.goto(V + '#/seguimiento'); await ready(page); await page.click('.vc-list .vc-item >> nth=0'); await page.waitForSelector('[data-apply]');
    await page.selectOption('[data-state]', 'En gestión'); await page.fill('[data-note]', 'Coordinado con el productor (QA)');
    await page.setInputFiles('[data-gal] [data-gallery]', path.join(out, 'foto-galeria.png')); await page.waitForTimeout(1500);
    await page.click('[data-apply]'); await page.waitForTimeout(800);
    const f = await db(page, s => s.all('followups').then(l => l.find(x => x.state === 'En gestión')));
    assert.ok(f); assert.equal(f.history.at(-1).note, 'Coordinado con el productor (QA)');
    const ev = await db(page, (s, id) => s.all('photos').then(l => l.filter(p => p.followupId === id)), f.id); assert.equal(ev.length, 1); assert.equal(ev[0].role, 'seguimiento');
    await page.waitForTimeout(600); await shot(page, '14-seguimiento', true);
  });
  await check('Expediente del productor e informes (visita, expediente, consolidado) + Excel y GeoJSON', async () => {
    await page.goto(V + '#/productor/7'); await ready(page); await page.waitForSelector('text=Problemas recurrentes', {state: 'attached'}).catch(() => {});
    assert.match(await page.locator('main').innerText(), /Amayo[\s\S]*Suertes[\s\S]*Historial de visitas/); await shot(page, '15-expediente', true);
    await page.goto(V + '#/informe/visita/' + visitId); await ready(page); await page.waitForSelector('.vc-report svg');
    const txt = await page.locator('.vc-report').innerText(); fs.writeFileSync(path.join(out, 'informe-visita.txt'), txt); assert.match(txt, /Informe de visita[\s\S]*Negocios de Caña · CASUR[\s\S]*Hallazgos[\s\S]*Malezas/i); assert.doesNotMatch(txt, /undefined|NaN|null/);
    await shot(page, '16-informe-visita', true);
    await page.pdf?.({path: path.join(out, 'muestra-informe-visita.pdf'), format: 'A4', printBackground: true}).catch(() => {});
    await page.goto(V + '#/informes'); await ready(page);
    const [x] = await Promise.all([page.waitForEvent('download'), page.click('[data-xlsx]')]); await x.saveAs(path.join(out, 'muestra-visitas.xlsx'));
    const [g] = await Promise.all([page.waitForEvent('download'), page.click('[data-geo]')]); await g.saveAs(path.join(out, 'muestra-ubicaciones.geojson'));
    const gj = JSON.parse(fs.readFileSync(path.join(out, 'muestra-ubicaciones.geojson'), 'utf8')); assert.ok(gj.features.some(f => f.properties.tipo === 'foto' && f.properties.origen_ubicacion === 'exif'));
    assert.ok(fs.readFileSync(path.join(out, 'muestra-visitas.xlsx')).subarray(0, 2).toString() === 'PK');
  });
  await check('Autoguardado: fallo de escritura conservado como copia de emergencia y recuperado', async () => {
    await page.goto(V + '#/registrar?hallazgo=' + findingId); await ready(page); await page.waitForSelector('[data-f="observation"]');
    await page.evaluate(() => { window.__VISITAS_FAIL_WRITES__ = true; });
    await page.fill('[data-f="observation"]', 'Texto que no debe perderse (QA)'); await page.waitForTimeout(1200);
    assert.match(await page.locator('[data-saved]').innerText(), /Sin guardar/);
    assert.ok(await page.evaluate(id => !!localStorage.getItem('casur-visitas-pendiente:' + id), findingId), 'copia de emergencia');
    await page.evaluate(() => { location.hash = '#/inicio'; }); await page.waitForSelector('.vc-sheet', {timeout: 10000});
    await page.click('.vc-sheet [data-r="0"]'); await page.waitForTimeout(500);
    await page.evaluate(() => { window.__VISITAS_FAIL_WRITES__ = false; });
    await page.click('#toast button:has-text("Reintentar")').catch(async () => { await page.fill('[data-f="observation"]', 'Texto que no debe perderse (QA)'); });
    await page.waitForTimeout(1500);
    const f = await db(page, (s, id) => s.get('findings', id), findingId); assert.equal(f.observation, 'Texto que no debe perderse (QA)');
    assert.equal(await page.evaluate(id => localStorage.getItem('casur-visitas-pendiente:' + id), findingId), null);
  });
  await check('Concurrencia: una pestaña con revisión vieja no sobrescribe a otra', async () => {
    const other = await ctx.newPage(); await other.goto(V + '#/registrar?hallazgo=' + findingId); await ready(other); await other.waitForSelector('[data-f="observation"]');
    await page.goto(V + '#/registrar?hallazgo=' + findingId); await ready(page); await page.waitForSelector('[data-f="observation"]');
    await page.focus('[data-f="observation"]');                       // la pestaña A está editando (no se refresca sola)
    await other.fill('[data-f="observation"]', 'Versión de la pestaña B'); await other.waitForTimeout(1500);
    await page.fill('[data-f="observation"]', 'Versión de la pestaña A (vieja)'); await page.waitForTimeout(1500);
    const f = await db(page, (s, id) => s.get('findings', id), findingId); assert.equal(f.observation, 'Versión de la pestaña B');
    assert.match(await page.locator('#toast').innerText(), /cambió en otra ventana/);
    await other.close();
  });
  let parts = [];
  await check('Respaldo: exportación, confirmación (ZIP ≠ respaldo confirmado) y partes por capacidad', async () => {
    await page.goto(V + '#/datos'); await ready(page);
    const [d] = await Promise.all([page.waitForEvent('download'), page.click('[data-backup="pending"]')]); await d.saveAs(path.join(out, d.suggestedFilename()));
    await page.waitForSelector('[data-confirm]'); assert.equal(await db(page, s => s.all('photos').then(l => l.filter(p => p.backupState === 'confirmada').length)), 0);
    await page.click('[data-confirm]'); await page.waitForSelector('.vc-chip--ok');
    await shot(page, '17-datos-respaldos', true);
    parts = await page.evaluate(async () => { const b = await import(new URL('js/backup.js', location.href).href); const r = await b.buildBackup({scope: 'all', limit: 1});
      return Promise.all(r.parts.map(async p => ({name: p.name, bytes: [...new Uint8Array(await p.blob.arrayBuffer())]}))); });
    assert.ok(parts.length >= 3); parts.forEach(p => fs.writeFileSync(path.join(out, p.name), Buffer.from(p.bytes)));
    assert.match(Buffer.from(parts[0].bytes).toString('latin1'), /fotos\/2026\/\d{2}\/7_Amayo\/visita-/);
  });
  await check('Restauración: parte faltante, cualquier orden, idempotente, corrupción y conflicto de contenido', async () => {
    const c4 = await browser.newContext(mobile()); const p4 = await c4.newPage(); p4.on('pageerror', e => errors.push(String(e?.message ?? e)));
    await p4.goto(V + '#/datos'); await ready(p4);
    const files = parts.map(p => path.join(out, p.name));
    await p4.setInputFiles('[data-restore]', [files[1]]); await p4.waitForSelector('[data-report] .vc-note');
    assert.match(await p4.locator('[data-report]').innerText(), /incompleto[\s\S]*falta/);
    await p4.setInputFiles('[data-restore]', files.slice().reverse()); await p4.waitForTimeout(2500);
    const st = await db(p4, async s => ({v: (await s.all('visits')).length, f: (await s.all('findings')).length, p: (await s.all('photos')).filter(x => x.blob).length}));
    assert.ok(st.v >= 1 && st.f >= 2 && st.p >= 3, JSON.stringify(st));
    await p4.setInputFiles('[data-restore]', files); await p4.waitForTimeout(2500);
    assert.match(await p4.locator('[data-report]').innerText(), /Fotos: 0 restauradas/);
    // Conflicto: misma foto (id) con otro contenido en el teléfono → no se pisa.
    const id = await db(p4, async s => { const p = (await s.all('photos')).find(x => x.blob); await s.put('photos', {...p, blob: new Blob(['otro contenido']), sha256: 'x'.repeat(64)}); return p.id; });
    await p4.setInputFiles('[data-restore]', files); await p4.waitForTimeout(2500);
    assert.match(await p4.locator('[data-report]').innerText(), /contenido distinto/);
    assert.equal(await db(p4, (s, i) => s.get('photos', i).then(p => p.sha256), id), 'x'.repeat(64));
    await c4.close();
    const bad = Buffer.from(parts[0].bytes); let at = -1;
    for (let i = bad.indexOf(Buffer.from([0x50, 0x4B, 3, 4])); i >= 0; i = bad.indexOf(Buffer.from([0x50, 0x4B, 3, 4]), i + 4)) { const n = bad.readUInt16LE(i + 26), e = bad.readUInt16LE(i + 28); if (bad.subarray(i + 30, i + 30 + n).toString().startsWith('fotos/')) { at = i + 30 + n + e + 100; break; } }
    bad[at] ^= 0xFF; fs.writeFileSync(path.join(out, 'respaldo-alterado.zip'), bad);
    const c5 = await browser.newContext(); const p5 = await c5.newPage(); await p5.goto(V + '#/datos'); await ready(p5);
    await p5.setInputFiles('[data-restore]', path.join(out, 'respaldo-alterado.zip')); await p5.waitForSelector('[data-report] .vc-note');
    assert.match(await p5.locator('[data-report]').innerText(), /1 dañadas/); await c5.close();
  });
  await check('Escenario 7 · Sin conexión: abrir, buscar productor y registrar', async () => {
    await walk(ctx, page, jitter(A703, 4), 5);
    await ctx.setOffline(true);
    await page.goto(V + '#/inicio'); assert.equal((await page.reload()).status(), 200); await ready(page);
    await walk(ctx, page, jitter(A703, 4), 5); await page.waitForFunction(() => document.querySelector('#gpsChip')?.dataset.s === 'confiable', null, {timeout: 20000});
    await page.click('a.vc-fab'); await page.waitForSelector('[data-cat]');
    await page.click('[data-cat="cosecha"]'); await page.waitForSelector('[data-f="observation"]');
    assert.equal(await db(page, s => s.all('findings').then(l => l.filter(f => f.category === 'cosecha').length)), 1);
    await ctx.setOffline(false);
  });
  await check('Aislamiento de almacenamiento y migración: solo «casur-visitas» y sin escrituras ajenas', async () => {
    const dbs = await page.evaluate(async () => (await indexedDB.databases()).map(d => d.name).sort());
    assert.deepEqual(dbs, ['casur-visitas']);
  });
  await check('Responsive: 360, 412 y escritorio sin desbordes', async () => {
    for (const [w, h, name] of [[360, 760, '360'], [412, 915, '412']]) { await page.setViewportSize({width: w, height: h}); for (const r of ['inicio', 'registrar', 'bitacora', 'datos']) { await page.goto(V + '#/' + r); await ready(page); await page.waitForTimeout(600); await noOverflow(page); } await shot(page, `18-datos-${name}`); }
    const d = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1, geolocation: {latitude: A701[1], longitude: A701[0], accuracy: 5}, permissions: ['geolocation']}); const pd = await d.newPage();
    await pd.goto(V + '#/mapa?finca=7'); await ready(pd); await pd.waitForFunction(() => document.querySelectorAll('#vcMap .leaflet-interactive').length > 10, null, {timeout: 60000}); await pd.waitForTimeout(1500); await shot(pd, '19-escritorio-mapa');
    await pd.goto(V + '#/inicio'); await ready(pd); await pd.waitForTimeout(800); await noOverflow(pd); await shot(pd, '20-escritorio-inicio'); await d.close();
  });
  await check('Acceso desde la App Maestra: tarjeta e iframe', async () => {
    const c6 = await browser.newContext({viewport: {width: 1440, height: 900}}); const p6 = await c6.newPage(); p6.on('pageerror', e => errors.push(String(e?.message ?? e)));
    await p6.goto(base); await p6.waitForFunction(() => !!navigator.serviceWorker.controller, null, {timeout: 120000});
    await p6.waitForSelector('text=Visitas de Campo Productores de Caña'); await p6.goto(base + '#/modulo/visitas');
    await p6.waitForFunction(() => { const f = document.querySelector('#mFrame'); return f?.src.includes('/modules/visitas/') && f.contentWindow?.CASUR_VISITAS_READY; }, null, {timeout: 120000});
    await p6.waitForTimeout(1200); await shot(p6, '21-app-maestra'); await c6.close();
  });
  await check('Sin errores de página', async () => assert.deepEqual(errors, [], errors.join(' | ')));
  await ctx.close(); await browser.close();
  const pass = results.filter(r => r[0] === 'PASS').length;
  fs.writeFileSync(path.join(out, 'qa-visitas.json'), JSON.stringify({base, results}, null, 1));
  console.log(`${pass}/${results.length} ${pass === results.length ? 'PASS' : 'FAIL'}`); if (pass !== results.length) process.exitCode = 1;
})();
