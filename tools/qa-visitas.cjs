// QA VC01 · Visitas de Campo Productores de Caña (perfiles aislados; solo datos sintéticos de visitas y fotos).
// Cubre: acceso directo y desde la App Maestra, manifiesto propio e instalabilidad (Chromium), registro completo de una
// visita con GPS simulado y polígonos oficiales, campos condicionales, fotos con SHA-256/EXIF, borrador recuperado,
// instantánea del Maestro, seguimiento, respaldo dividido, restauración verificada sin duplicados, corrupción detectada,
// funcionamiento sin conexión y aislamiento de almacenamiento.
// Uso: node tools/qa-visitas.cjs BASE_URL OUT_DIR
const {chromium} = require('playwright'), assert = require('assert/strict'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const [base, out] = process.argv.slice(2);
if (!base || !out) throw Error('Uso: node tools/qa-visitas.cjs BASE_URL OUT_DIR');
fs.mkdirSync(out, {recursive: true});
const V = base + 'modules/visitas/';
const results = [];
const check = async (name, fn) => { try { await fn(); results.push(['PASS', name]); console.log('PASS · ' + name); }
  catch (e) { results.push(['FAIL', name, e.message.split('\n').slice(0, 4).join(' ')]); console.log('FAIL · ' + name + ' · ' + e.message.split('\n').slice(0, 4).join(' ')); } };

/* Suerte de prueba: 242|01 (Secano en el Maestro publicado). Punto GPS = ancla oficial de su polígono. */
const repo = path.resolve(__dirname, '..');
const geo = JSON.parse(fs.readFileSync(path.join(repo, 'shared/geo/data/manifest.json'), 'utf8'));
const zone = JSON.parse(fs.readFileSync(path.join(repo, 'shared/geo/data', geo.zones[geo.lotIndex['24201']].file), 'utf8'));
const anchor = zone.features.find(f => f.properties.lotId === '24201').properties.anchor;
const GPS = {latitude: anchor[1], longitude: anchor[0], accuracy: 4};

/* JPEG sintético con EXIF (fecha y GPS) insertado tras SOI. */
function exifApp1({lat, lon, err, date}) {
  const entries0 = [[0x0132, 2, 20, Buffer.from(date + '\0', 'ascii')], [0x8825, 4, 1, null]];
  const dms = v => { const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = Math.round(((a - d) * 60 - m) * 60 * 10000); return [[d, 1], [m, 1], [s, 10000]]; };
  const gpsEntries = [[1, 2, 2, Buffer.from((lat < 0 ? 'S' : 'N') + '\0')], [2, 5, 3, dms(lat)], [3, 2, 2, Buffer.from((lon < 0 ? 'W' : 'E') + '\0')], [4, 5, 3, dms(lon)], [31, 5, 1, [[err, 1]]]];
  const ifdSize = n => 2 + n * 12 + 4;
  const ifd0At = 8, gpsAt = ifd0At + ifdSize(entries0.length), dataAt = gpsAt + ifdSize(gpsEntries.length);
  const data = []; let dataOff = dataAt;
  const put = buf => { const at = dataOff; data.push(buf); dataOff += buf.length; return at; };
  const rationals = list => { const b = Buffer.alloc(list.length * 8); list.forEach(([n, d], i) => { b.writeUInt32LE(n, i * 8); b.writeUInt32LE(d, i * 8 + 4); }); return b; };
  const writeIfd = (entries, at) => {
    const b = Buffer.alloc(ifdSize(entries.length)); b.writeUInt16LE(entries.length, 0);
    entries.forEach(([tag, type, count, value], i) => {
      const e = 2 + i * 12; b.writeUInt16LE(tag, e); b.writeUInt16LE(type, e + 2); b.writeUInt32LE(count, e + 4);
      if (tag === 0x8825) b.writeUInt32LE(gpsAt, e + 8);
      else if (type === 5) b.writeUInt32LE(put(rationals(value)), e + 8);
      else if (value.length <= 4) value.copy(b, e + 8);
      else b.writeUInt32LE(put(value), e + 8);
    });
    return b;
  };
  const head = Buffer.from([0x49, 0x49, 0x2A, 0, 8, 0, 0, 0]);
  const ifd0 = writeIfd(entries0, ifd0At), gps = writeIfd(gpsEntries, gpsAt);
  const tiff = Buffer.concat([head, ifd0, gps, ...data]);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const seg = Buffer.alloc(4); seg.writeUInt16BE(0xFFE1, 0); seg.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([seg, body]);
}
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

(async () => {
  const browser = await chromium.launch();
  // Imágenes sintéticas generadas en el navegador (sin fotos reales).
  const scratch = await browser.newPage();
  const synth = async (type, color, w, h) => Buffer.from(await scratch.evaluate(async ([type, color, w, h]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '48px sans-serif'; g.fillText('QA sintética', 40, h / 2);
    const blob = await new Promise(r => c.toBlob(r, type, 0.9)); return [...new Uint8Array(await blob.arrayBuffer())];
  }, [type, color, w, h]));
  const jpeg = await synth('image/jpeg', '#2F7E97', 1200, 900);
  const withExif = Buffer.concat([jpeg.subarray(0, 2), exifApp1({lat: GPS.latitude + 0.00001, lon: GPS.longitude, err: 3, date: '2026:11:28 09:15:00'}), jpeg.subarray(2)]);
  const png = await synth('image/png', '#1F6B4B', 800, 600);
  fs.writeFileSync(path.join(out, 'foto-exif.jpg'), withExif); fs.writeFileSync(path.join(out, 'foto-sin-exif.png'), png);
  await scratch.close();

  const ctx = await browser.newContext({viewport: {width: 412, height: 915}, isMobile: true, hasTouch: true, deviceScaleFactor: 1, acceptDownloads: true,
    geolocation: GPS, permissions: ['geolocation']});
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e?.message ?? e)));
  const ready = async () => page.waitForFunction(() => window.CASUR_VISITAS_READY === true, null, {timeout: 120000});
  let visitId;

  await check('Acceso directo: primera carga, recarga controlada por el SW raíz (sin 503) y bundle preparado', async () => {
    let r = await page.goto(V); assert.equal(r.status(), 200); await ready();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {timeout: 120000});
    await page.waitForFunction(() => /Lista sin conexión/.test(document.getElementById('vcOffline')?.textContent || ''), null, {timeout: 120000});
    r = await page.reload(); assert.equal(r.status(), 200); await ready();
    const regs = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(x => new URL(x.scope).pathname));
    assert.deepEqual(regs, [new URL(base).pathname]);
    await page.screenshot({path: path.join(out, 'inicio.png')});
  });
  await check('Manifiesto propio de Visitas (id/scope propios), icono y sin errores de instalabilidad en Chromium', async () => {
    const cdp = await ctx.newCDPSession(page);
    const m = await cdp.send('Page.getAppManifest'), parsed = JSON.parse(m.data);
    assert.match(m.url, /modules\/visitas\/manifest\.webmanifest$/); assert.equal(parsed.name, 'Visitas de Campo Productores de Caña');
    assert.equal(parsed.scope, './'); assert.equal(parsed.id, './');
    assert.deepEqual((await cdp.send('Page.getInstallabilityErrors')).installabilityErrors, []);
    for (const icon of parsed.icons) assert.equal((await page.request.get(V + icon.src)).status(), 200);
  });
  await check('Registro completo: productor, suerte por GPS con confirmación, campos condicionales, hallazgo y seguimiento', async () => {
    await page.click('text=Registrar nueva visita'); await page.waitForURL(/#\/visita\//);
    visitId = decodeURIComponent(page.url().split('#/visita/')[1]);
    await page.fill('#producerQuery', '242'); await page.click('[data-action="pick-producer"][value="242"]');
    await page.waitForSelector('.vc-chosen');
    await page.click('[data-action="gps"]');
    await page.waitForSelector('.vc-proposal--inside', {timeout: 60000});
    await page.click('[data-action="confirm-lot"]');
    await page.waitForSelector('.vc-lot.is-on');
    assert.match(await page.locator('.vc-lot.is-on').innerText(), /01/); assert.match(await page.locator('.vc-lot.is-on').innerText(), /GPS/);
    await page.selectOption('[data-bind="reason"]', 'riego'); await page.waitForSelector('text=Secano');
    // Secano: no se pide el estado del sistema de riego; sí el drenaje y la humedad.
    assert.equal(await page.locator('[data-bind="fields.sistemaRiego"]').count(), 0);
    assert.ok(await page.locator('[data-bind="fields.drenaje"]').count() > 0);
    await page.check('input[name="f-humedad"][value="Seco"]', {force: true});
    await page.fill('[data-bind="author.name"]', 'Técnico QA');
    await page.fill('[data-bind="observations"]', 'Observación sintética de QA: suelo seco en el sector norte.');
    await page.click('[data-action="add-finding"]'); await page.fill('[data-bind^="findings."][data-bind$=".text"]', 'Hallazgo sintético: estrés hídrico leve.');
    for (const kind of ['recomendacion', 'solicitud', 'compromiso']) { await page.click(`[data-action="add-fu"][value="${kind}"]`); await page.locator(`[data-fu-bind$=".text"]`).last().fill(`Texto sintético de ${kind}`); }
    await page.locator('[data-fu-bind$=".responsible"]').first().fill('Responsable QA');
    await page.locator('[data-fu-bind$=".dueDate"]').first().fill('2026-12-15');
    await page.waitForTimeout(900);
    await page.screenshot({path: path.join(out, 'formulario.png'), fullPage: true});
  });
  await check('Fotos: original intacto (SHA-256 del archivo), EXIF GPS propio vs ubicación general de la visita', async () => {
    await page.setInputFiles('[data-action="photo-gallery"]', [path.join(out, 'foto-exif.jpg'), path.join(out, 'foto-sin-exif.png')]);
    await page.waitForFunction(() => document.querySelectorAll('.vc-photo').length === 2, null, {timeout: 30000});
    const photos = await page.evaluate(async id => { const s = await import(new URL('js/store.js', location.href).href);
      return Promise.all((await s.byIndex('photos', 'visitId', id)).map(async p => ({name: p.originalName, sha: p.sha256, size: p.size, gps: p.gps, visitGps: p.visitGps, takenAt: p.takenAt, bytes: [...new Uint8Array(await p.blob.arrayBuffer())].length})));
    }, visitId);
    const exif = photos.find(p => p.name === 'foto-exif.jpg'), plain = photos.find(p => p.name === 'foto-sin-exif.png');
    assert.equal(exif.sha, sha(withExif)); assert.equal(exif.size, withExif.length); assert.equal(plain.sha, sha(png));
    assert.equal(exif.gps.source, 'exif'); assert.ok(Math.abs(exif.gps.lat - (GPS.latitude + 0.00001)) < 1e-5); assert.equal(exif.gps.accuracy, 3);
    assert.equal(exif.takenAt, '2026-11-28T09:15:00');
    assert.equal(plain.gps, null); assert.equal(plain.visitGps.source, 'visit');
    assert.match(await page.locator('.vc-photos').innerText(), /Sin GPS propio · ubicación general de la visita/); assert.match(await page.locator('.vc-photos').innerText(), /GPS propio ±3 m/);
  });
  await check('Borrador: autoguardado y recuperación tras recargar en mitad de la visita', async () => {
    await page.waitForTimeout(800); await page.reload(); await ready();
    await page.goto(base + 'modules/visitas/#/inicio'); await ready();
    assert.match(await page.locator('.vc-card--warn').innerText(), /Borradores sin cerrar[\s\S]*Agustin/);
    await page.click('.vc-card--warn .vc-row'); await page.waitForSelector('[data-bind="observations"]');
    assert.match(await page.inputValue('[data-bind="observations"]'), /suelo seco/);
    assert.equal(await page.locator('[data-fu-bind$=".text"]').count(), 3);
  });
  await check('Cierre, instantánea del Maestro congelada y revisión al editar una visita cerrada', async () => {
    await page.click('[data-action="close-visit"]'); await page.waitForURL(/#\/ver\//);
    await page.screenshot({path: path.join(out, 'detalle.png'), fullPage: true});
    const v1 = await page.evaluate(async id => (await (await import(new URL('js/store.js', location.href).href)).get('visits', id)), visitId);
    assert.equal(v1.status, 'cerrada'); assert.equal(v1.masterSnapshot.dataVersion, '2026.11.22-aforo.1102');
    const rec = v1.masterSnapshot.records.find(r => r.key === '242|01'); assert.equal(rec.attributes.irrigationType, 'Secano'); assert.equal(rec.identity.lotCode, '24201');
    assert.equal(v1.lots[0].selection, 'gps'); assert.equal(v1.gps.accuracy, 4);
    await page.click('text=Editar'); await page.fill('[data-bind="observations"]', 'Observación corregida después del cierre.'); await page.waitForTimeout(900);
    await page.click('text=Terminar edición'); await page.waitForURL(/#\/ver\//);
    const v2 = await page.evaluate(async id => (await (await import(new URL('js/store.js', location.href).href)).get('visits', id)), visitId);
    assert.equal(v2.revisions.length >= 1, true); assert.deepEqual(v2.revisions.at(-1).changed, ['observations']);
    assert.match(v2.revisions.at(-1).previous.observations, /suelo seco/);
    assert.deepEqual(v2.masterSnapshot, v1.masterSnapshot);
  });
  await check('Seguimiento: cambio de estado con nota e historial; sin registros externos', async () => {
    await page.goto(V + '#/seguimiento'); await ready();
    const id = await page.locator('[data-fu-apply]').first().getAttribute('data-fu-apply');
    await page.selectOption(`[data-fu-state="${id}"]`, 'En gestión'); await page.fill(`[data-fu-note="${id}"]`, 'Nota sintética de gestión');
    await page.click(`[data-fu-apply="${id}"]`); await page.waitForTimeout(400);
    const f = await page.evaluate(async id => (await (await import(new URL('js/store.js', location.href).href)).get('followups', id)), id);
    assert.equal(f.state, 'En gestión'); assert.equal(f.history.length, 2); assert.equal(f.history[1].note, 'Nota sintética de gestión');
    assert.match(await page.locator('main').innerText(), /No se generan registros SIAGRI/);
  });
  let zips = [];
  await check('Respaldo: exportación desde la interfaz, estados de fotos y confirmación', async () => {
    await page.goto(V + '#/datos'); await ready();
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="backup"][value="pending"]')]);
    const file = path.join(out, download.suggestedFilename()); await download.saveAs(file); zips.push(file);
    assert.match(download.suggestedFilename(), /^Respaldo_Visitas_\d{2}-[A-Z][a-z]{2}-\d{4}\.zip$/);
    await page.waitForSelector('[data-action="confirm"]');
    assert.match(await page.locator('.vc-states').innerText(), /Exportada en un respaldo\s*2/);
    await page.click('[data-action="confirm"]'); await page.waitForSelector('.vc-tag--ok');
    assert.match(await page.locator('.vc-states').innerText(), /Respaldo confirmado\s*2/);
    const left = await page.evaluate(async () => (await (await import(new URL('js/store.js', location.href).href)).all('photos')).filter(p => p.blob).length);
    assert.equal(left, 2, 'las fotos siguen en el teléfono');
    await page.screenshot({path: path.join(out, 'datos.png'), fullPage: true});
  });
  let parts = [];
  await check('Respaldo dividido por capacidad (partes autosuficientes) con estructura año/mes/finca/visita', async () => {
    parts = await page.evaluate(async () => {
      const b = await import(new URL('js/backup.js', location.href).href);
      const backup = await b.buildBackup({scope: 'all', limit: 1});   // fuerza una foto por parte
      return Promise.all(backup.parts.map(async p => ({name: p.name, bytes: [...new Uint8Array(await p.blob.arrayBuffer())]})));
    });
    assert.equal(parts.length, 2); parts.forEach(p => fs.writeFileSync(path.join(out, p.name), Buffer.from(p.bytes)));
    assert.match(parts[0].name, /_parte_1_de_2\.zip$/);
    const text = Buffer.from(parts[0].bytes).toString('latin1');
    assert.match(text, /fotos\/2026\/\d{2}\/242_Agustin_Boiorge_Acevedo\/visita-/); assert.match(text, /datos\/visitas\.json/);
  });
  await ctx.close();

  // Restauración en otro perfil (teléfono nuevo): sin conexión de red a datos previos.
  const ctx2 = await browser.newContext({viewport: {width: 412, height: 915}, isMobile: true, hasTouch: true, deviceScaleFactor: 1});
  const p2 = await ctx2.newPage(); p2.on('pageerror', e => errors.push(String(e?.message ?? e)));
  await check('Restauración verificable en un perfil nuevo, idempotente y con detección de corrupción', async () => {
    await p2.goto(V + '#/datos'); await p2.waitForFunction(() => window.CASUR_VISITAS_READY === true, null, {timeout: 120000});
    const files = parts.map(p => path.join(out, p.name));
    await p2.setInputFiles('[data-action="restore"]', files); await p2.waitForSelector('#restoreReport .vc-note', {timeout: 60000});
    let report = await p2.locator('#restoreReport').innerText();
    assert.match(report, /Visitas: 1 nuevas/); assert.match(report, /Fotos: 2 restauradas/);
    const state = await p2.evaluate(async () => { const s = await import(new URL('js/store.js', location.href).href); return {visits: (await s.all('visits')).length, photos: (await s.all('photos')).map(p => ({ok: !!p.blob, state: p.backupState}))}; });
    assert.equal(state.visits, 1); assert.equal(state.photos.length, 2); assert.ok(state.photos.every(p => p.ok && p.state === 'restaurada'));
    await p2.setInputFiles('[data-action="restore"]', files); await p2.waitForTimeout(1500);
    report = await p2.locator('#restoreReport').innerText();
    assert.match(report, /Visitas: 0 nuevas · 0 actualizadas · 1 se conservaron/); assert.match(report, /Fotos: 0 restauradas · 2 ya estaban/);
    // Corrupción: se altera un byte dentro de la foto de una parte; en un perfil limpio no debe guardarse.
    const bad = Buffer.from(parts[1].bytes); let at = -1;
    // Encabezado local («PK\x03\x04») cuyo nombre empieza por «fotos/»: se altera un byte de los datos de la imagen.
    for (let i = bad.indexOf(Buffer.from([0x50, 0x4B, 3, 4])); i >= 0; i = bad.indexOf(Buffer.from([0x50, 0x4B, 3, 4]), i + 4)) {
      const n = bad.readUInt16LE(i + 26), e = bad.readUInt16LE(i + 28);
      if (bad.subarray(i + 30, i + 30 + n).toString('utf8').startsWith('fotos/')) { at = i + 30 + n + e + 100; break; }
    }
    assert.ok(at > 0); bad[at] ^= 0xFF;
    const badFile = path.join(out, 'respaldo-alterado.zip'); fs.writeFileSync(badFile, bad);
    const p3ctx = await browser.newContext(); const p3 = await p3ctx.newPage();
    await p3.goto(V + '#/datos'); await p3.waitForFunction(() => window.CASUR_VISITAS_READY === true, null, {timeout: 120000});
    await p3.setInputFiles('[data-action="restore"]', [badFile]); await p3.waitForSelector('#restoreReport .vc-note');
    assert.match(await p3.locator('#restoreReport').innerText(), /1 dañadas \(no se guardaron\)/);
    await p3ctx.close();
  });
  await check('Aislamiento: Visitas solo crea su propia base (lee el Maestro sin crear casur_master_data)', async () => {
    const dbs = await p2.evaluate(async () => (await indexedDB.databases()).map(d => d.name).sort());
    assert.deepEqual(dbs, ['casur-visitas']);
  });
  await check('Sin conexión tras la preparación: abre directo, busca productores y guarda un borrador', async () => {
    await p2.waitForFunction(() => /Lista sin conexión/.test(document.getElementById('vcOffline')?.textContent || ''), null, {timeout: 120000});
    await ctx2.setOffline(true);
    await p2.goto(V + '#/inicio'); const r = await p2.reload(); assert.equal(r.status(), 200); await p2.waitForFunction(() => window.CASUR_VISITAS_READY === true, null, {timeout: 60000});
    await p2.click('text=Registrar nueva visita'); await p2.waitForURL(/#\/visita\//);
    await p2.fill('#producerQuery', '242'); await p2.click('[data-action="pick-producer"][value="242"]'); await p2.waitForSelector('.vc-chosen');
    await p2.waitForSelector('.vc-map .leaflet-interactive', {timeout: 30000});
    await p2.screenshot({path: path.join(out, 'offline-mapa.png'), fullPage: false});
    await ctx2.setOffline(false);
  });
  await ctx2.close();

  // Desde la App Maestra: tarjeta en Inicio, iframe, cabecera propia oculta.
  const ctx3 = await browser.newContext({viewport: {width: 1440, height: 900}}); const p4 = await ctx3.newPage(); p4.on('pageerror', e => errors.push(String(e?.message ?? e)));
  await check('Acceso desde la App Maestra: tarjeta en Inicio e iframe del módulo', async () => {
    await p4.goto(base); await p4.waitForFunction(() => !!navigator.serviceWorker.controller, null, {timeout: 120000});
    await p4.waitForSelector('text=Visitas de Campo Productores de Caña');
    await p4.goto(base + '#/modulo/visitas');
    await p4.waitForFunction(() => { const f = document.querySelector('#mFrame'); return f?.src.includes('/modules/visitas/') && f.contentWindow?.CASUR_VISITAS_READY; }, null, {timeout: 120000});
    const fr = p4.frames().find(f => f.url().includes('/modules/visitas/'));
    assert.equal(await fr.evaluate(() => getComputedStyle(document.querySelector('.vc-head')).display), 'none');
    assert.equal(await fr.evaluate(() => window.CASUR_MODULE_BRIDGE.moduleId), 'visitas');
    await p4.screenshot({path: path.join(out, 'app-maestra.png')});
  });
  await check('Sin errores de página', async () => assert.deepEqual(errors, [], errors.join(' | ')));
  await ctx3.close(); await browser.close();
  const pass = results.filter(r => r[0] === 'PASS').length;
  fs.writeFileSync(path.join(out, 'qa-visitas.json'), JSON.stringify({base, results}, null, 1));
  console.log(`${pass}/${results.length} ${pass === results.length ? 'PASS' : 'FAIL'}`); if (pass !== results.length) process.exitCode = 1;
})();
