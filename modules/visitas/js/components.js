/* Componentes reutilizables de las vistas de Visitas. */
import {icon} from './icons.js';
import {esc, fdate, fdt, fha, fnum, blobUrl, lightbox, download, share, safeName, toast} from './ui.js';
import {agroCard, ageLabel, STAGES} from './agro.js';
import {category, KIND, filledDetails} from './catalog.js';
import {BACKUP_STATES, beginCapture, createPhotoRecord, locationLabel, photoExtension} from './photos.js';
import {labeledPhoto} from './labels.js';
import * as store from './store.js';
import {isOverdue, author} from './model.js';

/* ---------- Ficha agronómica compacta ---------- */
export function agroHtml(record, at, {compact = false} = {}) {
  const c = agroCard(record, at); if (!c) return '';
  const cell = (label, value) => value === null || value === undefined || value === '' ? '' : `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`;
  const cells = [
    cell('Área', c.area !== null ? fha(c.area) : null), cell('Variedad', c.variety), cell('Edad', c.age !== null ? ageLabel(c.age) : null),
    cell('Riego', c.irrigation), cell('Textura', c.texture), cell(c.type === 'planta' ? 'Ciclo' : 'Corte', c.type === 'planta' ? 'Planta' : c.cuts ? `Soca · ${c.cuts}.º corte` : c.type === 'soca' ? 'Soca' : null),
    cell(`TCH ${c.prevSeason || 'anterior'}`, c.tchPrev ? fnum(c.tchPrev, 1) : null), cell(`TCH est. ${c.estSeason || ''}`.trim(), c.tchEst !== null ? fnum(c.tchEst, 1) : 'Sin estimado'),
    cell('Estado', c.state), ...(compact ? [] : [cell('Siembra', c.planting ? fdate(c.planting) : null), cell('Último corte', c.lastCut ? fdate(c.lastCut) : null),
      cell('Cosecha programada', c.harvest ? fdate(c.harvest) : null), cell('Destino', c.destination)]),
  ].filter(Boolean);
  return `<dl class="vc-agro">${cells.join('')}</dl>`;
}
export function phenologyHtml(record, at, corrected = null) {
  const c = agroCard(record, at), ph = c?.phenology;
  if (!ph) return '';
  if (!ph.stage) return `<span class="vc-chip vc-chip--ghost">${icon('info')}Etapa no determinable · ${esc(ph.reason)}</span>`;
  return `<span class="vc-chip">${icon('desarrollo')}<span class="vc-phen">${esc(corrected || ph.stage)} <small>${corrected ? 'corregida en campo' : 'probable por edad'}</small></span></span>`;
}
export const stageOptions = (current) => STAGES.map(s => `<option ${s === current ? 'selected' : ''}>${s}</option>`).join('');

