/* Evidencias documentales propias de Visitas (canvas). Los originales nunca se modifican: aquí solo se generan copias.
   - Foto etiquetada: la fotografía queda ENTERA y sin cubrir; debajo se agrega un pie documental blanco con productor,
     suerte, categoría, fecha, ubicación verificable (o «Sin ubicación verificable») y la descripción completa.
   - Ficha de seguimiento técnico: documento vertical con Observación → Recomendación y solicitudes → Seguimiento,
     evidencias numeradas (sin recorte: cada foto completa dentro de su celda), antes/después y minimapa vectorial.
   Ningún texto se corta: los párrafos se ajustan en líneas y la altura del documento se calcula con su contenido.
   Los campos vacíos se omiten; la severidad solo aparece si el técnico la evaluó; las coordenadas solo si son verificables. */
import {iconPaths} from './icons.js';
import {category, filledDetails, familyStyle, PROGRESS, progressOf, KIND, requestType} from './catalog.js';
import {agroCard, ageLabel} from './agro.js';
import {locationLabel} from './photos.js';

const C = {petrol900: '#0F2A33', petrol800: '#143A46', petrol700: '#1B4D5C', petrol600: '#23647A', petrol500: '#2F7E97', petrol100: '#DCEBF0', petrol50: '#EEF5F7',
  ink: '#0B1720', soft: '#475569', line: '#D5DEE4', white: '#FFFFFF', gold: '#F4C542', sev: {Baja: '#2E7D5B', Media: '#B7791F', Alta: '#B42318'}};
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const fdate = iso => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}` : ''; };
export const ftime = iso => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''; };
const coord = (v, pos, neg) => `${Math.abs(v).toFixed(5)}° ${v >= 0 ? pos : neg}`;
/** Coordenadas solo si son verificables (EXIF o lectura cercana y precisa); las aproximadas no se rotulan como exactas. */
export const coordsText = loc => loc && Number.isFinite(loc.lat) && loc.source !== 'none' && !loc.approximate ? `${coord(loc.lat, 'N', 'S')} · ${coord(loc.lon, 'E', 'O')}${Number.isFinite(loc.accuracy) ? ` · ±${loc.accuracy} m` : ''}` : '';
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
/** Ajusta el texto en líneas sin perder contenido (las palabras más largas que el ancho se parten). */
export function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    let line = '';
    for (let w of para.split(/\s+/).filter(Boolean)) {
      while (ctx.measureText(w).width > maxW && w.length > 1) { let i = w.length - 1; while (i > 1 && ctx.measureText(w.slice(0, i)).width > maxW) i--; if (line) { out.push(line); line = ''; } out.push(w.slice(0, i)); w = w.slice(i); }
      const t = line ? line + ' ' + w : w; if (line && ctx.measureText(t).width > maxW) { out.push(line); line = w; } else line = t;
    }
    if (line) out.push(line);
  }
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

/* ---------- Foto etiquetada: imagen completa + pie documental ---------- */
const lotText = (record, visit) => record ? `Suerte ${record.identity.lot}` : visit?.scope === 'finca' ? 'Finca completa' : '';
const kindText = (photo, finding) => finding ? category(finding.category).label : photo.followupId ? 'Seguimiento' : 'Evidencia de la visita';
/** Texto de ubicación para documentos: exacta y verificable, aproximada (rotulada) o ausente. */
export function placeText(loc) {
  const exact = coordsText(loc); if (exact) return {text: exact + (loc.source === 'exif' ? ' · GPS de la cámara' : ' · GPS del teléfono'), ok: true};
  if (loc && loc.source !== 'none' && Number.isFinite(loc.lat)) return {text: locationLabel(loc), ok: false};
  return {text: 'Sin ubicación verificable', ok: false};
}
export async function labeledPhoto({photo, visit, finding = null, record = null, author = ''}) {
  await fonts();
  const bmp = await bitmap(photo.blob); if (!bmp) throw Error('Formato de imagen no compatible para etiquetar');
  const long = Math.max(bmp.width, bmp.height), scale = Math.min(2048 / long, Math.max(1, 1080 / bmp.width));
  const W = Math.round(bmp.width * scale), H = Math.round(bmp.height * scale), u = W / 1080, P = 44 * u;
  const fam = finding ? familyStyle(finding.category) : {color: C.petrol700, soft: C.petrol50};
  const m = document.createElement('canvas').getContext('2d'), maxW = W - P * 2;
  const card = record ? agroCard(record, photo.takenAt || visit?.startedAt) : null, when = photo.takenAt || photo.addedAt;
  const title = [visit?.producer?.name, lotText(record, visit)].filter(Boolean).join(' · ');
  const meta = [`${fdate(when)} ${ftime(when)}`, visit?.producer?.code ? `Cód. ${visit.producer.code}` : '', card?.variety ? `Variedad ${card.variety}` : '', card?.age !== null && card?.age !== undefined ? ageLabel(card.age) : ''].filter(Boolean).join(' · ');
  const place = placeText(photo.location), desc = photo.caption || finding?.observation || '';
  m.font = font(800, 40 * u); const tL = wrap(m, title, maxW);
  m.font = font(500, 27 * u); const mL = wrap(m, meta, maxW), pL = wrap(m, place.text, maxW - 34 * u);
  m.font = font(400, 29 * u); const dL = desc ? wrap(m, desc, maxW) : [];
  const lg = await logo(), pillH = 50 * u;
  const footH = 10 * u + P * 0.8 + pillH + 22 * u + tL.length * 50 * u + 8 * u + mL.length * 36 * u + 10 * u + pL.length * 36 * u + (dL.length ? 26 * u + dL.length * 40 * u : 0) + 30 * u + 2 * u + 56 * u;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = Math.round(H + footH);
  const ctx = canvas.getContext('2d'); ctx.drawImage(bmp, 0, 0, W, H); bmp.close?.();
  ctx.fillStyle = C.white; ctx.fillRect(0, H, W, footH); ctx.fillStyle = fam.color; ctx.fillRect(0, H, W, 10 * u);
  let y = H + 10 * u + P * 0.8;
  // Píldora de categoría con el color de su familia (o del tipo de evidencia) y logo institucional a la derecha.
  ctx.font = font(700, 25 * u); const label = kindText(photo, finding), pw = pillH + ctx.measureText(label).width + 26 * u;
  ctx.fillStyle = fam.soft; rr(ctx, P, y, pw, pillH, pillH / 2); ctx.fill();
  drawIcon(ctx, finding ? category(finding.category).icon : photo.followupId ? 'seguimiento' : 'camera', P + 12 * u, y + 9 * u, 32 * u, fam.color, 2.2);
  ctx.fillStyle = fam.color; ctx.textBaseline = 'middle'; ctx.fillText(label, P + pillH, y + pillH / 2 + 1); ctx.textBaseline = 'alphabetic';
  if (lg) { const lh = 52 * u, lw = lh * lg.width / lg.height; ctx.drawImage(lg, W - P - lw, y - 1 * u, lw, lh); }
  y += pillH + 22 * u;
  ctx.fillStyle = C.ink; ctx.font = font(800, 40 * u); for (const l of tL) { y += 50 * u; ctx.fillText(l, P, y - 10 * u); }
  y += 8 * u; ctx.fillStyle = C.soft; ctx.font = font(500, 27 * u); for (const l of mL) { y += 36 * u; ctx.fillText(l, P, y - 8 * u); }
  y += 10 * u; drawIcon(ctx, 'pin', P - 2 * u, y + 6 * u, 26 * u, place.ok ? C.petrol600 : C.soft, 2);
  ctx.fillStyle = place.ok ? C.petrol700 : C.soft; ctx.font = font(place.ok ? 600 : 500, 27 * u); pL.forEach((l, i) => ctx.fillText(l, P + 34 * u, y + 28 * u + i * 36 * u)); y += pL.length * 36 * u;
  if (dL.length) { y += 26 * u; ctx.fillStyle = C.ink; ctx.font = font(400, 29 * u); for (const l of dL) { y += 40 * u; ctx.fillText(l, P, y - 8 * u); } }
  y += 30 * u; ctx.fillStyle = C.line; ctx.fillRect(P, y, maxW, 2 * u); y += 2 * u;
  ctx.font = font(600, 22 * u); ctx.fillStyle = C.petrol800; ctx.fillText('Evidencia de campo · Negocios de Caña · CASUR', P, y + 38 * u);
  ctx.textAlign = 'right'; ctx.fillStyle = C.soft; ctx.font = font(500, 22 * u); ctx.fillText([author ? author : '', `ID ${photo.id.slice(-8)}`].filter(Boolean).join(' · '), W - P, y + 38 * u); ctx.textAlign = 'left';
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

/* ---------- Ficha de seguimiento técnico ---------- */
/** Dibuja la foto COMPLETA dentro de la celda (sin recorte), centrada sobre fondo neutro. */
function containImage(ctx, b, x, y, w, h) {
  ctx.save(); ctx.fillStyle = '#EEF2F4'; rr(ctx, x, y, w, h, 12); ctx.fill(); ctx.clip();
  const s = Math.min(w / b.width, h / b.height), dw = b.width * s, dh = b.height * s; ctx.drawImage(b, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); ctx.restore();
}
export async function followupSheet({finding, visit, record = null, photos = [], followPhotos = [], followups = [], features = [], author = ''}) {
  await fonts();
  const W = 1240, P = 72, IW = W - P * 2, cat = category(finding.category), fam = familyStyle(finding.category), card = record ? agroCard(record, finding.observedAt) : null;
  const step = progressOf(finding, followups), details = filledDetails(finding.category, finding.details);
  const recs = followups.filter(f => !f.removedFromVisit).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const evid = [...photos].sort((a, b) => (a.takenAt || a.addedAt).localeCompare(b.takenAt || b.addedAt));
  const bms = await Promise.all(evid.map(p => bitmap(p.blob)));
  const after = [...followPhotos].sort((a, b) => (b.takenAt || b.addedAt).localeCompare(a.takenAt || a.addedAt))[0] || null, afterBm = after ? await bitmap(after.blob) : null;
  const history = [...(finding.history || []).map(h => ({...h, what: 'Hallazgo'})), ...recs.flatMap(r => (r.history || []).map(h => ({...h, what: KIND[r.kind].label})))].sort((a, b) => a.at.localeCompare(b.at));
  const m = document.createElement('canvas').getContext('2d'), L = (f, t, w = IW) => { m.font = f; return wrap(m, t, w); };
  // Bloques medidos (altura exacta antes de dibujar: nada se corta).
  const F = {title: font(800, 46), body: font(400, 30), meta: font(500, 25), small: font(500, 23), sec: font(800, 28), label: font(600, 22), val: font(700, 26)};
  const nameL = L(F.title, visit?.producer?.name || ''), subL = L(F.meta, [`Código ${visit?.producer?.code || ''}`, visit?.producer?.zone, record ? `Suerte ${record.identity.lot}` : 'Finca completa', author ? `Técnico: ${author}` : ''].filter(Boolean).join(' · '));
  const agro = card ? [card.variety ? `Variedad ${card.variety}` : '', card.age !== null ? `Edad ${ageLabel(card.age)}` : '', card.area ? `${card.area.toLocaleString('es-NI', {maximumFractionDigits: 2})} ha` : '', card.irrigation ? `Riego ${card.irrigation}` : '',
    card.phenology?.stage ? `${finding.phenology?.corrected || card.phenology.stage} (${finding.phenology?.corrected ? 'corregida en campo' : 'probable por edad'})` : ''].filter(Boolean).join(' · ') : '';
  const agroL = agro ? L(F.meta, agro) : [], obsL = finding.observation ? L(F.body, finding.observation) : [];
  const detL = details.map(d => ({label: d.label, lines: L(F.val, d.value, IW / 2 - 24)}));
  const detRows = []; for (let i = 0; i < detL.length; i += 2) detRows.push(Math.max(...detL.slice(i, i + 2).map(d => d.lines.length)));
  const recB = recs.map(r => ({r, head: [KIND[r.kind].label, r.category ? requestType(r.category).label : ''].filter(Boolean).join(' · '), lines: L(F.body, r.text || '—', IW - 40),
    meta: L(F.small, [r.lotKey ? 'Suerte ' + r.lotKey.split('|')[1] : '', r.responsible ? 'Responsable: ' + r.responsible : '', r.dueDate ? 'Fecha: ' + fdate(r.dueDate) : '', r.quantity ? `${r.quantity} ${r.unit || ''}` : '', 'Estado: ' + r.state].filter(Boolean).join(' · '), IW - 40)}));
  const histB = history.map(h => ({h, lines: L(F.meta, `${h.what} · ${h.state}${h.note ? ' — ' + h.note : ''}${h.by ? ' · ' + h.by : ''}`, IW - 250)}));
  const cols = bms.filter(Boolean).length > 1 ? 2 : 1, cellW = cols === 1 ? IW : (IW - 24) / 2, cellH = cols === 1 ? 640 : 420;
  const capOf = (p, i) => { const pl = placeText(p.location); return `${i + 1} · ${fdate(p.takenAt || p.addedAt)} ${ftime(p.takenAt || p.addedAt)} · ${pl.text}${p.caption ? ' · ' + p.caption : ''}`; };
  const evCells = evid.map((p, i) => ({p, b: bms[i], cap: L(F.small, capOf(p, i), cellW)}));
  const evRows = []; for (let i = 0; i < evCells.length; i += cols) evRows.push(cellH + 14 + Math.max(...evCells.slice(i, i + cols).map(c => c.cap.length)) * 30 + 26);
  const pair = evCells.find(c => c.b) && afterBm ? {before: evCells.find(c => c.b), after} : null, pairH = pair ? 70 + 420 + 50 : 0;
  const mapH = features.length ? 380 : 0;
  const secH = 110;
  let H = 250 + nameL.length * 56 + subL.length * 34 + 40 + 110 /* progreso */
    + secH + 70 + (agroL.length ? agroL.length * 34 + 16 : 0) + (obsL.length ? obsL.length * 42 + 20 : 46) + (detRows.length ? 20 + detRows.reduce((s, n) => s + 34 + n * 34 + 18, 0) : 0) + (finding.severity?.source === 'tecnico' ? 66 : 0)
    + (evRows.length ? 30 + evRows.reduce((s, h) => s + h, 0) : 0)
    + secH + (recB.length ? recB.reduce((s, b) => s + 40 + b.lines.length * 42 + b.meta.length * 30 + 28, 0) : 46)
    + secH + (histB.length ? histB.reduce((s, b) => s + b.lines.length * 34 + 16, 0) : 46) + pairH + (mapH ? mapH + 40 : 0) + 150;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = Math.ceil(H); const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.white; ctx.fillRect(0, 0, W, H); ctx.fillStyle = fam.color; ctx.fillRect(0, 0, 14, H);
  // Encabezado documental: logo, título y referencia.
  const lg = await logo(); if (lg) { const lh = 70, lw = lh * lg.width / lg.height; ctx.drawImage(lg, P, 52, lw, lh); }
  ctx.textAlign = 'right'; ctx.fillStyle = C.petrol900; ctx.font = font(800, 32); ctx.fillText('Ficha de seguimiento técnico', W - P, 82);
  ctx.fillStyle = C.soft; ctx.font = F.small; ctx.fillText(`Negocios de Caña · CASUR · Ref. ${finding.id.slice(-8)} · Emitida ${fdate(new Date().toISOString())}`, W - P, 118); ctx.textAlign = 'left';
  ctx.fillStyle = C.line; ctx.fillRect(P, 158, IW, 2);
  let y = 200; ctx.fillStyle = C.ink; ctx.font = F.title; for (const l of nameL) { ctx.fillText(l, P, y + 30); y += 56; }
  ctx.fillStyle = C.soft; ctx.font = F.meta; for (const l of subL) { ctx.fillText(l, P, y + 20); y += 34; }
  // Avance del trámite
  y += 40; const sw = IW / 4;
  PROGRESS.forEach((l, i) => { const x = P + i * sw, done = i <= step; ctx.fillStyle = done ? fam.color : '#DDE3E7'; rr(ctx, x, y, sw - 10, 12, 6); ctx.fill();
    ctx.fillStyle = i === step ? fam.color : done ? C.ink : C.soft; ctx.font = font(i === step ? 800 : 600, 23); ctx.fillText(`${i + 1}. ${l}`, x, y + 50); });
  y += 110;
  const section = (n, t) => { ctx.fillStyle = fam.color; rr(ctx, P, y + 34, 44, 44, 12); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = font(800, 24); ctx.textAlign = 'center'; ctx.fillText(String(n), P + 22, y + 65); ctx.textAlign = 'left';
    ctx.fillStyle = C.petrol900; ctx.font = F.sec; ctx.fillText(t, P + 62, y + 66); y += secH; };
  // 1 · Observación
  section(1, 'Observación');
  ctx.font = font(700, 26); const pw = 60 + ctx.measureText(cat.label).width + 24; ctx.fillStyle = fam.soft; rr(ctx, P, y, pw, 52, 26); ctx.fill(); drawIcon(ctx, cat.icon, P + 14, y + 10, 32, fam.color, 2.2);
  ctx.fillStyle = fam.color; ctx.fillText(cat.label, P + 58, y + 35);
  ctx.fillStyle = C.soft; ctx.font = F.meta; ctx.fillText(`${fdate(finding.observedAt)} ${ftime(finding.observedAt)}`, P + pw + 20, y + 35); y += 70;
  if (agroL.length) { ctx.fillStyle = C.petrol700; ctx.font = F.meta; for (const l of agroL) { ctx.fillText(l, P, y + 22); y += 34; } y += 16; }
  ctx.fillStyle = obsL.length ? C.ink : C.soft; ctx.font = F.body; if (obsL.length) { for (const l of obsL) { ctx.fillText(l, P, y + 30); y += 42; } y += 20; } else { ctx.fillText('Sin observación escrita.', P, y + 30); y += 46; }
  if (detRows.length) { y += 20; detRows.forEach((n, r) => { [0, 1].forEach(c => { const d = detL[r * 2 + c]; if (!d) return; const x = P + c * (IW / 2); ctx.fillStyle = C.soft; ctx.font = F.label; ctx.fillText(d.label, x, y + 22);
      ctx.fillStyle = C.ink; ctx.font = F.val; d.lines.forEach((l, i) => ctx.fillText(l, x, y + 56 + i * 34)); }); y += 34 + n * 34 + 18; }); }
  if (finding.severity?.source === 'tecnico') { const s = finding.severity.value; ctx.font = font(700, 24); const w = ctx.measureText(`Severidad evaluada: ${s}`).width + 36; ctx.fillStyle = C.sev[s] || C.soft; rr(ctx, P, y + 10, w, 44, 22); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(`Severidad evaluada: ${s}`, P + 18, y + 40); y += 66; }
  if (evRows.length) {
    y += 30; for (let i = 0, r = 0; i < evCells.length; i += cols, r++) {
      evCells.slice(i, i + cols).forEach((c, j) => { const x = P + j * (cellW + 24); if (c.b) containImage(ctx, c.b, x, y, cellW, cellH); else { ctx.fillStyle = '#EEF2F4'; rr(ctx, x, y, cellW, cellH, 12); ctx.fill(); ctx.fillStyle = C.soft; ctx.font = F.small; ctx.fillText('Original no disponible en este teléfono', x + 20, y + cellH / 2); }
        ctx.fillStyle = C.soft; ctx.font = F.small; c.cap.forEach((l, k) => ctx.fillText(l, x, y + cellH + 36 + k * 30)); });
      y += evRows[r];
    }
  }
  // 2 · Recomendación y solicitudes
  section(2, 'Recomendación y solicitudes');
  if (!recB.length) { ctx.fillStyle = C.soft; ctx.font = F.body; ctx.fillText('Sin recomendaciones ni solicitudes registradas.', P, y + 30); y += 46; }
  for (const b of recB) { ctx.fillStyle = fam.color; ctx.font = font(800, 22); ctx.fillText(b.head.toUpperCase(), P + 40, y + 26); ctx.beginPath(); ctx.arc(P + 12, y + 18, 8, 0, Math.PI * 2); ctx.fill(); y += 40;
    ctx.fillStyle = C.ink; ctx.font = F.body; for (const l of b.lines) { ctx.fillText(l, P + 40, y + 30); y += 42; }
    ctx.fillStyle = C.soft; ctx.font = F.small; for (const l of b.meta) { ctx.fillText(l, P + 40, y + 22); y += 30; } y += 28; }
  // 3 · Seguimiento
  section(3, 'Seguimiento');
  if (!histB.length) { ctx.fillStyle = C.soft; ctx.font = F.body; ctx.fillText('Sin cambios de estado registrados.', P, y + 30); y += 46; }
  for (const b of histB) { ctx.fillStyle = C.soft; ctx.font = F.small; ctx.fillText(`${fdate(b.h.at)} ${ftime(b.h.at)}`, P, y + 24); ctx.fillStyle = C.ink; ctx.font = F.meta; b.lines.forEach((l, i) => ctx.fillText(l, P + 250, y + 24 + i * 34)); y += b.lines.length * 34 + 16; }
  if (pair) {
    y += 30; ctx.fillStyle = C.petrol800; ctx.font = font(700, 24); ctx.fillText('Antes y después', P, y + 20); y += 40; const w = (IW - 24) / 2;
    containImage(ctx, pair.before.b, P, y, w, 420); containImage(ctx, afterBm, P + w + 24, y, w, 420);
    ctx.fillStyle = C.soft; ctx.font = F.small; ctx.fillText(`Antes · ${fdate(pair.before.p.takenAt || pair.before.p.addedAt)}`, P, y + 456); ctx.fillText(`Después · ${fdate(after.takenAt || after.addedAt)}`, P + w + 24, y + 456); y += 420 + 50 - 40 + 40;
  }
  if (mapH) { y += 40; const loc = finding.gps && finding.gps.source !== 'none' ? finding.gps : null; drawMiniMap(ctx, P, y, IW, mapH, {features, focusId: record?.identity.lotCode, point: loc}); y += mapH; }
  bms.forEach(b => b?.close?.()); afterBm?.close?.();
  // Pie
  ctx.fillStyle = C.line; ctx.fillRect(P, H - 96, IW, 2); ctx.fillStyle = C.soft; ctx.font = F.small;
  const loc = finding.gps && finding.gps.source !== 'none' ? coordsText(finding.gps) : '';
  ctx.fillText([loc ? 'Ubicación del hallazgo: ' + loc : 'Hallazgo sin ubicación verificable', `${evid.length} evidencia${evid.length === 1 ? '' : 's'}`].join(' · '), P, H - 50);
  ctx.textAlign = 'right'; ctx.fillStyle = C.petrol800; ctx.font = font(700, 22); ctx.fillText('Visitas de Campo · CASUR', W - P, H - 50); ctx.textAlign = 'left';
  return toBlob(canvas, 'image/png');
}
/** Compatibilidad: el nombre anterior genera ahora la ficha de seguimiento. */
export const findingCard = followupSheet;
export {locationLabel};
