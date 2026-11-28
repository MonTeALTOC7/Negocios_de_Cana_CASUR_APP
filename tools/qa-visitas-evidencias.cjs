// QA de evidencias documentales de Visitas 1.2 (datos SINTÉTICOS, perfil aislado, sin escribir en IndexedDB).
// Genera y valida: fotos etiquetadas (vertical con comentario largo, horizontal sin ubicación, pequeña con posición
// aproximada) y fichas de seguimiento técnico (una foto; muchas fotos con textos largos, recomendaciones e historial).
// Comprueba que la foto se conserva entera (el pie va debajo) y que la altura crece con el contenido (sin recortes).
// Uso: node tools/qa-visitas-evidencias.cjs BASE_URL OUT_DIR
const {chromium} = require('playwright'), assert = require('assert/strict'), fs = require('fs'), path = require('path');
const [base, out] = process.argv.slice(2);
if (!base || !out) throw Error('Uso: node tools/qa-visitas-evidencias.cjs BASE_URL OUT_DIR');
fs.mkdirSync(out, {recursive: true});
const results = [];
const check = async (name, fn) => { try { await fn(); results.push(['PASS', name]); console.log('PASS · ' + name); }
  catch (e) { results.push(['FAIL', name, e.message.split('\n')[0]]); console.log('FAIL · ' + name + ' · ' + e.message.split('\n').slice(0, 3).join(' ')); } };