/* ---------- Galería ---------- */
export function galleryHtml(photos, {add = null} = {}) {
  const tiles = photos.map((p, i) => `<button class="vc-ph" type="button" data-photo="${esc(p.id)}" data-i="${i}" aria-label="Ver foto ${i + 1}">
    ${p.thumb || p.blob ? `<img alt="" data-src-photo="${esc(p.id)}">` : '<span class="vc-ph__missing">Original no disponible</span>'}
    <span class="vc-ph__tag">${p.location?.source && p.location.source !== 'none' ? '<i>GPS</i>' : ''}${p.backupState === 'confirmada' ? '<i>Respaldada</i>' : ''}</span></button>`).join('');
  const adders = add ? `<label class="vc-ph-add" data-capture>${icon('camera')}Tomar foto<input type="file" accept="image/*" capture="environment" data-camera></label>
    <label class="vc-ph-add">${icon('image')}Galería<input type="file" accept="image/*" multiple data-gallery></label>` : '';
  return `<div class="vc-gallery">${tiles}${adders}</div>`;
}
export function hydrateGallery(root, photos) {
  for (const img of root.querySelectorAll('[data-src-photo]')) { const p = photos.find(x => x.id === img.dataset.srcPhoto); const b = p?.thumb || p?.blob; if (b) img.src = blobUrl(b); }
}
/** Conecta la galería: visor, etiquetado, compartir y descarga; y la captura con GPS asociado. */
export function bindGallery(root, getPhotos, ctx) {
  root.addEventListener('click', e => {
    const tile = e.target.closest('[data-photo]'); if (!tile) return;
    const photos = getPhotos();
    openViewer(photos, +tile.dataset.i, ctx);
  });
  // La lectura GPS empieza ANTES de que se abra la cámara del sistema.
  root.addEventListener('pointerdown', e => { if (e.target.closest('[data-capture]')) ctx._capture = beginCapture(); });
  root.addEventListener('change', async e => {
    const input = e.target; if (!input.matches('[data-camera],[data-gallery]') || !input.files?.length) return;
    const source = input.matches('[data-camera]') ? 'camera' : 'gallery', capture = source === 'camera' ? (ctx._capture || beginCapture()) : null;
    ctx._capture = null; const files = [...input.files]; input.value = '';
    await addPhotos(files, source, capture, ctx);
  });
}
/** Galería autónoma: al agregar fotos solo se vuelve a dibujar la galería (los formularios en edición no se tocan). */
export async function mountGallery(container, loader, ctx, {add = true} = {}) {
  let photos = [];
  const render = async () => { photos = await loader(); container.innerHTML = galleryHtml(photos, {add}); hydrateGallery(container, photos); ctx.afterGallery?.(photos); };
  ctx.onChange = render;
  bindGallery(container, () => photos, ctx);
  await render();
  return render;
}
export async function addPhotos(files, source, capture, ctx) {
  const added = [];
  ctx.busy = true; document.body.setAttribute('aria-busy', 'true');
  try {
    for (const file of files) {
      const {record, refine} = await createPhotoRecord(file, {visitId: ctx.visitId, findingId: ctx.findingId || null, followupId: ctx.followupId || null, lotKey: ctx.lotKey || null, source, role: ctx.role || 'inicial', capture});
      await store.put('photos', record); added.push(record);
      refine?.then(loc => loc && store.update('photos', record.id, cur => cur && (!cur.location || cur.location.source === 'none' || cur.location.source.startsWith('device')) ? {...cur, location: loc} : null)).then(() => ctx.onChange?.()).catch(() => {});
    }
  } catch (e) { toast('No se pudo guardar la foto: ' + e.message, {kind: 'error'}); }
  finally { ctx.busy = false; document.body.removeAttribute('aria-busy'); }
  if (added.length) { toast(`${added.length} foto${added.length > 1 ? 's' : ''} guardada${added.length > 1 ? 's' : ''} en el teléfono`); await ctx.onChange?.(); }
  return added;
}
export function openViewer(photos, start, ctx) {
  const names = (p, mode) => `${safeName(ctx.visit?.producer?.name || 'Visita')}_${fdate(p.takenAt || p.addedAt)}_${p.id.slice(-6)}${mode === 'etiquetada' ? '_etiquetada.jpg' : '.' + photoExtension(p)}`;
  const label = async p => labeledPhoto({photo: p, visit: ctx.visit, finding: ctx.findingFor?.(p) || null, record: ctx.recordFor?.(p) || null, author: ctx.visit?.author?.name || ''});
  lightbox(photos, start, {
    onLabel: label,
    onDownload: async (p, mode) => { if (!p.blob) return; download(mode === 'etiquetada' ? await label(p) : p.blob, names(p, mode)); },
    onShare: async (p, mode) => { if (!p.blob) return; await share([mode === 'etiquetada' ? await label(p) : p.blob], [names(p, mode)]); },
    describe: p => [fdt(p.takenAt || p.addedAt), locationLabel(p.location), BACKUP_STATES[p.backupState], p.caption].filter(Boolean).map(esc).join(' · '),
  });
}

