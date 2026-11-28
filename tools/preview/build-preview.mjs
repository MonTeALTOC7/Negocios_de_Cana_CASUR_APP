// CASUR · Construcción reproducible del paquete de preview desde un SHA de Git.
// Lee cada archivo como blob de Git (no del árbol de trabajo), verifica el manifiesto de
// runtime y la integridad de datos de Producción, y escribe un artefacto estático para
// Cloudflare Pages. Nunca despliega. Uso:
//   node tools/preview/build-preview.mjs --sha <40 hex> --out <dir nuevo> [--pr N] [--ref rama] [--sums archivo]
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

export const PREFIX = 'Negocios_de_Cana_CASUR_APP';
export const HEADERS = '/*\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n'
  + `/${PREFIX}/sw.js\n  Cache-Control: no-cache\n/${PREFIX}/core/versions/runtime-assets.json\n  Cache-Control: no-cache\n/${PREFIX}/__preview.json\n  Cache-Control: no-store\n`;
export const REDIRECTS = `/  /${PREFIX}/  302\n`;
const TEXT = /\.(?:html|css|js|mjs|svg|webmanifest)$/;
const DATA = /^(modules\/(produccion|tch)\/data|master\/data|shared\/geo\/data)\/.*\.(json|js|geojson)$/;
const FORBIDDEN = /(^|\/)(docs|tools|tests|\.git|\.github|node_modules)(\/|$)|\.(zip|xlsx?|xlsm|pem|key|bak|env|enc)$/i;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const normalized = (file, bytes) => TEXT.test(file) ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')) : bytes;

export function buildPreview({sha, out, pr = null, ref = null, cwd = process.cwd()}) {
  const git = (...args) => execFileSync('git', args, {cwd, maxBuffer: 256e6});
  if (!/^[a-f0-9]{40}$/.test(sha)) throw Error('Se requiere un SHA completo de 40 caracteres');
  if (git('rev-parse', '--verify', sha + '^{commit}').toString().trim() !== sha) throw Error('SHA no encontrado: ' + sha);
  const output = path.resolve(out);
  if (fs.existsSync(output)) throw Error('El directorio de salida ya existe; use uno nuevo');
  const read = file => git('show', `${sha}:${file}`);
  const manifest = JSON.parse(read('core/versions/runtime-assets.json'));
  const tracked = new Set(git('ls-tree', '-r', '--name-only', sha).toString().trim().split('\n'));
  const files = [...new Set([...Object.keys(manifest.assets), 'sw.js', 'manifest.webmanifest',
    'core/versions/runtime-assets.json', ...[...tracked].filter(p => DATA.test(p))])].sort();

  const blobs = new Map();
  for (const file of files) {
    if (!tracked.has(file)) throw Error('Activo del manifiesto no versionado: ' + file);
    if (file.includes('..') || file.includes('\\') || FORBIDDEN.test(file)) throw Error('Archivo no permitido en la preview: ' + file);
    blobs.set(file, read(file));
  }
  // 1) Integridad de código: cada activo debe coincidir con runtime-assets.json del mismo SHA.
  const mismatched = Object.entries(manifest.assets).filter(([file, hash]) => sha256(normalized(file, blobs.get(file))) !== hash).map(([f]) => f);
  if (mismatched.length) throw Error('Hash de runtime distinto: ' + mismatched.join(', '));
  // 2) Integridad de datos oficiales de Producción (integrity.json del mismo SHA).
  const dataDir = 'modules/produccion/data/';
  const integrity = JSON.parse(blobs.get(dataDir + 'integrity.json'));
  const version = JSON.parse(blobs.get(dataDir + 'version.json'));
  for (const [name, hash] of Object.entries(integrity.files)) {
    const bytes = Buffer.from(blobs.get(dataDir + name).toString('utf8').replace(/\r\n/g, '\n'));
    if (sha256(bytes) !== hash) throw Error('Integridad de datos distinta: ' + name);
  }
  if (integrity.dataVersion !== version.version) throw Error('integrity.json y version.json no coinciden');

  for (const [file, bytes] of blobs) {
    const target = path.join(output, PREFIX, file);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, bytes);
  }
  const metadata = {head: sha, repository: 'MonTeALTOC7/Negocios_de_Cana_CASUR_APP', branch: ref, pullRequest: pr,
    appVersion: manifest.appVersion, files: blobs.size, publicPreview: true, dataVersion: version.version,
    aforoDate: version.tchEst2627EffectiveDate ?? null, consolidated: version.generated ?? null,
    integrity: {runtimeAssets: Object.keys(manifest.assets).length, productionData: Object.keys(integrity.files).length}};
  fs.writeFileSync(path.join(output, PREFIX, '__preview.json'), JSON.stringify(metadata, null, 2) + '\n');
  fs.writeFileSync(path.join(output, '_redirects'), REDIRECTS);
  fs.writeFileSync(path.join(output, '_headers'), HEADERS);
  return {output, metadata};
}

export function checksums(dir) {
  const list = [];
  const walk = d => { for (const e of fs.readdirSync(d, {withFileTypes: true})) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : list.push(p); } };
  walk(dir);
  return list.map(p => './' + path.relative(dir, p).split(path.sep).join('/')).sort()
    .map(rel => `${sha256(fs.readFileSync(path.join(dir, rel)))}  ${rel}`).join('\n') + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = name => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : null; };
  const {output, metadata} = buildPreview({sha: arg('sha'), out: arg('out'), pr: arg('pr') ? Number(arg('pr')) : null, ref: arg('ref')});
  const sums = checksums(output);
  if (arg('sums')) fs.writeFileSync(arg('sums'), sums);
  console.log(JSON.stringify({...metadata, output, packageFiles: sums.trim().split('\n').length}));
}
