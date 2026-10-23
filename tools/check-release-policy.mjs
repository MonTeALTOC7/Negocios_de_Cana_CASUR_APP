import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

export function owners(path) {
  if (/(^|\/)(tests?|docs|tools|data|datos|fixtures|vendor)(\/|$)/.test(path) || /\.(md|txt)$/.test(path) || /(^|\/)AGENTS\.md$/.test(path)) return [];
  if (!/\.(js|mjs|html|css|json|svg|webmanifest)$/.test(path)) return [];
  const module = /^modules\/([^/]+)\//.exec(path)?.[1];
  if (module) return [module];
  // Shared runtime belongs to the shell release; module contracts must be reviewed in PR.
  if (/^(core|shared|master|private)\//.test(path) || ['app.js','sw.js','index.html','404.html','manifest.webmanifest'].includes(path)) return ['shell'];
  return [];
}
export function increased(before, after) {
  const parse = value => /^v?(\d+)\.(\d+)\.(\d+)$/i.exec(value)?.slice(1).map(Number);
  const a = parse(before), b = parse(after);
  if (!a || !b) return false; // Legacy migration requires an explicit exception.
  for (let i=0;i<3;i++) if (a[i] !== b[i]) return b[i] > a[i];
  return false;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.argv[2];
  if (!base) throw new Error('Usage: node tools/check-release-policy.mjs BASE_SHA');
  const git = args => execFileSync('git',args,{encoding:'utf8'}).trim();
  const old = await import('data:text/javascript;base64,'+Buffer.from(git(['show',`${base}:core/versions/versions.js`])).toString('base64'));
  const current = await import('../core/versions/versions.js');
  const paths = git(['diff','--name-only',base]).split('\n').filter(Boolean);
  paths.push(...git(['ls-files','--others','--exclude-standard']).split('\n').filter(Boolean));
  const exceptions = JSON.parse(fs.readFileSync('core/versions/release-exceptions.json','utf8'));
  const required = new Map();
  for (const path of paths) for (const owner of owners(path)) required.set(owner,[...(required.get(owner)||[]),path]);
  for (const [id, files] of required) {
    const before = id === 'shell' ? old.APP_VERSION : old.MODULE_VERSIONS[id];
    const after = id === 'shell' ? current.APP_VERSION : current.MODULE_VERSIONS[id];
    const exception = exceptions.find(item => item.base === base && item.owner === id && item.reason?.length >= 30 && files.every(path => item.paths?.includes(path)));
    if (!increased(before,after) && !exception) throw new Error(`${id} requires version increment (${before} → ${after}): ${files.join(', ')}`);
    const release=id==='shell'?current.APP_RELEASES?.[0]:current.MODULE_RELEASES?.[id]?.[0];
    if(!exception && (!release || (release.version||release.moduleVersion)!==after || !['PATCH','MINOR','MAJOR'].includes(release.type) || !release.changes?.length))throw new Error(`${id}: add release snapshot, classification and notes for ${after}`);
    console.log(`${id}: ${before} → ${after}${exception ? ' · EXCEPTION: '+exception.reason : ''}`);
  }
}