/* ---------- Filas ---------- */
export function findingRow(f, {visit, photos = []} = {}) {
  const cat = category(f.category), lot = f.lotKey ? `Suerte ${f.lotKey.split('|')[1]}` : 'Finca completa';
  const thumbs = photos.filter(p => p.findingId === f.id && (p.thumb || p.blob)).slice(0, 3);
  return `<a class="vc-finding" href="#/hallazgo/${esc(f.id)}">
    <div class="vc-finding__top"><span class="vc-sev" data-v="${esc(f.severity?.source === 'tecnico' ? f.severity.value : '')}"></span>
      <span class="vc-item__ic">${icon(cat.icon)}</span>
      <span class="vc-item__body"><span class="vc-item__title">${esc(cat.label)}</span><span class="vc-item__sub">${esc([visit?.producer?.name, lot].filter(Boolean).join(' · '))}</span></span>
      <span class="vc-item__side">${fdate(f.observedAt)}<span class="vc-chip ${f.status === 'Abierto' || f.status === 'En seguimiento' ? 'vc-chip--warn' : 'vc-chip--ok'}">${esc(f.status)}</span></span></div>
    ${f.observation ? `<p class="vc-finding__obs">${esc(f.observation)}</p>` : ''}
    ${thumbs.length ? `<span class="vc-thumbs">${thumbs.map(p => `<img alt="" data-src-photo="${esc(p.id)}">`).join('')}</span>` : ''}</a>`;
}
export function followupRow(f) {
  const k = KIND[f.kind], overdue = isOverdue(f);
  return `<a class="vc-item" href="#/seguimiento/${esc(f.id)}"><span class="vc-item__ic">${icon(k.icon)}</span>
    <span class="vc-item__body"><span class="vc-item__title">${esc(f.text || k.label)}</span>
      <span class="vc-item__sub">${esc([k.label, f.producerName, f.lotKey ? 'Suerte ' + f.lotKey.split('|')[1] : '', f.responsible].filter(Boolean).join(' · '))}</span></span>
    <span class="vc-item__side"><span class="vc-chip ${overdue ? 'vc-chip--err' : ['Pendiente', 'Solicitada', 'En gestión', 'Programado'].includes(f.state) ? 'vc-chip--warn' : 'vc-chip--ok'}">${overdue ? 'Vencido' : esc(f.state)}</span>${f.dueDate ? fdate(f.dueDate) : ''}</span></a>`;
}
export function visitRow(v, counts = {}) {
  const lots = v.scope === 'finca' ? 'Finca completa' : (v.lotKeys || []).map(k => k.split('|')[1]).join(', ');
  return `<a class="vc-item" href="#/visita/${esc(v.id)}"><span class="vc-item__ic">${icon(v.status === 'abierta' ? 'clock' : 'check')}</span>
    <span class="vc-item__body"><span class="vc-item__title">${esc(v.producer?.name || 'Visita')}</span><span class="vc-item__sub">${esc([lots ? 'Suertes ' + lots : '', counts.findings ? `${counts.findings} hallazgo${counts.findings > 1 ? 's' : ''}` : '', counts.photos ? `${counts.photos} foto${counts.photos > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ') || 'Sin registros aún')}</span></span>
    <span class="vc-item__side">${fdate(v.startedAt)}${v.status === 'abierta' ? '<span class="vc-chip vc-chip--warn">En curso</span>' : ''}</span></a>`;
}

/* ---------- Detalles técnicos (todos opcionales) ---------- */
export function detailsFields(catId, values = {}) {
  const cat = category(catId);
  if (!cat.details?.length) return '<p class="vc-muted">Esta categoría no tiene detalles técnicos: basta con la observación.</p>';
  return cat.details.map(f => {
    const v = values[f.id], name = `d-${f.id}`;
    if (f.type === 'choice') return `<fieldset class="vc-field" style="border:0;padding:0;margin:0"><legend class="vc-label">${esc(f.label)}</legend><div class="vc-opts">${f.options.map(o => `<label class="vc-opt"><input type="radio" name="${name}" value="${esc(o)}" data-detail="${f.id}" ${v === o ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div></fieldset>`;
    if (f.type === 'multi') return `<fieldset class="vc-field" style="border:0;padding:0;margin:0"><legend class="vc-label">${esc(f.label)}</legend><div class="vc-opts">${f.options.map(o => `<label class="vc-opt"><input type="checkbox" value="${esc(o)}" data-detail-multi="${f.id}" ${(v || []).includes(o) ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div></fieldset>`;
    if (f.type === 'number') return `<label class="vc-field"><span>${esc(f.label)}</span><span class="vc-unit"><input type="number" inputmode="decimal" step="any" ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''} value="${esc(v ?? '')}" data-detail="${f.id}"><em>${esc(f.unit || '')}</em></span></label>`;
    return `<label class="vc-field"><span>${esc(f.label)}</span><input type="${f.type === 'date' ? 'date' : 'text'}" value="${esc(v ?? '')}" placeholder="${esc(f.hint || '')}" data-detail="${f.id}"></label>`;
  }).join('');
}
/** Lee los detalles del formulario; los vacíos no se guardan (no evaluado ≠ cero). */
export function readDetails(root) {
  const out = {};
  for (const i of root.querySelectorAll('[data-detail]')) { if ((i.type === 'radio' && !i.checked) || i.value === '') continue; out[i.dataset.detail] = i.type === 'number' ? Number(i.value) : i.value; }
  for (const i of root.querySelectorAll('[data-detail-multi]:checked')) (out[i.dataset.detailMulti] ??= []).push(i.value);
  return out;
}
export {filledDetails, author};
