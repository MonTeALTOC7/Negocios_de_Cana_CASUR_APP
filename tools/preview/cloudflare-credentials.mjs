// CASUR · Normalización y diagnóstico de credenciales de Cloudflare sin exponerlas.
// Motivo (intento 3, 25-Nov-2026): el secreto CLOUDFLARE_API_TOKEN contenía saltos de línea y
// Node rechazó el encabezado Authorization antes de enviarlo. Aquí se limpia el valor de forma
// determinista y, si es ambiguo, se detiene con un diagnóstico que nunca revela el contenido.

const TOKEN = /^[A-Za-z0-9_-]{30,}$/;
const NOISE = /^(authorization:?|bearer|-h|--header|header:?)$/i;

export function normalizeToken(raw) {
  if (!raw || !raw.trim()) throw Error('Falta CLOUDFLARE_API_TOKEN en el Environment «casur-preview»');
  const lines = raw.split(/\r?\n/).filter(l => l.trim()).length;
  const pieces = raw.split(/\s+/).filter(Boolean).map(p => p.replace(/^["'`]+|["'`,;]+$/g, ''));
  const removedPrefix = pieces.some(p => NOISE.test(p));
  const candidates = [...new Set(pieces.filter(p => !NOISE.test(p) && TOKEN.test(p)))];
  if (candidates.length !== 1) {
    throw Error(`CLOUDFLARE_API_TOKEN no es un token único: ${lines} línea(s) con contenido y ${candidates.length} valor(es) con forma de token. `
      + 'Guardar en el secreto solo el valor del token de API, en una línea, sin «Bearer» ni otros textos.');
  }
  const token = candidates[0];
  const notes = [];
  if (raw !== token) notes.push(`se limpiaron ${raw.length - token.length} carácter(es) ajenos al token`);
  if (lines > 1) notes.push(`el secreto tenía ${lines} líneas con contenido`);
  if (/\r|\n/.test(raw) && lines === 1) notes.push('el secreto tenía un salto de línea al inicio o al final');
  if (removedPrefix) notes.push('se quitó un prefijo «Bearer»/«Authorization»');
  return {token, notes, length: token.length};
}

export function normalizeAccount(raw) {
  const account = (raw || '').trim().toLowerCase();
  if (!account) throw Error('Falta CLOUDFLARE_ACCOUNT_ID en el Environment «casur-preview»');
  if (!/^[a-f0-9]{32}$/.test(account)) throw Error('CLOUDFLARE_ACCOUNT_ID no tiene el formato esperado (32 caracteres hexadecimales)');
  return account;
}

export function credentials(env = process.env) {
  const {token, notes, length} = normalizeToken(env.CLOUDFLARE_API_TOKEN);
  const account = normalizeAccount(env.CLOUDFLARE_ACCOUNT_ID);
  // GitHub enmascara cada línea del secreto original; también el valor normalizado.
  if (env.GITHUB_ACTIONS) console.log(`::add-mask::${token}`);
  return {token, account, notes, length};
}
