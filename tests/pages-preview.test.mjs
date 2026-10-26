import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PREVIEW_BRANCH, assertPreviewContext, buildPreview} from '../tools/build-pages-preview.mjs';

const head = '8e7d4e775ee1338909f7326ced5c2233adf23154';
test('preview refuses main, unverified Access and mismatched commits', () => {
  assert.throws(() => assertPreviewContext({branch:'main', head}), /authorized/);
  assert.throws(() => assertPreviewContext({branch:PREVIEW_BRANCH, head, cloudBuild:true}), /Access/);
  assert.throws(() => assertPreviewContext({branch:PREVIEW_BRANCH, head, reportedHead:'a'.repeat(40)}), /mismatch/);
  assert.doesNotThrow(() => assertPreviewContext({branch:PREVIEW_BRANCH, head, cloudBuild:true, accessConfirmed:'true'}));
});

test('preview copies verified runtime and explicit datasets, never financial workbooks or QA', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'casur-preview-test-'));
  try {
    const output = path.join(temporary, 'artifact');
    const metadata = buildPreview(output, {CF_PAGES_BRANCH:PREVIEW_BRANCH});
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'core/versions/runtime-assets.json')));
    for (const file of Object.keys(manifest.assets)) assert.ok(fs.existsSync(path.join(output, file)), file);
    assert.ok(metadata.files['shared/geo/data/zona-1-sur.geojson']);
    assert.ok(metadata.files['modules/produccion/data/cronologico.json']);
    assert.deepEqual(fs.readFileSync(path.join(output, 'sw.js')), fs.readFileSync(path.join(root, 'sw.js')));
    for (const file of Object.keys(metadata.files)) {
      assert.ok(!/(?:^|\/)(?:\.git|docs|tools|tests|node_modules)\/|\.(?:xlsx?|zip|env|bak)$/i.test(file), file);
      const hash = createHash('sha256').update(fs.readFileSync(path.join(output, file))).digest('hex');
      assert.equal(hash, metadata.files[file], file);
    }
    assert.ok(!fs.existsSync(path.join(output, 'modules/labores/datos')));
    assert.ok(!fs.existsSync(path.join(output, '.git')));
    assert.equal(JSON.parse(fs.readFileSync(path.join(output, '__preview.json'))).head, metadata.head);
    assert.throws(() => buildPreview(output, {CF_PAGES_BRANCH:PREVIEW_BRANCH}), /already exists/);
  } finally {
    const resolved = fs.realpathSync(temporary);
    assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
    assert.ok(path.basename(resolved).startsWith('casur-preview-test-'));
    fs.rmSync(resolved, {recursive:true});
  }
});
