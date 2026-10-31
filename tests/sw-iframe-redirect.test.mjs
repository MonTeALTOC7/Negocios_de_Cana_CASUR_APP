import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Regression for Cloudflare-style redirects on /modules/*/index.html.
// Chromium cannot safely consume a cached redirected HTML navigation as an iframe.
const sw = fs.readFileSync('sw.js','utf8');
const part = sw.match(/function normalizeNavigationRedirect\(response\) \{[\s\S]*?\n\}\n(?=async function installedNavigation)/)?.[0];
assert.ok(part,'Navigation response normalizer must exist');
const normalize = vm.runInNewContext(part+'\nnormalizeNavigationRedirect', {Response,Headers});

test('redirected HTML preserves bytes and MIME but loses redirect metadata',async()=>{
  const response=new Response('<!doctype html><title>Maestro CASUR</title>',{
    status:200,headers:{'content-type':'text/html; charset=utf-8','content-encoding':'gzip','content-length':'45'}
  });
  Object.defineProperty(response,'redirected',{value:true});
  const restored=normalize(response);
  assert.equal(restored.redirected,false);
  assert.equal(restored.status,200);
  assert.equal(restored.headers.get('content-type'),'text/html; charset=utf-8');
  assert.equal(restored.headers.get('content-encoding'),null);
  assert.equal(restored.headers.get('content-length'),null);
  assert.equal(await restored.text(),'<!doctype html><title>Maestro CASUR</title>');
});
test('unredirected responses are left untouched',()=>{
  const response=new Response('OK',{status:200});
  assert.strictEqual(normalize(response),response);
});
test('worker precache and iframe navigation both normalize redirected HTML',()=>{
  assert.match(sw,/cache\.put\(url,normalizeNavigationRedirect\(response\)\)/);
  assert.match(sw,/normalizeNavigationRedirect\(cached \|\| await networkFirst/);
});
