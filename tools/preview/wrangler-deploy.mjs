// CASUR · Despliegue con Wrangler usando las credenciales normalizadas (nunca impresas).
//   node tools/preview/wrangler-deploy.mjs --dir <paquete> --branch <alias> --sha <40 hex>
// Escribe url, app_url y alias_url en $GITHUB_OUTPUT cuando se ejecuta en Actions.
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {credentials} from './cloudflare-credentials.mjs';
import {PROJECT, assertPreviewBranch} from './cloudflare-guard.mjs';

const arg = name => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : null; };
const dir = arg('dir'), branch = arg('branch'), sha = arg('sha');
const version = process.env.WRANGLER_VERSION || '4.159.0';
if (!/^[a-f0-9]{40}$/.test(sha || '')) throw Error('SHA inválido');
assertPreviewBranch(branch, 'main'); // la guarda «before» ya comparó con la rama de producción real
const {token, account} = credentials();

const args = ['--yes', `wrangler@${version}`, 'pages', 'deploy', dir, '--project-name', PROJECT, '--branch', branch,
  '--commit-hash', sha, '--commit-message', `Preview ${branch} ${sha.slice(0, 7)}`, '--commit-dirty=false'];
const env = {...process.env, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account, WRANGLER_SEND_METRICS: 'false', CI: 'true'};
let log = '';
const code = await new Promise(resolve => {
  const child = spawn('npx', args, {env, stdio: ['ignore', 'pipe', 'pipe']});
  const sink = chunk => { const text = chunk.toString().split(token).join('***'); log += text; process.stdout.write(text); };
  child.stdout.on('data', sink); child.stderr.on('data', sink);
  child.on('close', resolve);
});
if (process.env.RUNNER_TEMP) fs.writeFileSync(`${process.env.RUNNER_TEMP}/wrangler.log`, log);
if (code !== 0) throw Error(`Wrangler terminó con código ${code}`);
const url = (log.match(new RegExp(`https://[a-f0-9]{8}\\.${PROJECT}\\.pages\\.dev`)) || [])[0];
if (!url) throw Error('Wrangler no informó la URL del despliegue');
const out = {url, app_url: `${url}/Negocios_de_Cana_CASUR_APP/`, alias_url: `https://${branch}.${PROJECT}.pages.dev/Negocios_de_Cana_CASUR_APP/`};
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(out).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
console.log('DEPLOY_OK ' + JSON.stringify(out));
