// Local-only review server. No tunnel, deploy, user profile or dataset mutation.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const ref = option('--ref', null), port = Number(option('--port', '4381'));
const git = (...a) => execFileSync('git', a, {cwd:root, maxBuffer:64e6});
const head = git('rev-parse', ref || 'HEAD').toString().trim();
const cache = new Map();
const read = file => {
  if (!ref) return fs.readFileSync(path.join(root, file));
  if (!cache.has(file)) cache.set(file, git('show', head + ':' + file));
  return cache.get(file);
};
const manifest = JSON.parse(read('core/versions/runtime-assets.json'));
const tracked = (ref ? git('ls-tree','-r','--name-only',head) : git('ls-files')).toString().split(/\r?\n/);
const allowed = new Set([...Object.keys(manifest.assets), 'sw.js','manifest.webmanifest','core/versions/runtime-assets.json',
  ...tracked.filter(p => /^(modules\/(produccion|tch)\/data|master\/data|shared\/geo\/data)\/.*\.(json|js|geojson)$/.test(p))]);
const types = {'.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.geojson':'application/json', '.webmanifest':'application/manifest+json',
  '.png':'image/png', '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.woff2':'font/woff2'};
const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  let file;
  try { file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\//,'').replace(/^Negocios_de_Cana_CASUR_APP\//,''); }
  catch { res.writeHead(400).end(); return; }
  if (!file || file.endsWith('/')) file += 'index.html';
  if (file === '__maestro_preview.json') {
    res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({
      localOnly:true, ref:ref || 'working-tree', head, dirty:!ref && !!git('status','--porcelain').toString().trim(),
      dataVersion:JSON.parse(read('modules/produccion/data/version.json')).version,
    })); return;
  }
  if (!allowed.has(file) || file.includes('..') || file.includes('\\')) { res.writeHead(404).end('Not found'); return; }
  try {
    const bytes = read(file); res.writeHead(200, {'Content-Type':(types[path.extname(file)] || 'application/octet-stream') + (/\.(html|css|js|mjs|json)$/.test(file) ? '; charset=utf-8' : ''), 'Cache-Control':'no-store'});
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch { res.writeHead(404).end('Not found'); }
});
server.listen(port,'127.0.0.1',()=>console.log(`CASUR Fase 1 · ${head}\nhttp://127.0.0.1:${port}/Negocios_de_Cana_CASUR_APP/#/modulo/produccion\nSolo loopback; ${ref ? 'baseline inmutable '+ref : 'árbol de trabajo'}; Ctrl+C para detener.`));
