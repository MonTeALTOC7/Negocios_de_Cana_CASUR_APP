import fs from 'node:fs';
import { APP_VERSION, MODULE_VERSIONS, PRODUCTION_RELEASES, APP_RELEASES } from '../core/versions/versions.js';

const check = !process.argv.includes('--write');
const production = MODULE_VERSIONS.produccion;
if (APP_RELEASES[0].version !== APP_VERSION || PRODUCTION_RELEASES[0].moduleVersion !== production || PRODUCTION_RELEASES[0].appVersion !== APP_VERSION) throw new Error('Canonical release history mismatch');
let mismatches = 0;
function update(path, transform) {
  const original = fs.readFileSync(path,'utf8');
  const result = transform(original);
  if (original === result) return;
  if (check) { console.error(`Version mismatch: ${path} (run node tools/sync-versions.mjs --write)`); mismatches++; }
  else fs.writeFileSync(path,result);
}
update('sw.js', s => s.replace(/const APP_VERSION = '[^']+';/, `const APP_VERSION = '${APP_VERSION}';`));
update('index.html', s => s.replace(/id="appVersion">v[^<]+</, `id="appVersion">v${APP_VERSION}<`));
update('core/module-registry/registry.js', s => s.replace(/(moduleId: '([^']+)'[\s\S]*?version: )'[^']+'/g,(all,prefix,id) => MODULE_VERSIONS[id] ? `${prefix}'${MODULE_VERSIONS[id]}'` : all));
update('modules/produccion/package.json', s => s.replace(/"version": "[^"]+"/, `"version": "${production.slice(1)}"`));
update('modules/produccion/VERSION.txt', s => s.replace(/^V[\d.]+/,production));
update('modules/produccion/README_GITHUB.md', s => s.replace(/^# Producción Suertes CASUR · V[\d.]+/,`# Producción Suertes CASUR · ${production}`));
update('modules/produccion/index.html', s => {
  s = s.replace(/var VERSION='V[\d.]+';/,`var VERSION='${production}';`);
  return s.replace(/(<script id="casurEmbeddedPwaAssets"[^>]*>)([\s\S]*?)(<\/script>)/,(all,start,json,end) => {
    const assets = JSON.parse(json);
    for (const name of ['README_GITHUB.md','VERSION.txt']) {
      let content = fs.readFileSync(`modules/produccion/${name}`,'utf8').replace(/\r\n/g,'\n');
      // In check mode these files may themselves be stale; validate independently.
      content = content.replace(/^(# Producción Suertes CASUR · )?V[\d.]+/,(_,prefix='')=>prefix+production);
      assets[name] = Buffer.from(content).toString('base64');
    }
    return start + JSON.stringify(assets) + end;
  });
});
if (mismatches) process.exitCode = 1;
else console.log(check ? 'Derived versions consistent' : 'Derived versions synchronized');
