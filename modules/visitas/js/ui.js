/* Utilidades de interfaz de Visitas: escape, fechas dd-MMM-aaaa, avisos con acción (Deshacer), panel inferior,
   visor de fotos y descargas/compartir. Sin dependencias externas. */
import {icon} from './icons.js';

export const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const parse = v => { if (!v) return null; const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T12:00:00') : new Date(v); return isNaN(d) ? null : d; };
export const fdate = v => { const d = parse(v); return d ? `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}` : '—'; };
export const ftime = v => { const d = parse(v); return d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''; };
export const fdt = v => parse(v) ? `${fdate(v)} · ${ftime(v)}` : '—';
export const fnum = (v, d = 2) => v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('es-NI', {maximumFractionDigits: d});
export const fha = v => v === null || v === undefined ? '—' : `${fnum(v)} ha`;
export const fmb = b => b === null || b === undefined ? '—' : `${fnum(b / 1048576, 1)} MB`;
export const localInput = iso => { const d = iso ? new Date(iso) : new Date(); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
export const relTime = iso => { const s = Math.round((Date.now() - new Date(iso)) / 1000); return s < 60 ? 'hace instantes' : s < 3600 ? `hace ${Math.round(s / 60)} min` : s < 86400 ? `hace ${Math.round(s / 3600)} h` : fdate(iso); };

/* ---------- Avisos ---------- */
let toastTimer = null;
export function toast(text, {kind = 'info', actions = [], ms = 4200} = {}) {
  const t = $('#toast'); clearTimeout(toastTimer);
  t.dataset.kind = kind; t.innerHTML = `<span class="vc-toast__text">${esc(text)}</span>${actions.map((a, i) => `<button type="button" data-i="${i}">${esc(a.label)}</button>`).join('')}`;
  t.hidden = false;
  t.onclick = e => { const b = e.target.closest('button'); if (!b) return; t.hidden = true; clearTimeout(toastTimer); actions[+b.dataset.i].run(); };
  toastTimer = setTimeout(() => { t.hidden = true; }, actions.length ? Math.max(ms, 8000) : ms);
}

/* ---------- Panel inferior (móvil) / diálogo (escritorio) ---------- */
export function sheet(html, {title = '', onClose = null, wide = false} = {}) {
  const host = document.createElement('div'); host.className = 'vc-sheet' + (wide ? ' vc-sheet--wide' : '');
  host.innerHTML = `<div class="vc-sheet__scrim" data-close></div><section class="vc-sheet__panel" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header class="vc-sheet__head"><span class="vc-sheet__grip" aria-hidden="true"></span><h2>${esc(title)}</h2><button class="vc-icon-btn" type="button" data-close aria-label="Cerrar">${icon('x')}</button></header>
    <div class="vc-sheet__body">${html}</div></section>`;
  document.body.append(host); document.body.classList.add('vc-locked');
  const close = () => { host.remove(); if (!$('.vc-sheet')) document.body.classList.remove('vc-locked'); onClose?.(); };
  host.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
  host.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  setTimeout(() => host.querySelector('input,select,textarea,button:not([data-close])')?.focus?.({preventScroll: true}), 60);
  return {host, body: host.querySelector('.vc-sheet__body'), close};
}
export function confirmBox(text, {ok = 'Aceptar', cancel = 'Cancelar', danger = false} = {}) {
  return new Promise(resolve => {
    const s = sheet(`<p>${esc(text)}</p><div class="vc-row-actions"><button class="vc-btn" type="button" data-r="0">${esc(cancel)}</button><button class="vc-btn ${danger ? 'vc-btn--danger' : 'vc-btn--primary'}" type="button" data-r="1">${esc(ok)}</button></div>`,
      {title: 'Confirmar', onClose: () => resolve(false)});
    s.body.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (!b) return; s.host.remove(); document.body.classList.remove('vc-locked'); resolve(b.dataset.r === '1'); });
  });
}

