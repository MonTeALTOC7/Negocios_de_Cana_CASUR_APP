// Previews automatizadas: paquete reproducible, integridad y guardas de producción.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {buildPreview, checksums, PREFIX} from '../tools/preview/build-preview.mjs';
import {assertPreviewBranch, PROJECT} from '../tools/preview/cloudflare-guard.mjs';

test('el paquete de preview del HEAD es reproducible, íntegro y sin archivos internos', () => {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'casur-preview-test-'));
  try {
    const a = buildPreview({sha, out: path.join(tmp, 'a'), pr: 1, ref: 'test'});
    const b = buildPreview({sha, out: path.join(tmp, 'b'), pr: 1, ref: 'test'});
    assert.equal(checksums(a.output), checksums(b.output));
    assert.equal(a.metadata.head, sha);
    const meta = JSON.parse(fs.readFileSync(path.join(a.output, PREFIX, '__preview.json')));
    assert.equal(meta.head, sha);
    assert.ok(fs.readFileSync(path.join(a.output, '_headers'), 'utf8').includes('X-Robots-Tag: noindex'));
    const listed = checksums(a.output);
    assert.doesNotMatch(listed, /\/(docs|tools|tests|\.github)\/|\.(xlsx?|zip|enc|pem|key)$/m);
    assert.ok(listed.includes(`./${PREFIX}/modules/produccion/data/cronologico.json`));
    assert.throws(() => buildPreview({sha, out: a.output}), /ya existe/);
    assert.throws(() => buildPreview({sha: 'abc', out: path.join(tmp, 'c')}), /SHA completo/);
  } finally { fs.rmSync(tmp, {recursive: true, force: true}); }
});

test('la guarda impide desplegar producción o fuera del proyecto autorizado', () => {
  assert.equal(PROJECT, 'casur-maestro-ux-review');
  assert.doesNotThrow(() => assertPreviewBranch('pr-73', 'main'));
  assert.throws(() => assertPreviewBranch('main', 'main'), /reservado/);
  assert.throws(() => assertPreviewBranch('pr-73', 'pr-73'), /producción/);
  assert.throws(() => assertPreviewBranch('pr-73', ''), /seguridad/);
  assert.throws(() => assertPreviewBranch('Fix/x', 'main'), /inválido/);
});

test('el workflow de previews solo usa disparadores confiables y el Environment protegido', () => {
  const wf = fs.readFileSync('.github/workflows/casur-preview-deploy.yml', 'utf8');
  assert.doesNotMatch(wf, /^  pull_request/m, 'sin disparadores de PR (código no confiable)');
  assert.match(wf, /branches: \['preview-deploy\/\*\*'\]/);
  assert.match(wf, /name: casur-preview/);
  assert.match(wf, /PROJECT: casur-maestro-ux-review/);
  assert.match(wf, /cloudflare-guard\.mjs before/);
  assert.doesNotMatch(wf, /echo .*secrets\./);
});

test('las credenciales se normalizan sin ambigüedad y nunca se aceptan valores dudosos', async () => {
  const {normalizeToken, normalizeAccount} = await import('../tools/preview/cloudflare-credentials.mjs');
  const t = 'Ab3_' + 'x'.repeat(36);
  assert.equal(normalizeToken(t).token, t);
  assert.equal(normalizeToken(t + '\n').token, t);
  assert.equal(normalizeToken('\r\n  ' + t + '  \r\n').token, t);
  assert.equal(normalizeToken('Bearer ' + t).token, t);
  assert.equal(normalizeToken('Authorization: Bearer ' + t + '\n').token, t);
  assert.equal(normalizeToken(t + '\n' + t + '\n').token, t);
  assert.match(normalizeToken(t + '\n').notes.join(' '), /salto de línea/);
  assert.throws(() => normalizeToken(t + '\n' + 'Zz9-' + 'y'.repeat(36)), /no es un token único/);
  assert.throws(() => normalizeToken('corto'), /no es un token único/);
  assert.throws(() => normalizeToken(''), /Falta CLOUDFLARE_API_TOKEN/);
  try { normalizeToken('secreto-' + 'q'.repeat(20) + '\notro-' + 'w'.repeat(30)); } catch (e) { assert.doesNotMatch(e.message, /qqqq|wwww/); }
  assert.equal(normalizeAccount(' 0123456789ABCDEF0123456789abcdef\n'), '0123456789abcdef0123456789abcdef');
  assert.throws(() => normalizeAccount('123'), /formato/);
});
