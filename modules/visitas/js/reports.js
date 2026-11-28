/* Informes de Visitas (vista previa HTML imprimible = PDF del navegador) y exportaciones (Excel, GeoJSON).
   Norma editorial CASUR (docs/ESTANDAR_EDITORIAL_INFORMES.md): encabezado uniforme, fechas dd-MMM-aaaa, mapas
   vectoriales sobre fondo claro, sin textos metodológicos, versiones internas, campos vacíos ni valores inventados. */
import {esc, fdate, ftime, fnum, blobUrl} from './ui.js';
import {category, filledDetails, KIND, requestType, PROGRESS, progressOf} from './catalog.js';
import {agroCard, ageLabel} from './agro.js';
import {locationLabel} from './photos.js';
import {placeText} from './labels.js';
import {workbook} from './xlsx.js';
import {isOverdue} from './model.js';

const LOGO = new URL('../../../shared/assets/brand/casur-logo.png', import.meta.url).href;
const lotNum = k => k ? k.split('|')[1] : '';
function header(title, lines) {
  const now = new Date().toISOString();
  return `<header class="vc-report__head"><div style="display:flex;gap:14px;align-items:center;min-width:0"><img src="${LOGO}" alt="CASUR"><div style="min-width:0"><h1>${esc(title)}</h1>${lines.filter(Boolean).map(l => `<p>${esc(l)}</p>`).join('')}</div></div>
    <div style="text-align:right;white-space:nowrap"><strong>Negocios de Caña · CASUR</strong><p>Consulta: ${fdate(now)} · ${ftime(now)}</p></div></header>`;
}
const footer = () => `<footer class="vc-report__foot"><span>Negocios de Caña · CASUR</span><span></span></footer>`;

