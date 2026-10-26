import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readPreviewAforo, previewProductionFiles} from './preview-aforo.mjs';

export const PREVIEW_BRANCH = 'codex/estimados-plan-consulta-b2';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const normalized = (file, bytes) => /\.(?:html|css|js|mjs|svg)$/.test(file)
  ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')) : bytes;
const dataFiles = [
  'modules/produccion/data/version.json', 'modules/produccion/data/version.js',
  'modules/produccion/data/cronologico.json', 'modules/produccion/data/cronologico.js',
  'modules/produccion/data/historico.json', 'modules/produccion/data/historico.js',
  'modules/tch/data/productores.json', 'modules/tch/data/suertes.json',
  'modules/insumos/data/bootstrap.json', 'modules/insumos/data/metadata.json',
  'modules/riego/bootstrap.json', 'modules/riego/data/bootstrap.json',
  'modules/labores/data/seguimiento.json',
  'shared/geo/data/manifest.json', 'shared/geo/data/zona-1-sur.geojson',
  'shared/geo/data/zona-2-centro.geojson', 'shared/geo/data/zona-3-norte.geojson',
  'shared/geo/data/zona-5-productores.geojson',
];

export function assertPreviewContext({branch, head, reportedHead, cloudBuild, accessConfirmed}) {
  if (branch !== PREVIEW_BRANCH) throw Error('Only the authorized PR45 preview branch can be built');
  if (!/^[a-f0-9]{40}$/.test(head) || (reportedHead && reportedHead !== head)) throw Error('Preview commit mismatch');
  if (cloudBuild && accessConfirmed !== 'true') throw Error('Cloudflare Access must be verified before enabling deployment');
}

