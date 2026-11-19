/* ============================================================
   retheme-petroleo.mjs — Migración de color de los módulos al
   sistema "Petróleo · Pizarra" (shared/styles/tokens.css).

   Qué hace (solo CSS; nunca toca JavaScript ni datos):
     · Verdes y azules de marca  → azul petróleo (tono 190–200).
     · Grises neutros            → pizarra (tono 215).
     · Fondos muy claros         → gris azulado casi blanco.
     · Rojos, ámbar y dorado     → se conservan (estado/alerta).
     · Tipografías sans          → pila única Inter.
     · Radios de 15–59 px        → 12 px (las píldoras no cambian).

   Los colores definidos en JavaScript (gráficos, mapas, imágenes
   exportadas) NO se modifican: conservan su semántica de datos.

   Además, en cada index.html de módulo:
     · enlaza shared/styles/module-theme.css (tipografía Inter local);
     · retira los enlaces a Google Fonts (la app es offline-first).

   Uso:  node tools/retheme-petroleo.mjs            (aplica)
         node tools/retheme-petroleo.mjs --check    (solo informa)
   Es idempotente: volver a ejecutarlo no cambia el resultado.
   Después: node tools/runtime-assets.mjs --write
   ============================================================ */
import fs from 'node:fs';

const TARGETS = [
  'modules/tch/css/casur.css',
  'modules/tch/index.html',
  'modules/insumos/index.html',
  'modules/riego/assets/index-B0LwgFY-.css',
  'modules/riego/index.html',
  'modules/labores/assets/index-BY74yemB.css',
  'modules/labores/index.html',
  'modules/produccion/index.html',
  'modules/produccion/css/casur-upgrade.css',
  'modules/produccion/css/maestro-ux.css',
  'modules/inventario/index.html',
  'master/convertidor/css/styles.css',
  'master/convertidor/index.html',
  'private/conciliacion/index.html',
  'shared/geo/geo.css',
];

const FONT_STACK = 'Inter,"Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif';

/* ---------- Conversión de color ---------- */
function toHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const f = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)].map((v) => Math.round(v * 255));
}

/** Regla de mapeo: devuelve [r,g,b] en la paleta petróleo/pizarra. */
export function mapColor(r, g, b) {
  const [h, s, l] = toHsl(r, g, b);
  if (l > 0.985 || l < 0.02) return [r, g, b];                 // blanco y negro puros
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  if ((l > 0.93 || l < 0.07) && chroma <= 8) return [r, g, b];  // casi blanco / casi negro: sin tinte perceptible
  if (h >= 178 && h <= 228 && s >= 0.12 && s <= 0.60) return [r, g, b]; // ya está en la paleta (idempotencia)
  if (s < 0.12) {                                              // gris neutro o apenas teñido → pizarra
    return fromHsl(215, 0.16 + 0.14 * (2 * l - 1) ** 2, l);
  }
  if (h < 65 || h >= 320) return [r, g, b];                    // rojo, naranja, ámbar, dorado: se conservan
  if (l > 0.88) return fromHsl(208, Math.max(0.16, Math.min(s, 0.34) * 0.8), l); // tintes de fondo → gris azulado
  if (h >= 260) return fromHsl(220, Math.max(0.16, s * 0.45), l);              // violetas → pizarra
  const sat = Math.max(0.16, Math.min(s * 0.74, 0.56));
  if (h < 170) return fromHsl(190, sat, l);                    // verdes → petróleo verdoso
  return fromHsl(198 + Math.max(-6, Math.min(8, (h - 205) * 0.12)), sat, l); // azules → petróleo
}

const hex2 = (n) => n.toString(16).padStart(2, '0');

