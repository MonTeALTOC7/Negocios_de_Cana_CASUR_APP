import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {readPreviewAforo, validatePreviewAforo} from '../tools/preview-aforo.mjs';

test('official integration excludes the private snapshot and preview cannot fall back to public data', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../tools/preview-data/aforo-1101.manifest.json', import.meta.url)));
  assert.equal(fs.existsSync(new URL('../tools/preview-data/aforo-1101.enc', import.meta.url)), false);
  assert.match(manifest.encryptedSha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.sourceSha256, 'aa9ab25b863dc399d5a6d445c0efe7907ca8956ef868429f308a404a46267fc6');
  assert.equal(manifest.catalog, 1053);
  assert.throws(() => readPreviewAforo(), /no baseline fallback/);
  assert.throws(() => readPreviewAforo('0'.repeat(64)), /ENOENT/);
  assert.throws(() => validatePreviewAforo({production:{}}));
});

function bootstrap(personal = false) {
  const listeners = {}, nodes = Object.fromEntries(['casurReleaseKind','casurSyncPill'].map(id => [id, {textContent:''}]));
  const source = fs.readFileSync(new URL('../tools/preview-bootstrap.js', import.meta.url), 'utf8');
  const data = {meta:{previewGeneration:true, dataVersion:'2026.10.25-aforo.1101'}, producers:[{details:[{codLote:'99336'}]}]};
  const applied = [];
  const window = {CRONO_DATA:data, CASUR_MASTER_OVERLAY:personal ? {dataVersion:'personal'} : null,
    addEventListener:(name, fn) => { listeners[name] = fn; },
    CASUR_APPLY_REPORT_ROWS:payload => {applied.push(payload);return {applied:true};}};
  const context = {window, document:{addEventListener(){}, getElementById:id=>nodes[id], querySelector:()=>null},
    structuredClone, MutationObserver:class {observe(){}}};
  vm.runInNewContext(source, context);
  listeners.load();
  return {applied, nodes};
}

test('first preview opening uses canonical operational presentation without an import or storage write', () => {
  const {applied, nodes} = bootstrap();
  assert.equal(applied.length, 1);
  assert.equal(applied[0].operationalDataset.catalog[0].codLote, '99336');
  assert.match(nodes.casurReleaseKind.textContent, /Preview.*Aforo 26\/27 aprobado/);
  assert.match(nodes.casurSyncPill.textContent, /12-oct-2026/);
  const source = fs.readFileSync(new URL('../tools/preview-bootstrap.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /indexedDB|localStorage|sessionStorage|\.put\(/);
});

test('preview bootstrap never replaces an existing personal generation', () => {
  assert.equal(bootstrap(true).applied.length, 0);
});