/* ---------- URLs de blobs con limpieza ---------- */
const urls = new Set();
export function blobUrl(blob) { const u = URL.createObjectURL(blob); urls.add(u); return u; }
export function releaseUrls() { urls.forEach(u => URL.revokeObjectURL(u)); urls.clear(); }

/* ---------- Visor de fotos ---------- */
export function lightbox(items, start = 0, {onLabel = null, onShare = null, onDownload = null, describe = () => ''} = {}) {
  let i = start, mode = 'original', labelUrl = null;
  const host = document.createElement('div'); host.className = 'vc-lightbox'; host.setAttribute('role', 'dialog'); host.setAttribute('aria-modal', 'true');
  document.body.append(host); document.body.classList.add('vc-locked');
  const own = [];
  async function render() {
    const it = items[i]; let src = it.blob ? blobUrl(it.blob) : '';
    if (mode === 'etiquetada' && onLabel) { try { labelUrl && URL.revokeObjectURL(labelUrl); const b = await onLabel(it); labelUrl = URL.createObjectURL(b); own.push(labelUrl); src = labelUrl; } catch (e) { mode = 'original'; toast(e.message, {kind: 'error'}); } }
    host.innerHTML = `<div class="vc-lightbox__bar"><button class="vc-icon-btn vc-icon-btn--dark" type="button" data-a="close" aria-label="Cerrar">${icon('x')}</button>
      <span class="vc-lightbox__count">${i + 1} / ${items.length}</span>
      <div class="vc-seg vc-seg--dark" role="group" aria-label="Versión">${['original', 'etiquetada'].map(m => `<button type="button" data-mode="${m}" aria-pressed="${mode === m}">${m === 'original' ? 'Original' : 'Etiquetada'}</button>`).join('')}</div>
      <button class="vc-icon-btn vc-icon-btn--dark" type="button" data-a="download" aria-label="Descargar">${icon('download')}</button>
      <button class="vc-icon-btn vc-icon-btn--dark" type="button" data-a="share" aria-label="Compartir">${icon('share')}</button></div>
      <div class="vc-lightbox__stage">${src ? `<img src="${src}" alt="Fotografía ${i + 1}">` : '<p>Original no disponible en este dispositivo</p>'}
        ${items.length > 1 ? `<button class="vc-lightbox__nav vc-lightbox__nav--prev" type="button" data-a="prev" aria-label="Anterior">${icon('back')}</button><button class="vc-lightbox__nav vc-lightbox__nav--next" type="button" data-a="next" aria-label="Siguiente">${icon('chevron')}</button>` : ''}</div>
      <div class="vc-lightbox__info">${describe(it)}</div>`;
  }
  const close = () => { own.forEach(u => URL.revokeObjectURL(u)); host.remove(); document.body.classList.remove('vc-locked'); document.removeEventListener('keydown', key); };
  const go = d => { i = (i + d + items.length) % items.length; void render(); };
  const key = e => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
  document.addEventListener('keydown', key);
  host.addEventListener('click', async e => {
    const b = e.target.closest('[data-a],[data-mode]'); if (!b) return;
    if (b.dataset.mode) { mode = b.dataset.mode; await render(); return; }
    const a = b.dataset.a;
    if (a === 'close') close(); else if (a === 'prev') go(-1); else if (a === 'next') go(1);
    else if (a === 'download') onDownload?.(items[i], mode); else if (a === 'share') onShare?.(items[i], mode);
  });
  let x0 = null; host.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, {passive: true});
  host.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); x0 = null; });
  void render();
  return {close};
}

/* ---------- Descargar / compartir ---------- */
export function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
/** Compartir nativo (WhatsApp, correo…) cuando el navegador lo permite; si no, descarga. */
export async function share(blobs, names, text = '') {
  const files = blobs.map((b, i) => new File([b], names[i], {type: b.type || 'application/octet-stream'}));
  if (navigator.canShare?.({files})) { try { await navigator.share({files, text}); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancelled'; } }
  blobs.forEach((b, i) => download(b, names[i])); return 'downloaded';
}
export const safeName = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);
