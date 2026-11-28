/* Vistas: Visitas (lista, detalle, nueva), formulario y ficha de seguimiento, Informes, Datos y configuración. */
import {icon} from './icons.js';
import {$, $$, esc, fdate, fdt, fmb, toast, sheet, confirmBox, download, share, safeName, localInput} from './ui.js';
import * as store from './store.js';
import * as M from './model.js';
import {maestro, searchFarms} from './maestro.js';
import {gps, featuresFor, startGps, stopGps} from './geo.js';
import {CATEGORIES, DEFAULT_FAVORITES, category, STATES, OPEN, KIND, REQUEST_TYPES, requestType, UNITS, PRIORITY} from './catalog.js';
import {agroHtml, galleryHtml, hydrateGallery, bindGallery, mountGallery, findingRow, followupRow, visitRow} from './components.js';
import {BACKUP_STATES} from './photos.js';
import {buildBackup, markExported, confirmBackup, restoreBackup, partLimitBytes, fileDate} from './backup.js';
import {visitReportHtml, producerReportHtml, periodReportHtml, excelExport, geojsonExport} from './reports.js';
import {mount, view, chooseTarget, lotNum, retroNote} from './views-main.js';

/* ---------- Visitas ---------- */
export async function viewVisits() {
  const {visits, findings, photos} = await M.everything();
  const el = mount(`<section class="vc-card"><div class="vc-card__head"><h2>${icon('calendar')}Mis visitas</h2><a class="vc-btn vc-btn--sm vc-btn--primary" href="#/nueva">${icon('plus')}Nueva</a></div>
    <label class="vc-search">${icon('search')}<input class="vc-input" type="search" placeholder="Productor, código o fecha" data-q data-casur-query></label><div class="vc-list" data-list style="margin-top:6px"></div></section>`);
  const render = q => { const t = (q || '').toLowerCase();
    const list = visits.filter(v => !t || `${v.producer.name} ${v.producer.code} ${fdate(v.startedAt)}`.toLowerCase().includes(t)).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    $('[data-list]', el).innerHTML = list.map(v => visitRow(v, {findings: findings.filter(f => f.visitId === v.id).length, photos: photos.filter(p => p.visitId === v.id).length})).join('') || '<p class="vc-empty">Sin visitas registradas en este teléfono.</p>'; };
  $('[data-q]', el).addEventListener('input', e => render(e.target.value)); render('');
}
export async function viewNewVisit(params) {
  const {reader} = await maestro(), t = await M.resolveTarget();
  let farmCode = params.get('finca') || t.farmCode, lots = new Set(t.lotKey ? [t.lotKey] : []), scope = lots.size ? 'suertes' : 'finca';
  const followupOf = params.get('seguimiento');
  const el = mount(`<section class="vc-card vc-form"><div class="vc-card__head"><h2>${icon('calendar')}${followupOf ? 'Visita de seguimiento' : 'Nueva visita'}</h2></div><div data-body></div></section>`);
  const render = () => {
    const farm = farmCode ? reader.farm(farmCode) : null, recs = farm ? reader.lotsOf(farmCode).filter(r => r.state.presence !== 'absent') : [];
    $('[data-body]', el).innerHTML = farm ? `<div class="vc-target"><span class="vc-item__ic">${icon('folder')}</span><div class="vc-target__body"><strong>${esc(farm.name)}</strong><span class="vc-muted">Código ${esc(farm.code)} · ${esc(farm.zone || '')}</span></div><button class="vc-btn vc-btn--sm" type="button" data-change>Cambiar</button></div>
      <div class="vc-seg" role="group" aria-label="Alcance"><button type="button" data-scope="suertes" aria-pressed="${scope === 'suertes'}">Suertes</button><button type="button" data-scope="finca" aria-pressed="${scope === 'finca'}">Finca completa</button></div>
      ${scope === 'suertes' ? `<div class="vc-opts">${recs.map(r => `<label class="vc-opt"><input type="checkbox" value="${esc(r.key)}" data-lot ${lots.has(r.key) ? 'checked' : ''}><span>${esc(r.identity.lot)}</span></label>`).join('')}</div>` : ''}
      <label class="vc-field"><span>Fecha y hora (podés registrar una visita anterior)</span><input type="datetime-local" data-when value="${localInput()}" max="${localInput()}"></label>
      <div class="vc-row-actions"><a class="vc-btn" href="#/inicio">Cancelar</a><button class="vc-btn vc-btn--primary" type="button" data-create>${icon('check')}Crear visita</button></div>`
      : `<button class="vc-btn vc-btn--primary vc-btn--block" type="button" data-change>${icon('search')}Elegir productor o finca</button><p class="vc-muted">No hace falta estar en la finca ni tener GPS.</p>`;
  };
  render();
  el.addEventListener('click', async e => {
    if (e.target.closest('[data-change]')) { const c = await chooseTarget({title: 'Productor y finca'}); if (c) { farmCode = c.farmCode; lots = new Set(c.lotKey ? [c.lotKey] : []); scope = lots.size ? 'suertes' : 'finca'; render(); } }
    const sc = e.target.closest('[data-scope]'); if (sc) { scope = sc.dataset.scope; render(); }
    if (e.target.closest('[data-create]')) {
      if (scope === 'suertes' && !lots.size) { toast('Elegí al menos una suerte o «Finca completa»'); return; }
      const when = $('[data-when]', el).value, v = await M.createVisit({farmCode, lotKeys: scope === 'suertes' ? [...lots] : [], scope, startedAt: when ? new Date(when).toISOString() : M.nowIso(), followupOf});
      await M.setManualTarget(farmCode, lots.size === 1 ? [...lots][0] : null);
      location.hash = '#/visita/' + v.id;
    }
  });
  el.addEventListener('change', e => { if (e.target.matches('[data-lot]')) e.target.checked ? lots.add(e.target.value) : lots.delete(e.target.value); });
}
export async function viewVisit(id) {
  const v = await store.get('visits', id); if (!v) throw Error('La visita no existe en este teléfono.');
  const [findings, followups, photos] = await Promise.all([store.byIndex('findings', 'visitId', id), store.byIndex('followups', 'visitId', id), store.byIndex('photos', 'visitId', id)]);
  const live = findings.filter(f => !f.deletedAt), fus = followups.filter(f => !f.removedFromVisit);
  const recs = v.masterSnapshot?.records || [], lots = v.scope === 'finca' ? [] : recs.filter(r => v.lotKeys.includes(r.key));
  const el = mount(`
    <section class="vc-card"><div class="vc-card__head"><div style="min-width:0"><p class="vc-muted">${fdt(v.startedAt)}${v.followupOf ? ' · Visita de seguimiento' : ''}</p><h2>${esc(v.producer.name)}</h2></div><span class="vc-chip ${v.status === 'abierta' ? 'vc-chip--warn' : 'vc-chip--ok'}">${v.status === 'abierta' ? 'En curso' : 'Cerrada'}</span></div>
      <div class="vc-chips">${v.scope === 'finca' ? '<span class="vc-chip">Finca completa</span>' : lots.map(r => `<span class="vc-chip">${esc(r.identity.lot)}${v.lotSources?.[r.key] === 'gps' ? ' · GPS' : ''}</span>`).join('')}<button class="vc-chip vc-chip--ghost" type="button" data-addlot style="cursor:pointer">${icon('plus')}Suerte</button></div>
      ${retroNote(v, lots[0] || recs[0], v.startedAt)}
      ${lots.length === 1 ? `<div style="margin-top:10px">${agroHtml(lots[0], v.startedAt, {compact: true})}</div>` : ''}
      <details class="vc-details" style="margin-top:12px" ${v.general?.notes ? 'open' : ''}><summary>${icon('edit')}Observación general y datos de la visita${icon('chevron')}</summary><div class="vc-details__body vc-form" data-autosave>
        <label class="vc-field"><span>Observación general (opcional)</span><textarea data-g="notes" rows="3">${esc(v.general?.notes || '')}</textarea></label>
        <label class="vc-field"><span>Fecha y hora</span><input type="datetime-local" data-when value="${localInput(v.startedAt)}"></label>
        <label class="vc-field"><span>Técnico</span><input data-author value="${esc(v.author?.name || '')}"></label>
        <div class="vc-row-actions"><button class="vc-btn vc-btn--soft" type="button" data-save-general>Guardar</button></div></div></details>
      <p class="vc-muted vc-small" style="margin-top:10px">Datos del Maestro registrados: generación ${esc(v.masterSnapshot?.dataVersion || '—')} · ${fdate(v.masterSnapshot?.takenAt)}${v.revisions?.length ? ` · ${v.revisions.length} revisión${v.revisions.length > 1 ? 'es' : ''}` : ''}</p></section>
    <section class="vc-card"><div class="vc-card__head"><h2>${icon('list')}Hallazgos</h2><a class="vc-btn vc-btn--sm vc-btn--primary" href="#/registrar?visita=${esc(v.id)}" data-reg>${icon('plus')}Registrar</a></div>
      ${live.length ? `<div class="vc-stack">${live.map(f => findingRow(f, {visit: v, photos, followups: fus})).join('')}</div>` : '<p class="vc-muted">Sin hallazgos. Una visita puede tener solo una observación general o recomendaciones.</p>'}</section>
    <section class="vc-card"><div class="vc-card__head"><h2>${icon('check')}Seguimiento</h2></div>${fus.length ? `<div class="vc-list">${fus.map(followupRow).join('')}</div>` : '<p class="vc-muted">Sin recomendaciones, solicitudes ni compromisos.</p>'}
      <div class="vc-row-actions vc-row-actions--start">${Object.keys(KIND).map(k => `<a class="vc-btn vc-btn--sm ${k === 'recomendacion' ? 'vc-btn--soft' : ''}" href="#/seguimiento/nuevo?tipo=${k}&visita=${esc(v.id)}">${icon(KIND[k].icon)}${KIND[k].label}</a>`).join('')}</div></section>
    <section class="vc-card"><div class="vc-card__head"><h2>${icon('evidence')}Evidencias de la visita</h2><span class="vc-muted vc-small" data-count>${photos.length}</span></div><p class="vc-muted vc-small" style="margin-bottom:8px">Las fotos tomadas aquí quedan vinculadas a la visita aunque no correspondan a un hallazgo.</p><div data-gal></div></section>
    <div class="vc-row-actions vc-no-print"><a class="vc-btn" href="#/informe/visita/${esc(v.id)}">${icon('report')}Informe</a>${v.status === 'abierta' ? `<button class="vc-btn vc-btn--primary" type="button" data-close>${icon('check')}Finalizar visita</button>` : `<button class="vc-btn" type="button" data-reopen>Reabrir</button>`}</div>`);
  hydrateGallery(el, photos);
  await mountGallery($('[data-gal]', el), () => store.byIndex('photos', 'visitId', id), {visit: v, visitId: v.id, lotKey: lots.length === 1 ? lots[0].key : null,
    findingFor: p => live.find(f => f.id === p.findingId), recordFor: p => M.recordOf(v, p.lotKey), afterGallery: list => { $('[data-count]', el).textContent = list.length; }});
  el.addEventListener('click', async e => {
    if (e.target.closest('[data-reg]')) { e.preventDefault(); await M.setManualTarget(v.producer.code, lots.length === 1 ? lots[0].key : null); location.hash = '#/registrar?visita=' + v.id; }
    if (e.target.closest('[data-close]')) { await M.closeVisit(v.id); toast('Visita finalizada'); await viewVisit(id); }
    if (e.target.closest('[data-reopen]')) { await M.reopenVisit(v.id); await viewVisit(id); }
    if (e.target.closest('[data-addlot]')) {
      const s = sheet(`<div class="vc-opts">${recs.filter(r => !v.lotKeys.includes(r.key) && r.state.presence !== 'absent').map(r => `<button class="vc-btn vc-btn--sm" type="button" data-k="${esc(r.key)}">${esc(r.identity.lot)}</button>`).join('')}</div>`, {title: 'Agregar suerte a la visita'});
      s.body.addEventListener('click', async ev => { const b = ev.target.closest('[data-k]'); if (!b) return; s.close(); await M.addLotToVisit(v.id, b.dataset.k, 'manual'); await viewVisit(id); });
    }
    if (e.target.closest('[data-save-general]')) {
      const cur = await store.get('visits', v.id), when = $('[data-when]', el).value;
      try { await M.saveVisit({...cur, general: {...cur.general, notes: $('[data-g="notes"]', el).value}, startedAt: when ? new Date(when).toISOString() : cur.startedAt, author: {name: $('[data-author]', el).value}}, cur.rev); toast('Visita guardada'); await viewVisit(id); }
      catch (err) { toast(err.message, {kind: 'error'}); }
    }
  });
}