/* ---------- Transformación de un bloque de declaraciones ---------- */
function themeDeclarations(body, stats) {
  let out = body.replace(/#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-fA-F\w-])/g, (m, v) => {
    let alpha = '';
    if (v.length === 3 || v.length === 4) { alpha = v.length === 4 ? v[3] + v[3] : ''; v = v.slice(0, 3).split('').map((c) => c + c).join(''); }
    else if (v.length === 8) { alpha = v.slice(6); v = v.slice(0, 6); }
    const rgb = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
    const mapped = mapColor(...rgb);
    if (mapped.every((channel, i) => channel === rgb[i])) return m;   // sin cambio: se conserva el texto original
    stats.colors++;
    return '#' + mapped.map(hex2).join('') + alpha.toLowerCase();
  });
  out = out.replace(/(rgba?\(\s*)(\d{1,3})(\s*[, ]\s*)(\d{1,3})(\s*[, ]\s*)(\d{1,3})(?=\s*[,/)])/g, (m, fn, r, s1, g, s2, b) => {
    const next = mapColor(+r, +g, +b);
    if (next[0] !== +r || next[1] !== +g || next[2] !== +b) stats.colors++;
    return fn + next[0] + s1 + next[1] + s2 + next[2];
  });
  out = out.replace(/(font-family\s*:\s*)([^;}]+)/g, (m, head, value) => {
    if (/monospace|cursive|inherit|var\(/i.test(value)) return m;
    const important = /!important/.test(value) ? '!important' : '';
    if (value.replace(/\s*!important/, '').trim() !== FONT_STACK) stats.fonts++;
    return head + FONT_STACK + important;
  });
  const clamp = (text) => text.replace(/(\d+(?:\.\d+)?)px/g, (m, n) => (+n > 14 && +n < 60 ? (stats.radii++, '12px') : m));
  out = out.replace(/(border(?:-(?:top|bottom)-(?:left|right))?-radius\s*:\s*)([^;}]+)/g, (m, head, value) => head + clamp(value));
  out = out.replace(/(--(?:radius|r-lg|r-xl|r)\s*:\s*)([^;}]+)/g, (m, head, value) => head + clamp(value));
  return out;
}

const NO_STATS = () => ({ colors: 0, fonts: 0, radii: 0 });

/** Tematiza una hoja CSS completa. */
export function themeCss(css, stats = NO_STATS()) {
  // Solo los bloques de declaraciones más internos: nunca selectores (#id).
  return css.replace(/\{([^{}]*)\}/g, (m, body) => '{' + themeDeclarations(body, stats) + '}');
}

/** Tematiza los bloques <style> de un documento HTML (no toca scripts ni atributos). */
export function themeHtml(html, stats = NO_STATS()) {
  return html.replace(/(<style(?![^>]*type=["'](?!text\/css))[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, open, css, close) => open + themeCss(css, stats) + close);
}

export const THEME_LINK = '<link rel="stylesheet" href="../../shared/styles/module-theme.css">';

/** Retira los enlaces a Google Fonts de un documento. */
export function stripWebFonts(html) {
  return html
    .replace(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">/g, '')
    .replace(/<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>/g, '')
    .replace(/<link href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]*" rel="stylesheet">/g, '');
}

/** Enlaza la capa común de tema antes del primer </head> (una sola vez). */
export function linkTheme(html) {
  if (html.includes(THEME_LINK)) return html;
  const at = html.search(/<\/head>/i);
  return at < 0 ? html : html.slice(0, at) + THEME_LINK + '\n' + html.slice(at);
}

/** Migración completa de un index.html de módulo. */
export function migrateModuleHtml(html, stats = NO_STATS()) {
  return linkTheme(themeHtml(stripWebFonts(html), stats));
}

/* ---------- Ejecución ---------- */
if (process.argv[1] && process.argv[1].replaceAll('\\', '/').endsWith('tools/retheme-petroleo.mjs')) {
  const check = process.argv.includes('--check');
  for (const file of TARGETS) {
    if (!fs.existsSync(file)) { console.log('omitido (no existe):', file); continue; }
    const source = fs.readFileSync(file, 'utf8');
    const stats = { colors: 0, fonts: 0, radii: 0 };
    const result = file.endsWith('.html') ? migrateModuleHtml(source, stats) : themeCss(source, stats);
    if (!check && result !== source) fs.writeFileSync(file, result);
    console.log(`${check ? 'revisado' : 'aplicado'}: ${file} · colores ${stats.colors} · tipografías ${stats.fonts} · radios ${stats.radii}`);
  }
}
