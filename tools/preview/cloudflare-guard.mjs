// CASUR · Guardas de Cloudflare Pages para previews. Solo lectura de la API.
//   node tools/preview/cloudflare-guard.mjs before --branch <alias>
//   node tools/preview/cloudflare-guard.mjs after  --branch <alias> --sha <40 hex> --url <https://hash.proyecto.pages.dev>
// Requiere CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID en el entorno. Nunca imprime credenciales.
export const PROJECT = 'casur-maestro-ux-review';
const RESERVED = new Set(['main', 'master', 'production', 'prod', 'gh-pages']);

import {credentials} from './cloudflare-credentials.mjs';

const BASE = 'https://api.cloudflare.com/client/v4';
let creds;
async function call(url) {
  creds ??= credentials();
  const res = await fetch(url, {headers: {Authorization: `Bearer ${creds.token}`}});
  const body = await res.json().catch(() => ({}));
  return {status: res.status, ok: res.ok && body.success === true, body, codes: (body.errors || []).map(e => e.code)};
}
const detail = r => `HTTP ${r.status}, códigos ${JSON.stringify(r.codes)}: ${JSON.stringify((r.body.errors || []).map(e => e.message)).slice(0, 240)}`;

// Diagnóstico por capas: 1) token  2) cuenta  3) proyecto. Ninguna salida contiene la credencial.
export async function diagnose() {
  creds ??= credentials();
  console.log(`Credenciales: token de ${creds.length} caracteres${creds.notes.length ? ' (' + creds.notes.join('; ') + ')' : ''}; Account ID con formato válido`);
  const user = await call(`${BASE}/user/tokens/verify`);
  const acct = user.ok ? user : await call(`${BASE}/accounts/${creds.account}/tokens/verify`);
  if (!acct.ok) throw Error(`TOKEN: Cloudflare no reconoce el token como válido (${detail(acct)}). Crear un token nuevo y guardarlo en el secreto`);
  const status = acct.body.result?.status;
  if (status !== 'active') throw Error(`TOKEN: estado «${status}» (debe ser «active»)`);
  console.log(`TOKEN_OK estado=active (${user.ok ? 'token de usuario' : 'token de cuenta'})`);
  const project = await call(`${BASE}/accounts/${creds.account}/pages/projects/${PROJECT}`);
  if (!project.ok) {
    if (project.status === 403 || project.codes.includes(10000) || project.codes.includes(9109))
      throw Error(`PERMISOS: el token no tiene «Account · Cloudflare Pages · Edit» sobre esta cuenta (${detail(project)})`);
    if (project.status === 404 || project.codes.includes(8000007))
      throw Error(`CUENTA/PROYECTO: «${PROJECT}» no existe en la cuenta indicada; revisar CLOUDFLARE_ACCOUNT_ID (${detail(project)})`);
    throw Error(`PROYECTO: ${detail(project)}`);
  }
  console.log(`PROJECT_OK ${project.body.result.name} rama_produccion=${project.body.result.production_branch}`);
  return project.body.result;
}

async function api(path) {
  creds ??= credentials();
  const r = await call(`${BASE}/accounts/${creds.account}/pages/projects/${PROJECT}${path}`);
  if (!r.ok) throw Error(`API Cloudflare ${detail(r)}`);
  return r.body.result;
}

export function assertPreviewBranch(branch, productionBranch) {
  if (!/^[a-z0-9][a-z0-9-]{0,27}$/.test(branch)) throw Error('Alias de rama inválido: ' + branch);
  if (RESERVED.has(branch)) throw Error('Alias reservado para producción: ' + branch);
  if (!productionBranch) throw Error('El proyecto no declara rama de producción; se cancela por seguridad');
  if (branch === productionBranch.toLowerCase()) throw Error('El alias coincide con la rama de producción del proyecto');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [mode] = process.argv.slice(2);
  const arg = name => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : null; };
  const branch = arg('branch');
  const project = mode === 'before' ? await diagnose() : await api('');
  if (project.name !== PROJECT) throw Error('Proyecto inesperado');
  assertPreviewBranch(branch, project.production_branch);
  if (mode === 'before') {
    console.log(`GUARD_OK proyecto=${PROJECT} rama_produccion=${project.production_branch} alias_preview=${branch}`);
  } else if (mode === 'after') {
    const sha = arg('sha'), host = new URL(arg('url')).hostname;
    const list = await api('/deployments?env=preview&per_page=25');
    const dep = list.find(d => new URL(d.url).hostname === host);
    if (!dep) throw Error('No se encontró el despliegue en la lista de previews: ' + host);
    if (dep.environment !== 'preview') throw Error('El despliegue no es de tipo preview: ' + dep.environment);
    if (dep.deployment_trigger?.metadata?.commit_hash !== sha) throw Error('El despliegue no corresponde al SHA solicitado');
    console.log(`DEPLOYMENT_OK id=${dep.id} entorno=${dep.environment} sha=${sha} alias=${(dep.aliases || []).join(',')}`);
  } else throw Error('Modo desconocido: ' + mode);
}
