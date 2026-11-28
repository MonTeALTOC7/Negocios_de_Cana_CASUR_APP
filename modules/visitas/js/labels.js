/* Evidencias institucionales (canvas). Los originales nunca se modifican: aquí solo se generan copias.
   - Foto etiquetada: banda inferior compacta con la información esencial; no tapa el centro de la imagen.
   - Tarjeta de hallazgo (1080 px de ancho): 1, 2 o varias fotos, datos agronómicos útiles, observación, detalles
     evaluados, recomendaciones y minimapa vectorial. Los campos vacíos se omiten; la severidad solo aparece si el
     técnico la evaluó; las coordenadas solo si son verificables. */
import {iconPaths} from './icons.js';
import {category, filledDetails} from './catalog.js';
import {agroCard, ageLabel} from './agro.js';
import {locationLabel} from './photos.js';

const C = {petrol900: '#0F2A33', petrol800: '#143A46', petrol700: '#1B4D5C', petrol600: '#23647A', petrol500: '#2F7E97', petrol100: '#DCEBF0', petrol50: '#EEF5F7',
  ink: '#0B1720', soft: '#475569', line: '#D5DEE4', white: '#FFFFFF', gold: '#F4C542', sev: {Baja: '#2E7D5B', Media: '#B7791F', Alta: '#B42318'}};
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const fdate = iso => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}` : ''; };
export const ftime = iso => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''; };
const coord = (v, pos, neg) => `${Math.abs(v).toFixed(5)}° ${v >= 0 ? pos : neg}`;
export const coordsText = loc => loc && Number.isFinite(loc.lat) && loc.source !== 'none' ? `${coord(loc.lat, 'N', 'S')} · ${coord(loc.lon, 'E', 'O')}${Number.isFinite(loc.accuracy) ? ` · ±${loc.accuracy} m` : ''}` : '';
const FONT = '"Inter", "Segoe UI", system-ui, sans-serif';

let logoP = null;
function logo() {
  logoP ??= new Promise(resolve => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => resolve(null); i.src = new URL('../../../shared/assets/brand/casur-logo.png', import.meta.url).href; });
  return logoP;
}
async function fonts() { try { await Promise.all(['400', '600', '700', '800'].map(w => document.fonts.load(`${w} 24px Inter`))); } catch { /* fuente del sistema */ } }
async function bitmap(blob) { try { return await createImageBitmap(blob, {imageOrientation: 'from-image'}); } catch { return null; } }
const font = (w, px) => `${w} ${Math.round(px)}px ${FONT}`;
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text; while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
function wrap(ctx, text, maxW, maxLines = 99) {
  const out = []; for (const para of String(text || '').split('\n')) {
    let line = ''; for (const w of para.split(/\s+/).filter(Boolean)) { const t = line ? line + ' ' + w : w; if (line && ctx.measureText(t).width > maxW) { out.push(line); line = w; } else line = t; }
    if (line) out.push(line);
  }
  if (out.length > maxLines) { const cut = out.slice(0, maxLines); cut[maxLines - 1] = fit(ctx, cut[maxLines - 1] + ' …', maxW); return cut; }
  return out;
}
/** Dibuja un icono del set propio (trazo) escalado a `size` px. */
export function drawIcon(ctx, name, x, y, size, color, width = 1.9) {
  const svg = iconPaths[name] || iconPaths.otros;
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 24, size / 24); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const m of svg.matchAll(/<(path|circle|rect|ellipse)\s([^>]*)\/>/g)) {
    const a = Object.fromEntries([...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(x => [x[1], x[2]])), p = new Path2D();
    if (m[1] === 'path') p.addPath(new Path2D(a.d));
    else if (m[1] === 'circle') p.arc(+a.cx, +a.cy, +a.r, 0, Math.PI * 2);
    else if (m[1] === 'ellipse') p.ellipse(+a.cx, +a.cy, +a.rx, +a.ry, 0, 0, Math.PI * 2);
    else { if (p.roundRect) p.roundRect(+a.x, +a.y, +a.width, +a.height, +(a.rx || 0)); else p.rect(+a.x, +a.y, +a.width, +a.height); }
    ctx.stroke(p);
  }
  ctx.restore();
}
const toBlob = (canvas, type = 'image/jpeg', q = 0.92) => new Promise(r => canvas.toBlob(r, type, q));

/* ---------- Foto etiquetada ---------- */
export async function labeledPhoto({photo, visit, finding = null, record = null, author = ''}) {
  await fonts();
  const bmp = await bitmap(photo.blob); if (!bmp) throw Error('Formato de imagen no compatible para etiquetar');
  const scale = Math.min(1, 2048 / Math.max(bmp.width, bmp.height)), W = Math.round(bmp.width * scale), H = Math.round(bmp.height * scale);
  const short = Math.min(W, H), bh = Math.round(Math.max(118, short * (W >= H ? 0.2 : 0.17))), p = Math.round(bh * 0.13);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H + 0;
  const ctx = canvas.getContext('2d'); ctx.drawImage(bmp, 0, 0, W, H); bmp.close?.();
  const g = ctx.createLinearGradient(0, H - bh * 1.35, 0, H); g.addColorStop(0, 'rgba(10,30,37,0)'); g.addColorStop(0.3, 'rgba(10,30,37,0.78)'); g.addColorStop(1, 'rgba(10,30,37,0.94)');
  ctx.fillStyle = g; ctx.fillRect(0, H - bh * 1.35, W, bh * 1.35);
  // Logo institucional a la derecha, sobre placa blanca.
  const lg = await logo(), lh = Math.round(bh * 0.36), lw = lg ? Math.round(lh * lg.width / lg.height) : 0, boxW = lw + p, boxH = lh + p * 0.8;
  const bx = W - p - boxW, by = H - bh + p * 0.6;
  if (lg) { ctx.fillStyle = 'rgba(255,255,255,0.95)'; rr(ctx, bx, by, boxW, boxH, p * 0.5); ctx.fill(); ctx.drawImage(lg, bx + p / 2, by + p * 0.4, lw, lh); }
  ctx.fillStyle = '#E3EEF2'; ctx.font = font(600, bh * 0.1); ctx.textAlign = 'right'; ctx.fillText('Negocios de Caña · CASUR', W - p, by + boxH + bh * 0.16); ctx.textAlign = 'left';
  // Bloque de texto.
  const cat = finding ? category(finding.category) : null, maxW = W - p * 3 - boxW;
  let y = H - bh + p * 0.55, x = p;
  const chipH = Math.round(bh * 0.24);
  if (cat) {
    ctx.font = font(700, chipH * 0.55); const cw = chipH + ctx.measureText(cat.label).width + chipH * 0.55;
    ctx.fillStyle = C.gold; rr(ctx, x, y, cw, chipH, chipH / 2); ctx.fill();
    drawIcon(ctx, cat.icon, x + chipH * 0.2, y + chipH * 0.17, chipH * 0.66, C.petrol900, 2.2);
    ctx.fillStyle = C.petrol900; ctx.textBaseline = 'middle'; ctx.fillText(cat.label, x + chipH * 0.95, y + chipH / 2 + 1); ctx.textBaseline = 'alphabetic';
    y += chipH + bh * 0.04;
  }
  const lot = record ? `Suerte ${record.identity.lot}` : visit?.scope === 'finca' ? 'Visita general de finca' : '';
  ctx.fillStyle = C.white; ctx.font = font(800, bh * 0.165);
  y += bh * 0.15; ctx.fillText(fit(ctx, [visit?.producer?.name, lot].filter(Boolean).join(' · '), maxW), x, y);
  const card = record ? agroCard(record, photo.takenAt || visit?.startedAt) : null;
  const when = photo.takenAt || photo.addedAt;
  const meta = [`${fdate(when)} ${ftime(when)}`, visit?.producer?.code ? `Cód. ${visit.producer.code}` : '', card?.variety, card?.age !== null && card?.age !== undefined ? ageLabel(card.age) : ''].filter(Boolean).join(' · ');
  ctx.font = font(500, bh * 0.115); ctx.fillStyle = '#D6E6EC'; y += bh * 0.15; ctx.fillText(fit(ctx, meta, maxW), x, y);
  const coords = coordsText(photo.location), foot = [coords, author ? `Técnico: ${author}` : '', `ID ${photo.id.slice(-8)}`].filter(Boolean).join(' · ');
  ctx.font = font(500, bh * 0.092); ctx.fillStyle = '#AFC8D1'; y += bh * 0.135; ctx.fillText(fit(ctx, foot, maxW), x, y);
  if (photo.caption) { ctx.font = font(600, bh * 0.11); ctx.fillStyle = C.white; const t = fit(ctx, photo.caption, W - p * 2); ctx.fillText(t, p, H - bh * 1.12); }
  return toBlob(canvas, 'image/jpeg', 0.92);
}

/* ---------- Minimapa vectorial ---------- */
function drawMiniMap(ctx, x, y, w, h, {features = [], focusId = null, point = null}) {
  ctx.save(); ctx.fillStyle = '#F4F7F9'; rr(ctx, x, y, w, h, 14); ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke(); ctx.clip();
  const rings = f => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map(p => p[0]);
  const focus = features.filter(f => f.properties?.lotId === focusId);
  const ref = (focus.length ? focus : features).flatMap(rings).flat();
  if (point) ref.push([point.lon, point.lat]);
  if (!ref.length) { ctx.restore(); return; }
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]; for (const [a, b] of ref) { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, a); y1 = Math.max(y1, b); }
  const k = Math.cos((y0 + y1) / 2 * Math.PI / 180), pad = 22, sx = (w - pad * 2) / Math.max((x1 - x0) * k, 1e-6), sy = (h - pad * 2) / Math.max(y1 - y0, 1e-6), s = Math.min(sx, sy) * (focus.length ? 0.72 : 1);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, P = ([a, b]) => [x + w / 2 + (a - cx) * k * s, y + h / 2 - (b - cy) * s];
  for (const f of features) {
    const on = f.properties?.lotId === focusId; ctx.beginPath();
    for (const r of rings(f)) r.forEach((pt, i) => { const [px, py] = P(pt); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.fillStyle = on ? 'rgba(47,126,151,0.35)' : 'rgba(148,163,184,0.18)'; ctx.fill();
    ctx.strokeStyle = on ? C.petrol800 : '#94A3B8'; ctx.lineWidth = on ? 3 : 1.2; ctx.stroke();
  }
  if (point) { const [px, py] = P([point.lon, point.lat]); ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.fillStyle = '#B42318'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke(); }
  ctx.restore();
}

/* ---------- Tarjeta de hallazgo ---------- */
export async function findingCard({finding, visit, record = null, photos = [], followups = [], features = [], author = ''}) {
  await fonts();
  const W = 1080, P = 56, cat = category(finding.category), card = record ? agroCard(record, finding.observedAt) : null;
  const bitmaps = (await Promise.all(photos.slice(0, 4).map(p => bitmap(p.blob)))).filter(Boolean);
  const measure = document.createElement('canvas').getContext('2d');
  // Bloques de texto (para calcular la altura total antes de dibujar).
  measure.font = font(400, 30);
  const obs = finding.observation ? wrap(measure, finding.observation, W - P * 2, 8) : [];
  const details = filledDetails(finding.category, finding.details);
  const recs = followups.filter(f => f.kind === 'recomendacion' && f.state !== 'Cancelado');
  measure.font = font(400, 28);
  const recLines = recs.flatMap(r => wrap(measure, r.text || '', W - P * 2 - 40, 3).map((t, i) => ({t, first: i === 0})));
  const chips = card ? [card.variety, card.age !== null ? ageLabel(card.age) : null, card.area ? `${card.area.toLocaleString('es-NI', {maximumFractionDigits: 2})} ha` : null, card.irrigation, card.phenology?.stage ? `${finding.phenology?.corrected || card.phenology.stage}` : null].filter(Boolean) : [];
  const photoH = bitmaps.length ? (bitmaps.length === 1 ? 720 : 560) : 0;
  const mapH = features.length ? 300 : 0;
  let H = 200 + (photoH ? photoH + 32 : 0) + (chips.length ? 76 : 0) + (obs.length ? 64 + obs.length * 42 : 0) + (details.length ? 72 + Math.ceil(details.length / 2) * 64 : 0)
    + (finding.severity?.source === 'tecnico' ? 72 : 0) + (recLines.length ? 64 + recLines.length * 40 : 0) + (mapH ? mapH + 40 : 0) + 140;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.white; ctx.fillRect(0, 0, W, H);
  // Cabecera
  ctx.fillStyle = C.petrol900; ctx.fillRect(0, 0, W, 200);
  const lg = await logo(); if (lg) { const lh = 64, lw = lh * lg.width / lg.height; ctx.fillStyle = '#fff'; rr(ctx, W - P - lw - 24, 36, lw + 24, lh + 20, 14); ctx.fill(); ctx.drawImage(lg, W - P - lw - 12, 46, lw, lh); }
  ctx.fillStyle = C.gold; rr(ctx, P, 40, 76, 76, 20); ctx.fill(); drawIcon(ctx, cat.icon, P + 14, 54, 48, C.petrol900, 2.1);
  ctx.fillStyle = '#BFD5DD'; ctx.font = font(600, 24); ctx.fillText('Hallazgo de campo', P + 100, 66);
  ctx.fillStyle = C.white; ctx.font = font(800, 44); ctx.fillText(fit(ctx, cat.label, W - P * 2 - 360), P + 100, 112);
  ctx.fillStyle = '#D6E6EC'; ctx.font = font(500, 27);
  const where = [visit?.producer?.name, record ? `Suerte ${record.identity.lot}` : 'Finca completa', fdate(finding.observedAt) + ' ' + ftime(finding.observedAt)].filter(Boolean).join(' · ');
  ctx.fillText(fit(ctx, where, W - P * 2), P, 166);
  let y = 200;
  // Fotos
  if (photoH) {
    y += 32; const gap = 14, area = W - P * 2;
    const cell = (b, x0, y0, w, h) => { const s = Math.max(w / b.width, h / b.height), sw = w / s, sh = h / s; ctx.save(); rr(ctx, x0, y0, w, h, 18); ctx.clip(); ctx.drawImage(b, (b.width - sw) / 2, (b.height - sh) / 2, sw, sh, x0, y0, w, h); ctx.restore(); };
    if (bitmaps.length === 1) cell(bitmaps[0], P, y, area, photoH);
    else if (bitmaps.length === 2) { const w = (area - gap) / 2; cell(bitmaps[0], P, y, w, photoH); cell(bitmaps[1], P + w + gap, y, w, photoH); }
    else { const big = Math.round(area * 0.62), w = area - big - gap, h = (photoH - gap) / 2; cell(bitmaps[0], P, y, big, photoH); cell(bitmaps[1], P + big + gap, y, w, h); cell(bitmaps[2], P + big + gap, y + h + gap, w, h);
      if (photos.length > 3) { ctx.fillStyle = 'rgba(15,42,51,0.66)'; rr(ctx, P + big + gap, y + h + gap, w, h, 18); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = font(800, 48); ctx.textAlign = 'center'; ctx.fillText(`+${photos.length - 2}`, P + big + gap + w / 2, y + h + gap + h / 2 + 16); ctx.textAlign = 'left'; } }
    bitmaps.forEach(b => b.close?.()); y += photoH;
  }
  // Datos agronómicos
  if (chips.length) {
    y += 28; let x = P; ctx.font = font(600, 25);
    for (const c of chips) { const w = ctx.measureText(c).width + 36; if (x + w > W - P) break; ctx.fillStyle = C.petrol50; rr(ctx, x, y, w, 48, 24); ctx.fill(); ctx.fillStyle = C.petrol800; ctx.fillText(c, x + 18, y + 33); x += w + 10; }
    y += 48;
  }
  const heading = t => { y += 52; ctx.fillStyle = C.petrol600; ctx.font = font(700, 23); ctx.fillText(t.toUpperCase(), P, y); y += 8; };
  if (obs.length) { heading('Observación'); ctx.fillStyle = C.ink; ctx.font = font(400, 30); for (const l of obs) { y += 42; ctx.fillText(l, P, y); } }
  if (details.length) {
    heading('Detalles evaluados'); const colW = (W - P * 2) / 2;
    details.forEach((d, i) => { const cx = P + (i % 2) * colW, cy = y + 30 + Math.floor(i / 2) * 64; ctx.fillStyle = C.soft; ctx.font = font(500, 22); ctx.fillText(d.label, cx, cy); ctx.fillStyle = C.ink; ctx.font = font(700, 27); ctx.fillText(fit(ctx, d.value, colW - 20), cx, cy + 32); });
    y += Math.ceil(details.length / 2) * 64;
  }
  if (finding.severity?.source === 'tecnico') {
    y += 26; const s = finding.severity.value; ctx.font = font(700, 26); const w = ctx.measureText(`Severidad ${s}`).width + 40;
    ctx.fillStyle = C.sev[s] || C.soft; rr(ctx, P, y, w, 46, 23); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(`Severidad ${s}`, P + 20, y + 32); y += 46;
  }
  if (recLines.length) {
    heading('Recomendaciones'); ctx.font = font(400, 28);
    for (const l of recLines) { y += 40; if (l.first) { ctx.fillStyle = C.petrol500; ctx.beginPath(); ctx.arc(P + 10, y - 9, 6, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = C.ink; ctx.fillText(l.t, P + 36, y); }
  }
  if (mapH) { y += 40; const loc = finding.gps && finding.gps.source !== 'none' ? finding.gps : null; drawMiniMap(ctx, P, y, W - P * 2, mapH, {features, focusId: record?.identity.lotCode, point: loc}); y += mapH; }
  // Pie
  ctx.fillStyle = C.line; ctx.fillRect(P, H - 92, W - P * 2, 2);
  ctx.fillStyle = C.soft; ctx.font = font(500, 22);
  const loc = finding.gps && finding.gps.source !== 'none' ? coordsText(finding.gps) : '';
  ctx.fillText(fit(ctx, [author ? `Técnico: ${author}` : '', loc, `ID ${finding.id.slice(-8)}`].filter(Boolean).join(' · '), W - P * 2 - 300), P, H - 46);
  ctx.textAlign = 'right'; ctx.fillStyle = C.petrol800; ctx.font = font(700, 22); ctx.fillText('Negocios de Caña · CASUR', W - P, H - 46); ctx.textAlign = 'left';
  return toBlob(canvas, 'image/png');
}
export {locationLabel};