/* ---------- Seguimiento (formulario y ficha; las listas viven en Gestión) ---------- */
/** Formulario de recomendación / solicitud / compromiso: solo el texto es necesario; lo demás es opcional. */
export async function viewFollowupNew(params) {
  const kind = params.get('tipo') || 'recomendacion', findingId = params.get('hallazgo');
  const finding = findingId ? await store.get('findings', findingId) : null;
  let visit = finding ? await store.get('visits', finding.visitId) : params.get('visita') ? await store.get('visits', params.get('visita')) : null;
  if (!visit) { const t = await M.resolveTarget(); if (t.farmCode) visit = await M.ensureVisit(t.farmCode, t.lotKey, t.source === 'gps' ? 'gps' : 'manual'); }
  if (!visit) { const c = await chooseTarget(); if (!c) { location.hash = '#/inicio'; return; } await M.setManualTarget(c.farmCode, c.lotKey); visit = await M.ensureVisit(c.farmCode, c.lotKey, 'manual'); }
  const recs = visit.scope === 'finca' ? visit.masterSnapshot.records : visit.masterSnapshot.records.filter(r => visit.lotKeys.includes(r.key));
  const lotDefault = finding?.lotKey || (visit.lotKeys.length === 1 ? visit.lotKeys[0] : '');
  const el = mount(`<section class="vc-card vc-form"><div class="vc-card__head"><h2>${icon(KIND[kind].icon)}Nueva ${KIND[kind].label.toLowerCase()}</h2></div>
    <p class="vc-muted">${esc(visit.producer.name)}${finding ? ` · ${esc(category(finding.category).label)}` : ''}</p>
    ${kind === 'solicitud' ? `<label class="vc-field"><span>Tipo de solicitud</span><select data-cat>${REQUEST_TYPES.map(r => `<option value="${r.id}">${esc(r.label)}</option>`).join('')}</select></label>` : ''}
    <label class="vc-field"><span>${kind === 'recomendacion' ? 'Recomendación' : kind === 'solicitud' ? 'Detalle de la solicitud' : 'Compromiso'}</span><textarea data-text rows="3" placeholder="Lo único necesario"></textarea></label>
    <details class="vc-details"><summary>${icon('clipboard')}Más datos <span class="vc-muted vc-small">(opcionales)</span>${icon('chevron')}</summary><div class="vc-details__body">
      ${kind === 'solicitud' ? `<div class="vc-grid2"><label class="vc-field"><span>Producto o servicio</span><input data-x="product"></label><label class="vc-field"><span>Cantidad</span><span class="vc-unit"><input type="number" inputmode="decimal" step="any" data-x="quantity"><select class="vc-input" data-x="unit" style="width:auto">${UNITS.map(u => `<option>${u}</option>`).join('')}</select></span></label>
        <label class="vc-field"><span>Área involucrada (ha)</span><input type="number" inputmode="decimal" step="any" data-x="area"></label><label class="vc-field"><span>Justificación</span><input data-x="justification"></label></div>` : ''}
      <div class="vc-grid2"><label class="vc-field"><span>Suerte</span><select data-lot><option value="">Finca completa</option>${recs.map(r => `<option value="${esc(r.key)}" ${r.key === lotDefault ? 'selected' : ''}>Suerte ${esc(r.identity.lot)}</option>`).join('')}</select></label>
        ${kind !== 'compromiso' ? `<label class="vc-field"><span>Prioridad</span><select data-x="priority"><option value="">Sin definir</option>${PRIORITY.map(p => `<option>${p}</option>`).join('')}</select></label>` : ''}
        <label class="vc-field"><span>Responsable</span><input data-x="responsible"></label><label class="vc-field"><span>${kind === 'solicitud' ? 'Fecha requerida' : 'Fecha de compromiso'}</span><input type="date" data-x="dueDate"></label></div>
      <label class="vc-field"><span>Observaciones</span><input data-x="notes"></label></div></details>
    <div class="vc-row-actions"><button class="vc-btn" type="button" onclick="history.back()">Cancelar</button><button class="vc-btn vc-btn--primary" type="button" data-save>${icon('check')}Guardar</button></div></section>`);
  el.addEventListener('click', async e => {
    if (!e.target.closest('[data-save]')) return;
    const text = $('[data-text]', el).value.trim(); if (!text) { toast('Escribí el detalle'); $('[data-text]', el).focus(); return; }
    const extra = {}; for (const i of $$('[data-x]', el)) if (i.value !== '') extra[i.dataset.x] = i.type === 'number' ? Number(i.value) : i.value;
    if (!extra.quantity) delete extra.unit;
    if (kind === 'solicitud') extra.category = $('[data-cat]', el).value;
    const f = await M.createFollowup({kind, visit, findingId, lotKey: $('[data-lot]', el).value || null, text, extra});
    if (finding && finding.status === 'Abierto' && kind === 'recomendacion') await M.setFindingState(finding.id, 'En seguimiento', 'Recomendación emitida');
    toast(`${KIND[kind].label} guardada`); location.hash = finding ? '#/hallazgo/' + finding.id : '#/seguimiento/' + f.id;
  });
}
export async function viewFollowup(id) {
  const f = await store.get('followups', id); if (!f) throw Error('Registro no encontrado.');
  const visit = await store.get('visits', f.visitId), photos = (await store.byIndex('photos', 'visitId', f.visitId)).filter(p => p.followupId === f.id);
  const allPhotos = await store.all('photos'), evidence = allPhotos.filter(p => p.followupId === f.id);
  const finding = f.findingId ? await store.get('findings', f.findingId) : null, before = finding ? allPhotos.filter(p => p.findingId === finding.id) : [];
  const el = mount(`<section class="vc-card"><div class="vc-card__head"><div style="min-width:0"><p class="vc-muted">${KIND[f.kind].label}${f.category ? ' · ' + esc(requestType(f.category).label) : ''} · ${fdate(f.createdAt)}</p><h2>${esc(f.text)}</h2></div><span class="vc-chip ${M.isOverdue(f) ? 'vc-chip--err' : OPEN.has(f.state) ? 'vc-chip--warn' : 'vc-chip--ok'}">${M.isOverdue(f) ? 'Vencido' : esc(f.state)}</span></div>
      <p>${esc(f.producerName)}${f.lotKey ? ' · Suerte ' + esc(lotNum(f.lotKey)) : ''}${finding ? ` · <a class="vc-link" href="#/hallazgo/${esc(finding.id)}">${esc(category(finding.category).label)}</a>` : ''}</p>
      <p class="vc-muted">${[f.product, f.quantity ? `${f.quantity} ${f.unit || ''}` : '', f.area ? `${f.area} ha` : '', f.priority ? 'Prioridad ' + f.priority : '', f.responsible ? 'Responsable: ' + f.responsible : '', f.dueDate ? 'Fecha: ' + fdate(f.dueDate) : '', f.notes].filter(Boolean).map(esc).join(' · ')}</p></section>
    ${before.length ? `<section class="vc-card"><div class="vc-card__head"><h2>${icon('image')}Evidencia inicial</h2><span class="vc-muted vc-small">Comparala con la evidencia del seguimiento</span></div><div data-before>${galleryHtml(before)}</div></section>` : ''}
    <section class="vc-card vc-form"><div class="vc-card__head"><h2>${icon('flag')}Registrar seguimiento</h2></div>
      <div class="vc-grid2"><label class="vc-field"><span>Estado</span><select data-state>${STATES[f.kind].map(s => `<option ${s === f.state ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label class="vc-field"><span>Nota (gestión, respuesta, verificación)</span><input data-note></label></div>
      <p class="vc-label">Evidencia de este seguimiento</p><div data-gal></div>
      <div class="vc-row-actions"><a class="vc-btn" href="#/nueva?finca=${esc(f.producerCode)}&seguimiento=${esc(f.id)}">${icon('calendar')}Visita de seguimiento</a><button class="vc-btn vc-btn--primary" type="button" data-apply>${icon('check')}Registrar</button></div>
      <ul class="vc-small vc-muted" style="margin:6px 0 0;padding-left:18px">${f.history.map(h => `<li>${fdt(h.at)} · ${esc(h.state)}${h.note ? ' · ' + esc(h.note) : ''}${h.by ? ' · ' + esc(h.by) : ''}</li>`).join('')}</ul></section>`);
  hydrateGallery(el, [...before, ...evidence]);
  { const n = $('[data-before]', el); if (n) bindGallery(n, () => before, {visit}); }
  await mountGallery($('[data-gal]', el), async () => (await store.byIndex('photos', 'visitId', visit.id)).filter(p => p.followupId === f.id), {visit, visitId: visit.id, followupId: f.id, lotKey: f.lotKey, role: 'seguimiento'});
  el.addEventListener('click', async e => {
    if (!e.target.closest('[data-apply]')) return;
    await M.setFollowupState(f.id, $('[data-state]', el).value, $('[data-note]', el).value.trim()); toast('Seguimiento registrado'); await viewFollowup(id);
  });
}

/* ---------- Informes ---------- */
export async function viewReports() {
  const data = await M.everything(), today = new Date().toISOString().slice(0, 10), weekAgo = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
  const el = mount(`<section class="vc-card vc-form"><div class="vc-card__head"><h2>${icon('report')}Informes y exportaciones</h2></div>
    <p class="vc-label">Consolidado por período</p><div class="vc-grid2"><label class="vc-field"><span>Desde</span><input type="date" data-from value="${weekAgo}"></label><label class="vc-field"><span>Hasta</span><input type="date" data-to value="${today}"></label></div>
    <div class="vc-row-actions vc-row-actions--start"><button class="vc-btn vc-btn--primary" type="button" data-period>${icon('report')}Ver consolidado</button></div>
    <p class="vc-label" style="margin-top:8px">Exportar todos los registros</p>
    <div class="vc-row-actions vc-row-actions--start"><button class="vc-btn" type="button" data-xlsx>${icon('download')}Excel</button><button class="vc-btn" type="button" data-geo>${icon('pin')}GeoJSON</button><a class="vc-btn" href="#/datos">${icon('archive')}Respaldo ZIP</a></div>
    <p class="vc-muted vc-small">El informe de una visita y el expediente de un productor se abren desde la visita o el productor.</p></section>
    <section class="vc-card"><div class="vc-card__head"><h2>${icon('calendar')}Informes de visitas recientes</h2></div><div class="vc-list">${data.visits.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 8).map(v => `<a class="vc-item" href="#/informe/visita/${esc(v.id)}"><span class="vc-item__ic">${icon('report')}</span><span class="vc-item__body"><span class="vc-item__title">${esc(v.producer.name)}</span><span class="vc-item__sub">${fdate(v.startedAt)}</span></span>${icon('chevron')}</a>`).join('') || '<p class="vc-empty">Sin visitas.</p>'}</div></section>`);
  el.addEventListener('click', async e => {
    if (e.target.closest('[data-period]')) location.hash = `#/informe/periodo/${$('[data-from]', el).value}_${$('[data-to]', el).value}`;
    if (e.target.closest('[data-xlsx]')) download(await excelExport(data), `Visitas_CASUR_${fileDate()}.xlsx`);
    if (e.target.closest('[data-geo]')) download(geojsonExport(data), `Visitas_CASUR_ubicaciones_${fileDate()}.geojson`);
  });
}
export async function viewReport(kind, arg) {
  const data = await M.everything(); let html = '', title = '';
  if (kind === 'visita') {
    const visit = data.visits.find(v => v.id === arg); if (!visit) throw Error('Visita no encontrada');
    const features = await featuresFor((visit.masterSnapshot?.records || []).map(r => r.identity.lotCode)).catch(() => []);
    html = visitReportHtml({visit, findings: data.findings.filter(f => f.visitId === arg), followups: data.followups.filter(f => f.visitId === arg), photos: data.photos.filter(p => p.visitId === arg), features});
    title = `Visita_${safeName(visit.producer.name)}_${fdate(visit.startedAt)}`;
  } else if (kind === 'productor') {
    const {reader} = await maestro(), farm = reader.farm(arg); const visits = data.visits.filter(v => v.producer.code === farm.code), ids = new Set(visits.map(v => v.id));
    html = producerReportHtml({farm, records: reader.lotsOf(farm.code).filter(r => r.state.presence !== 'absent'), visits, findings: data.findings.filter(f => ids.has(f.visitId)), followups: data.followups.filter(f => f.producerCode === farm.code)});
    title = `Expediente_${safeName(farm.name)}_${fileDate()}`;
  } else {
    const [from, to] = arg.split('_'), inRange = d => d.slice(0, 10) >= from && d.slice(0, 10) <= to;
    const visits = data.visits.filter(v => inRange(v.startedAt)), ids = new Set(visits.map(v => v.id));
    html = periodReportHtml({from, to, visits, findings: data.findings.filter(f => ids.has(f.visitId)), followups: data.followups.filter(f => ids.has(f.visitId) || OPEN.has(f.state))});
    title = `Consolidado_Visitas_${fdate(from)}_${fdate(to)}`;
  }
  const el = mount(`<div class="vc-row-actions vc-no-print" style="margin:0"><button class="vc-btn" type="button" onclick="history.back()">${icon('back')}Volver</button><button class="vc-btn vc-btn--primary" type="button" data-print>${icon('print')}Imprimir o guardar PDF</button></div><div class="vc-report-wrap">${html}</div>`);
  document.title = title;
  view.cleanup.push(() => { document.title = 'Visitas de Campo'; });
  el.addEventListener('click', e => { if (e.target.closest('[data-print]')) window.print(); });
}