export function buildPreview(output, env = process.env, aforo = null) {
  const git = (...args) => execFileSync('git', args, {cwd:root, encoding:'utf8'}).trim();
  const head = git('rev-parse', 'HEAD');
  const branch = env.CF_PAGES_BRANCH || git('branch', '--show-current');
  assertPreviewContext({branch, head, reportedHead:env.CF_PAGES_COMMIT_SHA,
    cloudBuild:env.CF_PAGES === '1', accessConfirmed:env.CASUR_PREVIEW_ACCESS_CONFIRMED});
  if (env.CF_PAGES === '1') aforo = readPreviewAforo(env.CASUR_PREVIEW_SNAPSHOT_KEY);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'core/versions/runtime-assets.json'), 'utf8'));
  const tracked = new Set(execFileSync('git', ['ls-files', '-z'], {cwd:root, encoding:'utf8'}).split('\0'));
  // Preserve every verified executable asset. Never copy a directory recursively.
  const files = [...new Set([...Object.keys(manifest.assets), ...dataFiles,
    'sw.js', 'manifest.webmanifest', 'core/versions/runtime-assets.json', 'modules/produccion/VERSION.txt'])].sort();
  const bytesByPath = new Map();
  for (const file of files) {
    if (!tracked.has(file) || path.isAbsolute(file) || file.split('/').includes('..') || /(?:^|\/)\.|\.(?:xlsx?|xlsm|zip|bak|pem|key|env)$/i.test(file)) throw Error(`Unsafe preview asset: ${file}`);
    const source = path.join(root, file);
    if (!fs.lstatSync(source).isFile()) throw Error(`Preview asset is not a regular file: ${file}`);
    const bytes = fs.readFileSync(source);
    if (manifest.assets[file] && digest(normalized(file, bytes)) !== manifest.assets[file]) throw Error(`Runtime hash mismatch: ${file}`);
    bytesByPath.set(file, bytes);
  }
  if (aforo) {
    const history = JSON.parse(bytesByPath.get('modules/produccion/data/historico.json'));
    for (const [file, bytes] of previewProductionFiles(aforo.snapshot, history)) bytesByPath.set(file, bytes);
    const htmlPath = 'modules/produccion/index.html';
    const bootstrap = fs.readFileSync(new URL('./preview-bootstrap.js', import.meta.url), 'utf8');
    const html = bytesByPath.get(htmlPath).toString('utf8');
    if (!html.includes('</body>')) throw Error('Preview bootstrap insertion point missing');
    bytesByPath.set(htmlPath, Buffer.from(html.replace('</body>', `<script>\n${bootstrap}\n</script>\n</body>`)));
    // Rehash the derived HTML; all 163 runtime resources remain verified at install.
    const derivedManifest = structuredClone(manifest);
    for (const file of Object.keys(derivedManifest.assets)) {
      derivedManifest.assets[file] = digest(normalized(file, bytesByPath.get(file)));
    }
    bytesByPath.set('core/versions/runtime-assets.json', Buffer.from(JSON.stringify(derivedManifest, null, 2) + '\n'));
  }
  // A build is never allowed to replace an existing artifact or the working tree.
  const destination = path.resolve(output);
  if (destination === root || root.startsWith(destination + path.sep)) throw Error('Unsafe preview output');
  if (fs.existsSync(destination)) throw Error('Preview output already exists; preserve it and use a fresh build directory');
  fs.mkdirSync(destination, {recursive:true});
  for (const [file, bytes] of bytesByPath) {
    const target = path.join(destination, file);
    fs.mkdirSync(path.dirname(target), {recursive:true}); fs.writeFileSync(target, bytes);
  }
  // Pages canonicalizes .html with HTTP redirects. A redirected cached Response
  // cannot be returned for a browser navigation by the existing service worker.
  const htmlRoutes = files.filter(file => file.endsWith('.html')).map(file => {
    const target = file === 'index.html' ? '/' : file.endsWith('/index.html')
      ? '/' + file.slice(0, -10) : '/' + file.slice(0, -5);
    return `/${file} ${target} 200`;
  });
  fs.writeFileSync(path.join(destination, '_redirects'), htmlRoutes.join('\n') + '\n');
  // A fixed hosting marker triggers one normal SW reinstall for previews that
  // cached the initial redirected HTML. Logic, version, data and caches survive.
  const hostingMarker = '\n/* Cloudflare preview HTML routing compatibility v1. */\n' +
    (aforo ? `/* Approved preview snapshot ${aforo.manifest.snapshotSha256} */\n` : '');
  const swBytes = Buffer.concat([bytesByPath.get('sw.js'), Buffer.from(hostingMarker)]);
  fs.writeFileSync(path.join(destination, 'sw.js'), swBytes);
  bytesByPath.set('sw.js', swBytes);
  const metadata = {project:'casur-negocios-preview', branch, head, appVersion:manifest.appVersion,
    ...(aforo ? {aforo:{dataVersion:aforo.snapshot.production.dataVersion, sourceSha256:aforo.manifest.sourceSha256,
      snapshotSha256:aforo.manifest.snapshotSha256, sourceDate:aforo.manifest.sourceDate}} : {}),
    files:Object.fromEntries([...bytesByPath].map(([file, bytes]) => [file, digest(bytes)]))};
  fs.writeFileSync(path.join(destination, '__preview.json'), JSON.stringify(metadata, null, 2) + '\n');
  fs.writeFileSync(path.join(destination, '_headers'), '/*\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n/sw.js\n  Cache-Control: no-cache\n/core/versions/runtime-assets.json\n  Cache-Control: no-cache\n/__preview.json\n  Cache-Control: no-store\n');
  console.log(`Preview artifact: ${head}; ${files.length} source files; ${destination}`);
  return metadata;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv[2] || path.join(root, 'preview-dist');
  buildPreview(output, process.env, readPreviewAforo(process.env.CASUR_PREVIEW_SNAPSHOT_KEY));
  execFileSync(process.execPath, [path.join(root, 'tools/verify-preview-aforo.mjs'), output], {cwd:root, stdio:'inherit'});
}
