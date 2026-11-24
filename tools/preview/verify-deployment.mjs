// CASUR · Verificación HTTP y byte a byte de una preview desplegada frente al paquete local.
//   node tools/preview/verify-deployment.mjs --url https://<hash>.casur-maestro-ux-review.pages.dev --dir <paquete> --sha <40 hex>
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {PREFIX} from './build-preview.mjs';

const arg = name => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : null; };
const base = new URL(arg('url')); const dir = path.resolve(arg('dir')); const sha = arg('sha');
if (!/^https:\/\/[a-z0-9-]+\.casur-maestro-ux-review\.pages\.dev\/?$/.test(base.href)) throw Error('URL fuera del proyecto autorizado: ' + base.href);
const sha256 = b => createHash('sha256').update(b).digest('hex');
const app = new URL(PREFIX + '/', base);

async function get(url, tries = 6) {
  for (let i = 1; ; i++) {
    const res = await fetch(url, {redirect: 'follow', headers: {'cache-control': 'no-cache'}}).catch(e => ({ok: false, status: e.message}));
    if (res.ok) return res;
    if (i >= tries) throw Error(`HTTP ${res.status} en ${url}`);
    await new Promise(r => setTimeout(r, 5000 * i)); // propagación del despliegue
  }
}

const meta = await (await get(new URL('__preview.json', app))).json();
if (meta.head !== sha) throw Error(`__preview.json.head=${meta.head}, se esperaba ${sha}`);
const root = await fetch(base, {redirect: 'manual'});
if (![301, 302, 307, 308].includes(root.status) || !String(root.headers.get('location')).includes(PREFIX)) throw Error('La raíz no redirige a la aplicación');
const appRes = await get(app);
if (!/noindex/i.test(appRes.headers.get('x-robots-tag') || '')) throw Error('Falta X-Robots-Tag noindex');

const files = [];
const walk = d => { for (const e of fs.readdirSync(d, {withFileTypes: true})) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : files.push(path.relative(dir, p).split(path.sep).join('/')); } };
walk(path.join(dir, PREFIX));
let checked = 0; const bad = [];
const queue = [...files];
await Promise.all(Array.from({length: 8}, async () => {
  while (queue.length) {
    const rel = queue.shift();
    const url = new URL(rel.replace(/(^|\/)index\.html$/, '$1'), base);
    const body = Buffer.from(await (await get(url)).arrayBuffer());
    if (sha256(body) !== sha256(fs.readFileSync(path.join(dir, rel)))) bad.push(rel);
    checked++;
  }
}));
if (bad.length) throw Error('Contenido publicado distinto del paquete: ' + bad.slice(0, 10).join(', '));
const version = JSON.parse(fs.readFileSync(path.join(dir, PREFIX, 'modules/produccion/data/version.json')));
console.log(`HTTP_OK ${checked} archivos idénticos · head=${sha} · datos=${version.version} · aforo=${version.tchEst2627EffectiveDate} · generado=${version.generated}`);