/* ---------- Datos, respaldos y configuración ---------- */
export async function viewData() {
  const [photos, backups, storage, visits, authorName, favs, gpsAuto] = await Promise.all([store.all('photos'), store.all('backups'), store.storageState(), store.all('visits'), store.getSetting('author', ''), store.getSetting('favorites', DEFAULT_FAVORITES), store.getSetting('gpsAuto', true)]);
  const counts = Object.fromEntries(Object.keys(BACKUP_STATES).map(k => [k, photos.filter(p => p.backupState === k).length]));
  const pendingBytes = photos.filter(p => p.blob && p.backupState !== 'confirmada').reduce((s, p) => s + p.size, 0);
  const el = mount(`<section class="vc-card vc-form"><div class="vc-card__head"><h2>${icon('settings')}Configuración</h2></div>
      <label class="vc-field"><span>Nombre del técnico</span><input data-author value="${esc(authorName)}" autocomplete="name"></label>
      <label class="vc-opt" style="align-self:start"><input type="checkbox" data-gpsauto ${gpsAuto ? 'checked' : ''}><span>Ubicación automática al abrir</span></label>
      <div><p class="vc-label" style="margin-bottom:6px">Categorías favoritas (registro rápido)</p><div class="vc-opts">${CATEGORIES.map(c => `<label class="vc-opt"><input type="checkbox" value="${c.id}" data-fav ${favs.includes(c.id) ? 'checked' : ''}><span>${esc(c.label)}</span></label>`).join('')}</div></div>
      <div class="vc-row-actions"><button class="vc-btn vc-btn--soft" type="button" data-save-cfg>Guardar</button></div></section>
    <section class="vc-card"><div class="vc-card__head"><h2>${icon('archive')}Almacenamiento</h2></div>
      <p>${visits.length} visitas · ${photos.length} fotos · ${fmb(storage.usage)} usados${storage.quota ? ` de ${fmb(storage.quota)}` : ''}</p>
      ${storage.ratio !== null && storage.ratio > 0.8 ? `<p class="vc-note vc-note--warn">${icon('alert')}<span>Espacio casi lleno: exportá un respaldo y confirmalo.</span></p>` : ''}
      <p class="vc-muted">${storage.persisted ? 'Almacenamiento persistente concedido: el navegador no borrará estos datos por falta de espacio.' : 'Sin almacenamiento persistente: exportá respaldos con frecuencia.'}</p>
      ${storage.persisted ? '' : `<div class="vc-row-actions vc-row-actions--start"><button class="vc-btn" type="button" data-persist>Solicitar almacenamiento persistente</button></div>`}
      <dl class="vc-agro" style="margin-top:10px">${Object.entries(BACKUP_STATES).map(([k, l]) => `<div><dt>${esc(l)}</dt><dd>${counts[k]}</dd></div>`).join('')}</dl>
      <p class="vc-muted vc-small" style="margin-top:8px">Las fotos nunca se borran automáticamente, aunque tengan respaldo confirmado. No se suben a la nube.</p></section>
    <section class="vc-card"><div class="vc-card__head"><h2>${icon('download')}Respaldo</h2></div>
      <p>Pendiente: ${fmb(pendingBytes)} · partes de hasta ${fmb(partLimitBytes())} según la memoria de este teléfono.</p>
      <div class="vc-row-actions vc-row-actions--start"><button class="vc-btn vc-btn--primary" type="button" data-backup="pending">${icon('download')}Exportar pendientes</button><button class="vc-btn" type="button" data-backup="all">Exportar todo</button></div>
      <p class="vc-muted vc-small" style="margin-top:6px">Guardá los archivos en la computadora o en OneDrive empresarial y después confirmá el respaldo.</p>
      <div class="vc-list" style="margin-top:8px">${backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(b => `<div class="vc-item"><span class="vc-item__ic">${icon('archive')}</span><span class="vc-item__body"><span class="vc-item__title">${fdt(b.createdAt)}</span><span class="vc-item__sub">${b.parts.length} parte${b.parts.length > 1 ? 's' : ''} · ${b.parts.reduce((s, p) => s + p.photoIds.length, 0)} fotos · ${fmb(b.parts.reduce((s, p) => s + p.bytes, 0))}</span></span>
        <span class="vc-item__side">${b.confirmedAt ? `<span class="vc-chip vc-chip--ok">Confirmado</span>` : `<button class="vc-btn vc-btn--sm" type="button" data-confirm="${esc(b.id)}">Confirmar</button>`}</span></div>`).join('')}</div></section>
    <section class="vc-card"><div class="vc-card__head"><h2>${icon('sync')}Restaurar</h2></div><p class="vc-muted">Elegí una o varias partes, de uno o varios respaldos, en cualquier orden. Cada foto se verifica con su SHA-256; no se duplica nada y se conserva lo más reciente.</p>
      <div class="vc-row-actions vc-row-actions--start"><label class="vc-btn">${icon('folder')}Elegir archivos<input type="file" accept=".zip,application/zip" multiple data-restore hidden></label></div><div data-report role="status"></div></section>`);
  el.addEventListener('click', async e => {
    const t = e.target.closest('[data-save-cfg],[data-persist],[data-backup],[data-confirm]'); if (!t) return;
    if (t.matches('[data-save-cfg]')) {
      await store.setSetting('author', $('[data-author]', el).value.trim()); const auto = $('[data-gpsauto]', el).checked; await store.setSetting('gpsAuto', auto);
      await store.setSetting('favorites', $$('[data-fav]:checked', el).map(i => i.value).slice(0, 8)); auto ? startGps() : stopGps(); toast('Configuración guardada');
    }
    if (t.matches('[data-persist]')) { const ok = await store.requestPersistence(); toast(ok ? 'Almacenamiento persistente concedido' : 'El navegador no lo concedió; seguí exportando respaldos'); await viewData(); }
    if (t.matches('[data-backup]')) {
      t.disabled = true;
      try { const b = await buildBackup({scope: t.dataset.backup}); for (const p of b.parts) download(p.blob, p.name); await markExported(b); toast(`Respaldo descargado en ${b.parts.length} archivo${b.parts.length > 1 ? 's' : ''}. Confirmalo cuando lo guardes.`); await viewData(); }
      catch (err) { toast('No se pudo preparar el respaldo: ' + err.message, {kind: 'error'}); t.disabled = false; }
    }
    if (t.matches('[data-confirm]')) { await confirmBackup(t.dataset.confirm); toast('Respaldo confirmado. Las fotos siguen en el teléfono.'); await viewData(); }
  });
  el.addEventListener('change', async e => {
    if (!e.target.matches('[data-restore]') || !e.target.files.length) return;
    const r = await restoreBackup([...e.target.files]); e.target.value = '';
    $('[data-report]', el).innerHTML = `<div class="vc-note" style="margin-top:10px;display:block"><p><strong>Restauración terminada</strong> · ${r.parts} parte${r.parts === 1 ? '' : 's'}</p>
      <p>Visitas: ${r.visits.added} nuevas · ${r.visits.updated} actualizadas · ${r.visits.keptLocal} se conservaron las del teléfono.</p>
      <p>Hallazgos: ${r.findings.added} nuevos · ${r.findings.updated} actualizados. Seguimientos: ${r.followups.added} nuevos · ${r.followups.updated} actualizados.</p>
      <p>Fotos: ${r.photos.restored} restauradas · ${r.photos.alreadyPresent} ya estaban${r.photos.corrupt.length ? ` · <strong>${r.photos.corrupt.length} dañadas (no se guardaron)</strong>` : ''}${r.photos.conflicts.length ? ` · <strong>${r.photos.conflicts.length} con contenido distinto al del teléfono (se conservó la del teléfono)</strong>` : ''}${r.photos.missing.length ? ` · ${r.photos.missing.length} faltantes` : ''}${r.photos.stillUnavailable ? ` · ${r.photos.stillUnavailable} siguen sin original` : ''}.</p>
      ${r.incomplete.map(i => `<p><strong>Respaldo del ${fdt(i.createdAt)} incompleto:</strong> falta${i.missing.length > 1 ? 'n' : ''} la${i.missing.length > 1 ? 's' : ''} parte${i.missing.length > 1 ? 's' : ''} ${i.missing.join(', ')} de ${i.total}.</p>`).join('')}
      ${r.errors.length ? `<p>${r.errors.map(esc).join('<br>')}</p>` : ''}</div>`;
  });
}