/** Mapa vectorial (SVG) de la finca: suertes visitadas resaltadas, el resto en gris tenue, hallazgos como puntos. */
export function farmMapSvg(features, {highlight = new Set(), labels = new Map(), points = []} = {}) {
  if (!features.length) return '';
  const rings = f => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map(p => p[0]);
  const all = features.flatMap(rings).flat(); let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [a, b] of all) { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, a); y1 = Math.max(y1, b); }
  const W = 720, H = 380, k = Math.cos((y0 + y1) / 2 * Math.PI / 180), s = Math.min((W - 40) / ((x1 - x0) * k || 1e-6), (H - 40) / ((y1 - y0) || 1e-6));
  const P = ([a, b]) => [(W / 2 + (a - (x0 + x1) / 2) * k * s).toFixed(1), (H / 2 - (b - (y0 + y1) / 2) * s).toFixed(1)];
  const paths = features.map(f => { const on = highlight.has(f.properties.lotId); const d = rings(f).map(r => 'M' + r.map(pt => P(pt).join(',')).join('L') + 'Z').join('');
    return `<path d="${d}" fill="${on ? 'rgba(47,126,151,.38)' : 'rgba(148,163,184,.16)'}" stroke="${on ? '#143A46' : '#94A3B8'}" stroke-width="${on ? 1.6 : .7}"/>`; }).join('');
  const lbl = features.filter(f => labels.has(f.properties.lotId)).map(f => { const r = rings(f)[0]; let cx = 0, cy = 0; r.forEach(pt => { const [a, b] = P(pt); cx += +a; cy += +b; });
    return `<text x="${(cx / r.length).toFixed(1)}" y="${(cy / r.length).toFixed(1)}" font-size="11" font-weight="700" fill="#0F2A33" text-anchor="middle" dominant-baseline="middle">${esc(labels.get(f.properties.lotId))}</text>`; }).join('');
  const pts = points.map(p => { const [a, b] = P([p.lon, p.lat]); return `<circle cx="${a}" cy="${b}" r="5" fill="#B42318" stroke="#fff" stroke-width="2"/>`; }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="background:#F7F9FA;border:1px solid #E2E8F0;border-radius:6px" role="img" aria-label="Mapa de la finca">${paths}${lbl}${pts}</svg>`;
}

/** Evidencias numeradas: foto completa (sin recorte) y leyenda completa con fecha, ubicación verificable y descripción. */
function photoGrid(list, extra = () => '') {
  if (!list.length) return '';
  const sorted = [...list].sort((a, b) => (a.takenAt || a.addedAt).localeCompare(b.takenAt || b.addedAt));
  return `<div class="vc-report__photos">${sorted.map((p, i) => `<figure><img src="${blobUrl(p.blob || p.thumb)}" alt="Evidencia ${i + 1}"><figcaption><strong>${i + 1}</strong> · ${[fdate(p.takenAt || p.addedAt) + ' ' + ftime(p.takenAt || p.addedAt), placeText(p.location).text, extra(p), p.caption].filter(Boolean).map(esc).join(' · ')}</figcaption></figure>`).join('')}</div>`;
}

/** Informe de visita (vista previa e impresión). data: {visit, findings, followups, photos, features}. */
export function visitReportHtml({visit, findings, followups, photos, features = []}) {
  const recs = visit.masterSnapshot?.records || [], visited = visit.scope === 'finca' ? recs : recs.filter(r => visit.lotKeys.includes(r.key));
  const used = new Set([...visited.map(r => r.key), ...findings.map(f => f.lotKey).filter(Boolean)]);
  const lots = recs.filter(r => used.has(r.key));
  const hl = new Set(lots.map(r => r.identity.lotCode)), labels = new Map(lots.map(r => [r.identity.lotCode, r.identity.lot]));
  const pts = findings.filter(f => f.gps?.source === 'device').map(f => f.gps);
  const fusBy = k => followups.filter(f => f.kind === k && !f.removedFromVisit);
  const row = (...c) => `<tr>${c.map(v => `<td>${v}</td>`).join('')}</tr>`;
  const lotTable = lots.length ? `<h2>Suertes visitadas</h2><table><thead><tr><th>Suerte</th><th>Área</th><th>Variedad</th><th>Edad</th><th>Riego</th><th>Estado</th></tr></thead><tbody>
    ${lots.map(r => { const c = agroCard(r, visit.startedAt); return row(esc(r.identity.lot), c.area !== null ? fnum(c.area) + ' ha' : '—', esc(c.variety || '—'), c.age !== null ? ageLabel(c.age) : '—', esc(c.irrigation || '—'), esc(c.state || '—')); }).join('')}</tbody></table>` : '';
  const general = Object.entries(visit.general || {}).filter(([k, v]) => v && k !== 'notes');
  return `<article class="vc-report">${header('Informe de visita formal', [`${visit.producer?.name || 'Sin productor'} · Hacienda ${visit.producer?.code || '—'}`, [visit.producer?.zone, `${fdate(visit.startedAt)} ${ftime(visit.startedAt)}`, visit.author?.name ? `Técnico: ${visit.author.name}` : ''].filter(Boolean).join(' · ')])}
    ${features.length ? farmMapSvg(features, {highlight: hl, labels, points: pts}) : ''}
    ${lotTable}
    ${visit.general?.notes ? `<h2>Observación general</h2><p>${esc(visit.general.notes)}</p>` : ''}
    ${general.length ? `<p>${general.map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(' · ')}</p>` : ''}
    ${findings.length ? `<h2>Hallazgos</h2>${[...findings].sort((a, b) => a.observedAt.localeCompare(b.observedAt)).map(f => {
      const ph = photos.filter(p => p.findingId === f.id && (p.thumb || p.blob)), det = filledDetails(f.category, f.details);
      const linked = followups.filter(x => x.findingId === f.id && !x.removedFromVisit);
      return `<section class="vc-report__finding"><p><strong>${esc(category(f.category).label)}</strong> · ${f.lotKey ? 'Suerte ' + esc(lotNum(f.lotKey)) : 'Finca completa'} · ${fdate(f.observedAt)}${f.severity?.source === 'tecnico' ? ' · Severidad ' + esc(f.severity.value) : ''} · Avance: ${esc(PROGRESS[progressOf(f, followups)])}</p>
        ${f.observation ? `<p>${esc(f.observation)}</p>` : ''}${det.length ? `<p>${det.map(d => `${esc(d.label)}: <strong>${esc(d.value)}</strong>`).join(' · ')}</p>` : ''}
        ${linked.map(x => `<p class="vc-report__rec"><strong>${esc(KIND[x.kind].label)}:</strong> ${esc(x.text || '—')} <em>(${esc(x.state)})</em></p>`).join('')}
        ${photoGrid(ph)}</section>`;
    }).join('')}` : ''}
    ${(() => { const own = photos.filter(p => !p.findingId && !p.followupId && (p.thumb || p.blob)); return own.length ? `<h2>Evidencias de la visita</h2>${photoGrid(own)}` : ''; })()}
    ${(() => { const fu = photos.filter(p => p.followupId && (p.thumb || p.blob)); if (!fu.length) return ''; const byId = new Map(followups.map(x => [x.id, x]));
      return `<h2>Evidencias del seguimiento</h2>${photoGrid(fu, p => byId.get(p.followupId) ? `${KIND[byId.get(p.followupId).kind].label}: ${byId.get(p.followupId).text}` : '')}`; })()}
    ${['recomendacion', 'solicitud', 'compromiso'].map(k => { const list = fusBy(k); if (!list.length) return '';
      return `<h2>${KIND[k].plural}</h2><table><thead><tr><th>Detalle</th><th>Suerte</th><th>Responsable</th><th>Fecha compromiso</th><th>Estado</th></tr></thead><tbody>${list.map(f => row(esc([f.category ? requestType(f.category).label : '', f.text, f.quantity ? `${f.quantity} ${f.unit || ''}` : ''].filter(Boolean).join(' · ')), esc(lotNum(f.lotKey) || '—'), esc(f.responsible || '—'), f.dueDate ? fdate(f.dueDate) : '—', esc(f.state))).join('')}</tbody></table>`; }).join('')}
    ${footer()}</article>`;
}

const row = (...c) => `<tr>${c.map(v => `<td>${v}</td>`).join('')}</tr>`;
const origin = x => x.visitId ? 'Visita formal' : 'Hallazgo de campo';
const pname = x => x.producer?.name || x.producerName || 'Sin identificar';
const CLOSED = ['Ejecutado', 'Verificado', 'Atendida', 'Cumplido', 'Cancelado', 'Cancelada', 'Rechazada', 'Incumplido'];
function findingBlock(f, followups, photos) {
  const ph = photos.filter(p => p.findingId === f.id && (p.thumb || p.blob)), det = filledDetails(f.category, f.details), linked = followups.filter(x => x.findingId === f.id && !x.removedFromVisit);
  return `<section class="vc-report__finding"><p><strong>${esc(category(f.category).label)}</strong> · ${esc(pname(f))} · ${f.lotKey ? 'Suerte ' + esc(lotNum(f.lotKey)) : 'Finca completa'} · ${fdate(f.observedAt)} · ${origin(f)}${f.severity?.source === 'tecnico' ? ' · Severidad ' + esc(f.severity.value) : ''} · Avance: ${esc(PROGRESS[progressOf(f, followups)])}</p>
    ${f.observation ? `<p>${esc(f.observation)}</p>` : ''}${f.diagnosis ? `<p><strong>Diagnóstico o hipótesis:</strong> ${esc(f.diagnosis)}</p>` : ''}${det.length ? `<p>${det.map(d => `${esc(d.label)}: <strong>${esc(d.value)}</strong>`).join(' · ')}</p>` : ''}
    ${linked.map(x => `<p class="vc-report__rec"><strong>${esc(KIND[x.kind].label)}:</strong> ${esc(x.text || '—')} <em>(${esc(x.state)})</em></p>`).join('')}
    ${photoGrid(ph)}</section>`;
}

/** Hallazgo individual (de visita o de campo) con su seguimiento y evidencias antes/después. */
export function findingReportHtml({finding: f, visit = null, followups, photos, followPhotos = [], features = []}) {
  const rec = f.record || visit?.masterSnapshot?.records?.find(r => r.key === f.lotKey) || null, c = rec ? agroCard(rec, f.observedAt) : null;
  const hist = [...(f.history || []).map(h => ({...h, what: 'Hallazgo'})), ...followups.flatMap(x => (x.history || []).map(h => ({...h, what: KIND[x.kind].label})))].sort((a, b) => a.at.localeCompare(b.at));
  return `<article class="vc-report">${header(`${f.visitId ? 'Hallazgo de visita formal' : 'Hallazgo de campo'} · ${category(f.category).label}`, [`${pname(f)}${f.producer?.code ? ' · Hacienda ' + f.producer.code : ''}`, [f.lotKey ? `Suerte ${lotNum(f.lotKey)}${rec ? ' · código ' + rec.identity.lotCode : ''}` : 'Finca completa', `${fdate(f.observedAt)} ${ftime(f.observedAt)}`, f.author ? `Técnico: ${f.author}` : ''].filter(Boolean).join(' · ')])}
    ${features.length && rec ? farmMapSvg(features, {highlight: new Set([rec.identity.lotCode]), labels: new Map([[rec.identity.lotCode, rec.identity.lot]]), points: f.gps?.source === 'device' ? [f.gps] : []}) : ''}
    ${c ? `<p>${esc([c.variety ? 'Variedad ' + c.variety : '', c.age !== null ? 'Edad ' + ageLabel(c.age) : '', c.area !== null ? fnum(c.area) + ' ha' : '', c.irrigation, f.phenology?.corrected || c.phenology?.stage ? `${f.phenology?.corrected || c.phenology.stage} (${f.phenology?.corrected ? 'corregida en campo' : 'probable por edad'})` : ''].filter(Boolean).join(' · '))}</p>` : ''}
    <h2>1 · Observado</h2>${findingBlock(f, followups, photos)}
    <h2>2 · Recomendación, solicitudes y compromisos</h2>${followups.length ? `<table><thead><tr><th>Tipo</th><th>Detalle</th><th>Responsable</th><th>Fecha</th><th>Estado</th></tr></thead><tbody>${followups.map(x => row(esc(KIND[x.kind].label), esc(x.text || '—'), esc(x.responsible || '—'), x.dueDate ? fdate(x.dueDate) : '—', esc(isOverdue(x) ? 'Vencido' : x.state))).join('')}</tbody></table>` : '<p>Sin recomendaciones registradas.</p>'}
    <h2>3 · Seguimiento y verificación</h2>${hist.length ? `<table><thead><tr><th>Fecha</th><th>Registro</th><th>Estado</th><th>Nota</th></tr></thead><tbody>${hist.map(h => row(`${fdate(h.at)} ${ftime(h.at)}`, esc(h.what), esc(h.state), esc([h.note, h.by].filter(Boolean).join(' · ') || '—'))).join('')}</tbody></table>` : ''}
    ${followPhotos.length ? `<h2>Evidencias del seguimiento (después)</h2>${photoGrid(followPhotos)}` : ''}
    ${footer()}</article>`;
}

/** Expediente técnico del productor: visitas formales y registros independientes. */
export function producerReportHtml({farm, records, visits, findings, followups, photos = []}) {
  const byCat = Object.entries(findings.reduce((a, f) => (a[f.category] = (a[f.category] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]);
  const lastAt = key => [...visits.filter(v => v.scope === 'finca' || v.lotKeys.includes(key)).map(v => v.startedAt), ...findings.filter(f => f.lotKey === key).map(f => f.observedAt)].sort().pop();
  const field = findings.filter(f => !f.visitId);
  return `<article class="vc-report">${header('Expediente técnico del productor', [`${farm.name} · Hacienda ${farm.code}`, `${farm.zone || ''} · ${visits.length} visitas formales · ${field.length} hallazgos de campo · ${photos.length} evidencias`])}
    <h2>Suertes</h2><table><thead><tr><th>Suerte</th><th>Código</th><th>Área</th><th>Variedad</th><th>Edad</th><th>Riego</th><th>Último registro</th><th>Abiertos</th></tr></thead><tbody>
      ${records.map(r => { const c = agroCard(r, new Date().toISOString()), lv = lastAt(r.key), open = findings.filter(f => f.lotKey === r.key && ['Abierto', 'En seguimiento'].includes(f.status)).length;
        return row(esc(r.identity.lot), esc(r.identity.lotCode), c.area !== null ? fnum(c.area) + ' ha' : '—', esc(c.variety || '—'), c.age !== null ? ageLabel(c.age) : '—', esc(c.irrigation || '—'), lv ? fdate(lv) : '—', open || '—'); }).join('')}</tbody></table>
    ${byCat.length ? `<h2>Problemas registrados</h2><table><thead><tr><th>Categoría</th><th>Hallazgos</th><th>Suertes</th></tr></thead><tbody>${byCat.map(([c, n]) => row(esc(category(c).label), n, esc([...new Set(findings.filter(f => f.category === c).map(f => lotNum(f.lotKey) || 'Finca'))].join(', ')))).join('')}</tbody></table>` : ''}
    ${findings.length ? `<h2>Hallazgos</h2>${[...findings].sort((a, b) => b.observedAt.localeCompare(a.observedAt)).map(f => findingBlock(f, followups, photos)).join('')}` : ''}
    ${followups.length ? `<h2>Recomendaciones, solicitudes y compromisos</h2><table><thead><tr><th>Tipo</th><th>Detalle</th><th>Origen</th><th>Emitido</th><th>Compromiso</th><th>Estado</th></tr></thead><tbody>${followups.map(f => row(KIND[f.kind].label, esc(f.text || '—'), f.visitId ? 'Visita formal' : 'Campo', fdate(f.createdAt), f.dueDate ? fdate(f.dueDate) : '—', esc(isOverdue(f) ? 'Vencido' : f.state))).join('')}</tbody></table>` : ''}
    ${visits.length ? `<h2>Visitas formales</h2><table><thead><tr><th>Fecha</th><th>Suertes</th><th>Hallazgos</th><th>Técnico</th></tr></thead><tbody>${visits.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map(v => row(fdate(v.startedAt), esc(v.scope === 'finca' ? 'Finca completa' : v.lotKeys.map(lotNum).join(', ') || '—'), findings.filter(f => f.visitId === v.id).length, esc(v.author?.name || '—'))).join('')}</tbody></table>` : ''}
    ${footer()}</article>`;
}

/** Gestión de un período: visitas formales, hallazgos de campo, evidencias y seguimiento; opcionalmente por técnico. */
export function periodReportHtml({from, to, visits, findings, followups, photos = [], byTechnician = false}) {
  const field = findings.filter(f => !f.visitId), producers = new Set([...visits.map(v => v.producer.code), ...findings.map(f => f.producer?.code), ...photos.map(p => p.producer?.code)].filter(Boolean));
  const byCat = Object.entries(findings.reduce((a, f) => (a[f.category] = (a[f.category] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]);
  const pend = followups.filter(f => !CLOSED.includes(f.state));
  const tech = () => { const m = new Map(), add = (who, k) => { const key = who || 'Sin técnico indicado'; const o = m.get(key) || {visitas: 0, campo: 0, visita: 0, seguimientos: 0}; o[k]++; m.set(key, o); };
    visits.forEach(v => add(v.author?.name, 'visitas')); findings.forEach(f => add(f.author, f.visitId ? 'visita' : 'campo'));
    followups.forEach(f => (f.history || []).slice(1).filter(h => h.at.slice(0, 10) >= from && h.at.slice(0, 10) <= to).forEach(h => add(h.by, 'seguimientos')));
    return `<h2>Gestión por técnico</h2><table><thead><tr><th>Técnico</th><th>Visitas formales</th><th>Hallazgos en visitas</th><th>Hallazgos de campo</th><th>Seguimientos registrados</th></tr></thead><tbody>${[...m].map(([k, o]) => row(esc(k), o.visitas, o.visita, o.campo, o.seguimientos)).join('')}</tbody></table>`; };
  return `<article class="vc-report">${header(byTechnician ? 'Gestión por técnico' : 'Gestión del período', [`Del ${fdate(from)} al ${fdate(to)}`, `${visits.length} visitas formales · ${field.length} hallazgos de campo · ${photos.length} evidencias · ${producers.size} productores atendidos`])}
    ${byTechnician ? tech() : ''}
    ${byCat.length ? `<h2>Hallazgos por categoría</h2><table><thead><tr><th>Categoría</th><th>En visitas formales</th><th>De campo</th></tr></thead><tbody>${byCat.map(([c]) => row(esc(category(c).label), findings.filter(f => f.category === c && f.visitId).length, findings.filter(f => f.category === c && !f.visitId).length)).join('')}</tbody></table>` : ''}
    ${visits.length ? `<h2>Visitas formales</h2><table><thead><tr><th>Fecha</th><th>Productor</th><th>Suertes</th><th>Hallazgos</th><th>Técnico</th></tr></thead><tbody>${visits.sort((a, b) => a.startedAt.localeCompare(b.startedAt)).map(v => row(fdate(v.startedAt), esc(v.producer.name), esc(v.scope === 'finca' ? 'Finca completa' : v.lotKeys.map(lotNum).join(', ')), findings.filter(f => f.visitId === v.id).length, esc(v.author?.name || '—'))).join('')}</tbody></table>` : ''}
    ${field.length ? `<h2>Hallazgos de campo (sin visita formal)</h2><table><thead><tr><th>Fecha</th><th>Productor</th><th>Suerte</th><th>Categoría</th><th>Estado</th><th>Técnico</th></tr></thead><tbody>${field.sort((a, b) => a.observedAt.localeCompare(b.observedAt)).map(f => row(fdate(f.observedAt), esc(pname(f)), esc(lotNum(f.lotKey) || 'Finca'), esc(category(f.category).label), esc(f.status), esc(f.author || '—'))).join('')}</tbody></table>` : ''}
    ${pend.length ? `<h2>Pendientes</h2><table><thead><tr><th>Tipo</th><th>Productor</th><th>Detalle</th><th>Compromiso</th><th>Estado</th></tr></thead><tbody>${pend.map(f => row(KIND[f.kind].label, esc(pname(f)), esc(f.text || '—'), f.dueDate ? fdate(f.dueDate) : '—', esc(isOverdue(f) ? 'Vencido' : f.state))).join('')}</tbody></table>` : ''}
    ${footer()}</article>`;
}
/** Seguimientos pendientes (abiertos y vencidos), de visitas formales y de campo. */
export function pendingReportHtml({followups, findings}) {
  const pend = followups.filter(f => !CLOSED.includes(f.state)).sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9')), byId = new Map(findings.map(f => [f.id, f]));
  return `<article class="vc-report">${header('Seguimientos pendientes', [`${pend.length} pendientes · ${pend.filter(isOverdue).length} vencidos`])}
    ${pend.length ? `<table><thead><tr><th>Compromiso</th><th>Tipo</th><th>Productor</th><th>Suerte</th><th>Detalle</th><th>Hallazgo</th><th>Origen</th><th>Responsable</th><th>Estado</th></tr></thead><tbody>${pend.map(f => row(f.dueDate ? fdate(f.dueDate) : '—', KIND[f.kind].label, esc(pname(f)), esc(lotNum(f.lotKey) || 'Finca'), esc(f.text || '—'), esc(byId.get(f.findingId) ? category(byId.get(f.findingId).category).label : '—'), f.visitId ? 'Visita formal' : 'Campo', esc(f.responsible || '—'), esc(isOverdue(f) ? 'Vencido' : f.state))).join('')}</tbody></table>` : '<p>Sin seguimientos pendientes.</p>'}
    ${footer()}</article>`;
}
/** Evidencias fotográficas de un período, por productor y origen. */
export function evidenceReportHtml({from, to, photos}) {
  const groups = Object.entries(photos.reduce((a, p) => { const k = p.producer?.name || 'Sin identificar'; (a[k] ??= []).push(p); return a; }, {})).sort((a, b) => a[0].localeCompare(b[0]));
  const kind = p => p.followupId ? 'Seguimiento' : p.findingId ? 'Hallazgo' : p.visitId ? 'Visita formal' : 'Evidencia rápida';
  return `<article class="vc-report">${header('Evidencias fotográficas', [`Del ${fdate(from)} al ${fdate(to)}`, `${photos.length} fotografías originales`])}
    ${groups.map(([name, list]) => `<h2>${esc(name)}</h2>${photoGrid(list, p => [kind(p), p.lotKey ? 'Suerte ' + lotNum(p.lotKey) : ''].filter(Boolean).join(' · '))}`).join('') || '<p>Sin fotografías en el período.</p>'}
    ${footer()}</article>`;
}

/* ---------- Exportaciones ---------- */
export function excelExport({visits, findings, followups, photos}) {
  return workbook([
    {name: 'Visitas formales', rows: [['Fecha', 'Hora', 'Código', 'Productor', 'Zona', 'Alcance', 'Suertes', 'Técnico', 'Estado', 'Generación del Maestro', 'ID'],
      ...visits.map(v => [fdate(v.startedAt), ftime(v.startedAt), v.producer?.code, v.producer?.name, v.producer?.zone, v.scope === 'finca' ? 'Finca completa' : 'Suertes', (v.lotKeys || []).map(lotNum).join(', '), v.author?.name, v.status, v.masterSnapshot?.dataVersion, v.id])]},
    {name: 'Hallazgos', rows: [['Fecha', 'Origen', 'Código', 'Productor', 'Suerte', 'Código de suerte', 'Categoría', 'Observación', 'Diagnóstico o hipótesis', 'Detalles', 'Severidad evaluada', 'Etapa probable', 'Etapa corregida', 'Estado', 'Técnico', 'Latitud', 'Longitud', 'Precisión (m)', 'Visita', 'ID'],
      ...findings.map(f => [fdate(f.observedAt), origin(f), f.producer?.code ?? '', pname(f), lotNum(f.lotKey) || 'Finca', f.record?.identity?.lotCode ?? '', category(f.category).label, f.observation, f.diagnosis || '', filledDetails(f.category, f.details).map(d => `${d.label}: ${d.value}`).join(' · '), f.severity?.source === 'tecnico' ? f.severity.value : '', f.phenology?.computed, f.phenology?.corrected, f.status, f.author || '', f.gps?.source === 'device' ? f.gps.lat : '', f.gps?.source === 'device' ? f.gps.lon : '', f.gps?.source === 'device' ? f.gps.accuracy : '', f.visitId || '', f.id])]},
    {name: 'Seguimiento', rows: [['Tipo', 'Emitido', 'Origen', 'Código', 'Productor', 'Suerte', 'Detalle', 'Producto o servicio', 'Cantidad', 'Unidad', 'Área (ha)', 'Prioridad', 'Responsable', 'Fecha compromiso', 'Estado', 'Vencido', 'Hallazgo', 'ID'],
      ...followups.map(f => [KIND[f.kind].label, fdate(f.createdAt), f.visitId ? 'Visita formal' : 'Campo', f.producerCode, pname(f), lotNum(f.lotKey), f.text, [f.category ? requestType(f.category).label : '', f.product].filter(Boolean).join(' · '), f.quantity ?? '', f.unit, f.area ?? '', f.priority, f.responsible, f.dueDate ? fdate(f.dueDate) : '', f.state, isOverdue(f) ? 'Sí' : '', f.findingId || '', f.id])]},
    {name: 'Fotos', rows: [['Fecha', 'Origen', 'Código', 'Productor', 'Suerte', 'Comentario', 'Ubicación', 'Latitud', 'Longitud', 'Visita', 'Hallazgo', 'Seguimiento', 'Respaldo', 'SHA-256', 'ID'],
      ...photos.map(p => [fdate(p.takenAt || p.addedAt), p.followupId ? 'Seguimiento' : p.findingId ? 'Hallazgo' : p.visitId ? 'Visita formal' : 'Evidencia rápida', p.producer?.code ?? '', pname(p), lotNum(p.lotKey), p.caption, locationLabel(p.location), p.location?.lat ?? '', p.location?.lon ?? '', p.visitId || '', p.findingId || '', p.followupId || '', p.backupState, p.sha256, p.id])]},
  ]);
}
export function geojsonExport({findings, photos}) {
  const feat = (loc, props) => ({type: 'Feature', geometry: {type: 'Point', coordinates: [loc.lon, loc.lat]}, properties: props});
  return new Blob([JSON.stringify({type: 'FeatureCollection', features: [
    ...findings.filter(f => f.gps?.source === 'device').map(f => feat(f.gps, {tipo: 'hallazgo', origen: origin(f), id: f.id, fecha: f.observedAt, categoria: category(f.category).label, productor: pname(f), suerte: lotNum(f.lotKey), estado: f.status, precision_m: f.gps.accuracy})),
    ...photos.filter(p => p.location && p.location.source !== 'none' && Number.isFinite(p.location.lat)).map(p => feat(p.location, {tipo: 'foto', id: p.id, fecha: p.takenAt || p.addedAt, productor: pname(p), suerte: lotNum(p.lotKey), origen_ubicacion: p.location.source, aproximada: !!p.location.approximate, precision_m: p.location.accuracy ?? null, sha256: p.sha256})),
  ]}, null, 1)], {type: 'application/geo+json'});
}
