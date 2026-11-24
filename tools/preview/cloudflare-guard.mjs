// CASUR · Guardas de Cloudflare Pages para previews. Solo lectura de la API.
//   node tools/preview/cloudflare-guard.mjs before --branch <alias>
//   node tools/preview/cloudflare-guard.mjs after  --branch <alias> --sha <40 hex> --url <https://hash.proyecto.pages.dev>
// Requiere CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID en el entorno. Nunca imprime credenciales.
export const PROJECT = 'casur-maestro-ux-review';
const RESERVED = new Set(['main', 'master', 'production', 'prod', 'gh-pages']);

async function api(path) {
  const token = process.env.CLOUDFLARE_API_TOKEN, account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) throw Error('Faltan CLOUDFLARE_API_TOKEN o CLOUDFLARE_ACCOUNT_ID en el Environment «casur-preview»');
  if (!/^[a-f0-9]{32}$/.test(account)) throw Error('CLOUDFLARE_ACCOUNT_ID no tiene el formato esperado (32 hex)');
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${PROJECT}${path}`,
    {headers: {Authorization: `Bearer ${token}`}});
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.success) throw Error(`API Cloudflare ${res.status}: ${JSON.stringify(body.errors || []).slice(0, 300)}`);
  return body.result;
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
  const project = await api('');
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
