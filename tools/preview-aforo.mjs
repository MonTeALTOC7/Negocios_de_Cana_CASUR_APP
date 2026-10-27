import fs from 'node:fs';
import {createHash, createDecipheriv} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const engine = createRequire(import.meta.url)('../core/imports/operational-import.js');
export const AFORO_VERSION = '2026.10.25-aforo.1101';
export const AFORO_SOURCE_SHA = 'aa9ab25b863dc399d5a6d445c0efe7907ca8956ef868429f308a404a46267fc6';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const near = (actual, expected) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-7);

export function validatePreviewAforo(snapshot) {
  const {production, maestro} = snapshot;
  const g = production?.operationalDataset;
  engine.validateGeneration(g);
  assert.equal(production.dataVersion, AFORO_VERSION);
  assert.equal(g.dataVersion, AFORO_VERSION);
  assert.equal(g.source.sha256, AFORO_SOURCE_SHA);
  assert.equal(g.source.sourceDate, '2026-10-12');
  assert.equal(g.source.season, '26/27');
  assert.equal(g.cronologico.meta.sourceSha256, AFORO_SOURCE_SHA);
  assert.equal(g.catalog.length, 1053);
  assert.equal(production.reportRows.length, 1053);
  assert.equal(maestro?.version, g.dataVersion);
  assert.equal(maestro.rows, 1053);
  assert.equal(Object.keys(maestro.byKey).length, 1053);
  const rows = new Map(g.cronologico.producers.flatMap(p => p.details).map(r => [r.codLote, r]));
  assert.equal(rows.size, 1053);
  for (const r of g.catalog) {
    const view = rows.get(r.codLote), master = maestro.byKey[r.code + '|' + r.suerte];
    assert.ok(view && master);
    // The importer sets these two display metadata fields after building Cronologico.
    // All numerical, identity, operational and provenance fields must be identical.
    for (const field of Object.keys(r).filter(k => !['tchEst2627Fecha', 'tchEst2627Fuente'].includes(k))) {
      assert.deepEqual(view[field], r[field], r.codLote + ':' + field);
    }
    near(master.area, r.area);
    assert.equal(master.variety, r.variedad);
    if (r.sourcePresence === 'present') {
      assert.equal(r.source.sha256, AFORO_SOURCE_SHA);
      assert.equal(r.forecast.source.sha256, AFORO_SOURCE_SHA);
    }
  }
  for (const [key, expected] of Object.entries({catalog:1053, inventoried:1046, active:995, milling:948, seed:47,
    inventoryArea:9672.13, activeArea:9574.66, millingArea:9115.65, millingTons:563187.9696909501,
    validMillingArea:9115.65, pendingMillingArea:0, pendingConflicts:10, decisions:2})) near(g.totals[key], expected);
  const lot = id => g.catalog.find(r => r.codLote === id);
  const p = lot('99336');
  near(p.area, 8.91); near(p.tchEst2627, 65); near(p.tonEst2627, 579.15);
  near(p.tch, 67.147);
  assert.equal(p.plan.date.iso, '2026-12-24');
  assert.equal(p.provenance.proposedDate.raw, 46380);
  assert.equal(p.plan.cut, 'CORTE MECANICO');
  assert.equal(p.source.sourceDate, '2026-10-12');
  assert.equal(p.variedad, 'CP 72-2086');
  for (const [id, destination] of [['2003','Semilla'], ['1927','Molienda']]) {
    const r = lot(id);
    assert.equal(r.operationalDecision.destination, destination);
    assert.equal(r.operationalDecision.sourceSha256, AFORO_SOURCE_SHA);
    assert.equal(engine.participation(r).decision?.id, r.operationalDecision.id);
  }
  assert.equal(lot('2003').participatesMilling, false);
  near(lot('1927').millingEstimatedTons, 430.5);
  return snapshot;
}

export function readPreviewAforo(key) {
  if (!/^[a-f0-9]{64}$/.test(key || '')) throw Error('Approved aforo preview build key unavailable; no baseline fallback');
  const manifest = JSON.parse(fs.readFileSync(new URL('./preview-data/aforo-1101.manifest.json', import.meta.url)));
  const encrypted = fs.readFileSync(new URL('./preview-data/aforo-1101.enc', import.meta.url));
  assert.equal(hash(encrypted), manifest.encryptedSha256);
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), encrypted.subarray(0,12));
  decipher.setAuthTag(encrypted.subarray(12,28));
  const plain = gunzipSync(Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]));
  assert.equal(hash(plain), manifest.snapshotSha256);
  const snapshot = validatePreviewAforo(JSON.parse(plain));
  return {snapshot, manifest};
}

export function previewProductionFiles(snapshot, originalHistory) {
  validatePreviewAforo(snapshot);
  const crono = structuredClone(snapshot.production.operationalDataset.cronologico);
  crono.meta.previewGeneration = true;
  crono.meta.previewLabel = 'Preview · Aforo 26/27 aprobado';
  const history = structuredClone(originalHistory);
  // LKG requires a coherent trio. Only the envelope version changes; historical
  // rows, formulas, provenance and the original data version remain auditable.
  history.meta.sourceDataVersion = originalHistory.meta.dataVersion;
  history.meta.dataVersion = AFORO_VERSION;
  const release = {version:AFORO_VERSION, source:crono.meta.previewLabel, sheet:crono.meta.sheet,
    publishedAt:null, generated:crono.meta.generated, tchEst2627EffectiveDate:'2026-10-12',
    sourceSha256:AFORO_SOURCE_SHA, previewGeneration:true, cronologicoRows:1053, historicoRows:history.meta.rows};
  const files = new Map();
  for (const [kind, data, variable] of [['version',release,'CASUR_RELEASE'], ['cronologico',crono,'CASUR_REMOTE_CRONO'], ['historico',history,'CASUR_REMOTE_HISTORICO']]) {
    const json = JSON.stringify(data);
    files.set(`modules/produccion/data/${kind}.json`, Buffer.from(json + '\n'));
    files.set(`modules/produccion/data/${kind}.js`, Buffer.from(`window.${variable}=${json};\n`));
  }
  return files;
}