(async () => {
  const browser = await chromium.launch(), page = await browser.newPage({viewport: {width: 900, height: 900}});
  const errors = []; page.on('pageerror', e => errors.push(String(e?.message ?? e)));
  await page.goto(base + 'modules/visitas/'); await page.waitForFunction(() => window.CASUR_VISITAS_READY === true, null, {timeout: 120000});
  const run = (fn, arg) => page.evaluate(async ([src, a]) => {
    const L = await import(new URL('js/labels.js', location.href).href), {maestro} = await import(new URL('js/maestro.js', location.href).href);
    const {snapshotRecord} = await import(new URL('js/maestro.js', location.href).href);
    const photo = async (w, h, label, hue) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, `hsl(${hue},45%,42%)`); gr.addColorStop(1, '#16323B'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);   // borde: debe verse completo (la foto no se cubre ni se recorta)
      g.fillStyle = 'rgba(255,255,255,.9)'; g.font = `bold ${Math.round(Math.min(w, h) / 9)}px sans-serif`; g.fillText(label, w * .08, h * .5);
      return new Promise(r => c.toBlob(r, 'image/jpeg', .9)); };
    const {reader} = await maestro(), rec = snapshotRecord(reader.byKey('7|01'));
    const visit = {id: 'visita-qa', producer: {code: '7', name: rec.farm.name, zone: rec.farm.zone}, scope: 'suertes', lotKeys: ['7|01'], startedAt: '2026-11-28T08:10:00', author: {name: 'Técnico QA'}};
    const toBytes = async b => [...new Uint8Array(await b.arrayBuffer())];
    return (0, eval)(src)({L, photo, rec, visit, toBytes}, a);
  }, [fn.toString(), arg]);
  const save = (name, bytes) => { fs.writeFileSync(path.join(out, name), Buffer.from(bytes)); };
  const dims = bytes => page.evaluate(async b => { const bm = await createImageBitmap(new Blob([new Uint8Array(b)])); return [bm.width, bm.height]; }, bytes);
  const LONG = 'Coquillo y caminadora en la cabecera norte, con mayor presión en los primeros 40 surcos junto al dren principal. ' +
    'El productor informa que la última aplicación fue hace cinco semanas y que el rebrote apareció después de las lluvias. ' +
    'Se observa competencia directa con la caña en macollamiento; conviene repetir la evaluación en la próxima visita. (Texto sintético de QA.)';

  await check('Foto etiquetada vertical con comentario largo: foto entera y pie debajo, sin cortar el texto', async () => {
    const r = await run(async ({L, photo, rec, visit, toBytes}, text) => {
      const p = {id: 'foto-qa-vertical-0001', blob: await photo(1200, 1600, 'Vertical', 110), takenAt: '2026-11-28T08:32:00', caption: text,
        location: {source: 'device-before', lat: 11.4512, lon: -85.8231, accuracy: 6}, findingId: 'h1'};
      return toBytes(await L.labeledPhoto({photo: p, visit, finding: {category: 'malezas', observation: ''}, record: rec, author: 'Técnico QA'}));
    }, LONG);
    save('muestra-foto-etiquetada-vertical-largo.jpg', r); const [w, h] = await dims(r);
    assert.equal(w, 1200); assert.ok(h > 1600 + 450, `${w}×${h}: el pie de un comentario largo debe crecer (no cortarse)`);
  });
  await check('Foto etiquetada horizontal sin ubicación: «Sin ubicación verificable» y proporción conservada', async () => {
    const r = await run(async ({L, photo, rec, visit, toBytes}) => {
      const p = {id: 'foto-qa-horizontal-02', blob: await photo(2000, 1500, 'Horizontal', 200), takenAt: '2026-11-28T09:05:00', caption: '', location: {source: 'none'}};
      return toBytes(await L.labeledPhoto({photo: p, visit, finding: null, record: rec}));
    });
    save('muestra-foto-etiquetada-horizontal.jpg', r); const [w, h] = await dims(r);
    assert.equal(w, 2000); assert.ok(h > 1500 + 200 && h < 1500 + 700, `${w}×${h}`);
  });
  await check('Foto pequeña con posición aproximada: se lleva a 1080 px y la ubicación se rotula aproximada', async () => {
    const r = await run(async ({L, photo, rec, visit, toBytes}) => {
      const loc = {source: 'device-after', lat: 11.45, lon: -85.82, accuracy: 70, approximate: true, moved: true, deltaS: 22};
      const p = {id: 'foto-qa-pequena-003', blob: await photo(640, 480, 'Pequeña', 30), takenAt: '2026-11-28T09:40:00', caption: 'Fuga en el hidrante de la suerte.', location: loc, followupId: 'r1'};
      return {bytes: await toBytes(await L.labeledPhoto({photo: p, visit, finding: {category: 'riego'}, record: rec})), place: L.placeText(loc), exact: L.coordsText(loc)};
    });
    save('muestra-foto-etiquetada-aproximada.jpg', r.bytes); const [w, h] = await dims(r.bytes);
    assert.equal(w, 1080); assert.ok(h > 810 + 300); assert.equal(r.exact, ''); assert.equal(r.place.ok, false); assert.match(r.place.text, /aproximada/i);
  });
  let oneH = 0;
  await check('Ficha de seguimiento técnico con una foto', async () => {
    const r = await run(async ({L, photo, rec, visit, toBytes}) => {
      const f = {id: 'hallazgo-qa-000001', category: 'plagas', observedAt: '2026-11-28T08:40:00', observation: 'Daño de barrenador en tallos (QA).', details: {}, status: 'Abierto', history: [{state: 'Abierto', at: '2026-11-28T08:40:00', note: ''}], gps: {source: 'none'}};
      const p = [{id: 'p1', blob: await photo(1200, 900, 'Plagas', 15), takenAt: '2026-11-28T08:41:00', location: {source: 'none'}}];
      return toBytes(await L.followupSheet({finding: f, visit, record: rec, photos: p, followups: [], author: 'Técnico QA'}));
    });
    save('muestra-ficha-seguimiento-simple.png', r); const [w, h] = await dims(r); oneH = h; assert.equal(w, 1240); assert.ok(h > 1400);
  });
  await check('Ficha de seguimiento técnico completa: 5 fotos verticales y horizontales, textos largos, recomendaciones, historial y antes/después', async () => {
    const r = await run(async ({L, photo, rec, visit, toBytes}, text) => {
      const f = {id: 'hallazgo-qa-000002', category: 'malezas', observedAt: '2026-11-10T08:40:00', observation: text, details: {distribucion: 'Parches', cobertura: 35, especies: 'Coquillo (Cyperus rotundus), caminadora (Rottboellia cochinchinensis) y bejuco en bordes del dren principal'},
        severity: {value: 'Alta', source: 'tecnico'}, status: 'Verificado', phenology: {computed: 'Macollamiento', corrected: null},
        history: [{state: 'Abierto', at: '2026-11-10T08:40:00', note: ''}, {state: 'En seguimiento', at: '2026-11-10T09:00:00', note: 'Recomendación emitida', by: 'Técnico QA'}, {state: 'Verificado', at: '2026-11-28T10:00:00', note: 'Cobertura menor al 5 % en la cabecera norte; se mantiene vigilancia en bordes.', by: 'Técnico QA'}], gps: {source: 'device', lat: 11.4512, lon: -85.8231, accuracy: 5}};
      const sizes = [[1200, 1600], [1600, 1200], [900, 1600], [1600, 900], [1200, 1200]];
      const photos = await Promise.all(sizes.map(async ([w, h], i) => ({id: 'p' + i, blob: await photo(w, h, 'Evidencia ' + (i + 1), 90 + i * 20), takenAt: `2026-11-10T08:4${i}:00`, caption: i === 0 ? 'Vista general de la cabecera norte con rebrote denso después de las lluvias.' : '',
        location: i === 1 ? {source: 'exif', lat: 11.4513, lon: -85.8232, accuracy: 3} : {source: 'none'}})));
      const after = [{id: 'pa', blob: await photo(1200, 1600, 'Después', 130), takenAt: '2026-11-28T09:55:00', followupId: 'r1', location: {source: 'device-before', lat: 11.4512, lon: -85.8231, accuracy: 4}}];
      const fus = [{id: 'r1', kind: 'recomendacion', findingId: f.id, text: 'Aplicar control químico dirigido en la cabecera norte con boquilla de abanico y repetir la evaluación a los 15 días; priorizar los primeros 40 surcos y los bordes del dren.', state: 'Verificado', responsible: 'Productor', dueDate: '2026-11-20', createdAt: '2026-11-10T09:00:00',
          history: [{state: 'Pendiente', at: '2026-11-10T09:00:00', note: 'Registrada'}, {state: 'Ejecutado', at: '2026-11-18T07:00:00', note: 'Aplicación realizada por el productor', by: 'Técnico QA'}, {state: 'Verificado', at: '2026-11-28T09:58:00', note: 'Verificado en campo', by: 'Técnico QA'}]},
        {id: 's1', kind: 'solicitud', category: 'herbicida', findingId: f.id, text: 'Herbicida selectivo para 3.5 ha de la suerte 01.', quantity: 7, unit: 'L', state: 'Atendida', createdAt: '2026-11-10T09:05:00', history: [{state: 'Solicitada', at: '2026-11-10T09:05:00', note: 'Registrada'}, {state: 'Atendida', at: '2026-11-14T15:00:00', note: 'Entregado por el área de insumos'}]},
        {id: 'c1', kind: 'compromiso', findingId: f.id, text: 'El productor limpiará manualmente los bordes del dren antes de la próxima visita.', state: 'Cumplido', dueDate: '2026-11-25', responsible: 'Productor', createdAt: '2026-11-10T09:10:00', history: [{state: 'Pendiente', at: '2026-11-10T09:10:00', note: 'Registrada'}]}];
      return toBytes(await L.followupSheet({finding: f, visit: {...visit, startedAt: '2026-11-10T08:10:00'}, record: rec, photos, followPhotos: after, followups: fus, author: 'Técnico QA'}));
    }, LONG);
    save('muestra-ficha-seguimiento.png', r); const [w, h] = await dims(r);
    assert.equal(w, 1240); assert.ok(h > oneH + 2000, `${w}×${h}: la altura debe crecer con el contenido`);
  });
  await check('Sin errores de página', async () => assert.deepEqual(errors, [], errors.join(' | ')));
  await browser.close();
  const pass = results.filter(r => r[0] === 'PASS').length;
  fs.writeFileSync(path.join(out, 'qa-visitas-evidencias.json'), JSON.stringify({base, results}, null, 1));
  console.log(`${pass}/${results.length} ${pass === results.length ? 'PASS' : 'FAIL'}`); if (pass !== results.length) process.exitCode = 1;
})();
