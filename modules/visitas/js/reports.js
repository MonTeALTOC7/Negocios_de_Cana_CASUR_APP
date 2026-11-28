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
  return `<article class="vc-report">${header('Informe de visita', [`${visit.producer.name} · Código ${visit.producer.code}`, [visit.producer.zone, `${fdate(visit.startedAt)} ${ftime(visit.startedAt)}`, visit.author?.name ? `Técnico: ${visit.author.name}` : ''].filter(Boolean).join(' · ')])}
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

/** Expediente técnico del productor. */
export function producerReportHtml({farm, records, visits, findings, followups}) {
  const byCat = Object.entries(findings.reduce((a, f) => (a[f.category] = (a[f.category] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]);
  const lastVisit = key => visits.filter(v => v.scope === 'finca' || v.lotKeys.includes(key)).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const row = (...c) => `<tr>${c.map(v => `<td>${v}</td>`).join('')}</tr>`;
  return `<article class="vc-report">${header('Expediente técnico del productor', [`${farm.name} · Código ${farm.code}`, `${farm.zone || ''} · ${visits.length} visitas · ${findings.length} hallazgos`])}
    <h2>Suertes</h2><table><thead><tr><th>Suerte</th><th>Área</th><th>Variedad</th><th>Edad</th><th>Última visita</th><th>Abiertos</th></tr></thead><tbody>
      ${records.map(r => { const c = agroCard(r, new Date().toISOString()), lv = lastVisit(r.key), open = findings.filter(f => f.lotKey === r.key && ['Abierto', 'En seguimiento'].includes(f.status)).length;
        return row(esc(r.identity.lot), c.area !== null ? fnum(c.area) + ' ha' : '—', esc(c.variety || '—'), c.age !== null ? ageLabel(c.age) : '—', lv ? fdate(lv.startedAt) : '—', open || '—'); }).join('')}</tbody></table>
    ${byCat.length ? `<h2>Problemas registrados</h2><table><thead><tr><th>Categoría</th><th>Hallazgos</th><th>Suertes</th></tr></thead><tbody>${byCat.map(([c, n]) => row(esc(category(c).label), n, esc([...new Set(findings.filter(f => f.category === c).map(f => lotNum(f.lotKey) || 'Finca'))].join(', ')))).join('')}</tbody></table>` : ''}
    ${followups.length ? `<h2>Recomendaciones, solicitudes y compromisos</h2><table><thead><tr><th>Tipo</th><th>Detalle</th><th>Emitido</th><th>Compromiso</th><th>Estado</th></tr></thead><tbody>${followups.map(f => row(KIND[f.kind].label, esc(f.text || '—'), fdate(f.createdAt), f.dueDate ? fdate(f.dueDate) : '—', esc(isOverdue(f) ? 'Vencido' : f.state))).join('')}</tbody></table>` : ''}
    ${visits.length ? `<h2>Visitas</h2><table><thead><tr><th>Fecha</th><th>Suertes</th><th>Hallazgos</th><th>Técnico</th></tr></thead><tbody>${visits.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map(v => row(fdate(v.startedAt), esc(v.scope === 'finca' ? 'Finca completa' : v.lotKeys.map(lotNum).join(', ') || '—'), findings.filter(f => f.visitId === v.id).length, esc(v.author?.name || '—'))).join('')}</tbody></table>` : ''}
    ${footer()}</article>`;
}

/** Consolidado de un período. */
export function periodReportHtml({from, to, visits, findings, followups}) {
  const byCat = Object.entries(findings.reduce((a, f) => (a[f.category] = (a[f.category] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]);
  const producers = [...new Set(visits.map(v => v.producer.code))].length;
  const row = (...c) => `<tr>${c.map(v => `<td>${v}</td>`).join('')}</tr>`;
  const pend = followups.filter(f => !['Ejecutado', 'Verificado', 'Atendida', 'Cumplido', 'Cancelado', 'Cancelada', 'Rechazada'].includes(f.state));
  return `<article class="vc-report">${header('Consolidado de visitas', [`Del ${fdate(from)} al ${fdate(to)}`, `${visits.length} visitas · ${producers} productores · ${findings.length} hallazgos`])}
    ${byCat.length ? `<h2>Hallazgos por categoría</h2><table><thead><tr><th>Categoría</th><th>Hallazgos</th></tr></thead><tbody>${byCat.map(([c, n]) => row(esc(category(c).label), n)).join('')}</tbody></table>` : ''}
    <h2>Visitas</h2><table><thead><tr><th>Fecha</th><th>Productor</th><th>Suertes</th><th>Hallazgos</th></tr></thead><tbody>${visits.sort((a, b) => a.startedAt.localeCompare(b.startedAt)).map(v => row(fdate(v.startedAt), esc(v.producer.name), esc(v.scope === 'finca' ? 'Finca completa' : v.lotKeys.map(lotNum).join(', ')), findings.filter(f => f.visitId === v.id).length)).join('')}</tbody></table>
    ${pend.length ? `<h2>Pendientes</h2><table><thead><tr><th>Tipo</th><th>Productor</th><th>Detalle</th><th>Compromiso</th><th>Estado</th></tr></thead><tbody>${pend.map(f => row(KIND[f.kind].label, esc(f.producerName), esc(f.text || '—'), f.dueDate ? fdate(f.dueDate) : '—', esc(isOverdue(f) ? 'Vencido' : f.state))).join('')}</tbody></table>` : ''}
    ${footer()}</article>`;
}

/* ---------- Exportaciones ---------- */
export function excelExport({visits, findings, followups, photos}) {
  const vById = new Map(visits.map(v => [v.id, v]));
  return workbook([
    {name: 'Visitas', rows: [['Fecha', 'Hora', 'Código', 'Productor', 'Zona', 'Alcance', 'Suertes', 'Técnico', 'Estado', 'Generación del Maestro', 'ID'],
      ...visits.map(v => [fdate(v.startedAt), ftime(v.startedAt), v.producer.code, v.producer.name, v.producer.zone, v.scope === 'finca' ? 'Finca completa' : 'Suertes', v.lotKeys.map(lotNum).join(', '), v.author?.name, v.status, v.masterSnapshot?.dataVersion, v.id])]},
    {name: 'Hallazgos', rows: [['Fecha', 'Código', 'Productor', 'Suerte', 'Categoría', 'Observación', 'Detalles', 'Severidad evaluada', 'Etapa probable', 'Etapa corregida', 'Estado', 'Latitud', 'Longitud', 'Precisión (m)', 'ID'],
      ...findings.map(f => { const v = vById.get(f.visitId); return [fdate(f.observedAt), v?.producer.code, v?.producer.name, lotNum(f.lotKey) || 'Finca', category(f.category).label, f.observation, filledDetails(f.category, f.details).map(d => `${d.label}: ${d.value}`).join(' · '), f.severity?.source === 'tecnico' ? f.severity.value : '', f.phenology?.computed, f.phenology?.corrected, f.status, f.gps?.source === 'device' ? f.gps.lat : '', f.gps?.source === 'device' ? f.gps.lon : '', f.gps?.source === 'device' ? f.gps.accuracy : '', f.id]; })]},
    {name: 'Seguimiento', rows: [['Tipo', 'Emitido', 'Código', 'Productor', 'Suerte', 'Detalle', 'Producto o servicio', 'Cantidad', 'Unidad', 'Área (ha)', 'Prioridad', 'Responsable', 'Fecha compromiso', 'Estado', 'Vencido', 'ID'],
      ...followups.map(f => [KIND[f.kind].label, fdate(f.createdAt), f.producerCode, f.producerName, lotNum(f.lotKey), f.text, [f.category ? requestType(f.category).label : '', f.product].filter(Boolean).join(' · '), f.quantity ?? '', f.unit, f.area ?? '', f.priority, f.responsible, f.dueDate ? fdate(f.dueDate) : '', f.state, isOverdue(f) ? 'Sí' : '', f.id])]},
    {name: 'Fotos', rows: [['Fecha', 'Visita', 'Hallazgo', 'Suerte', 'Descripción', 'Ubicación', 'Latitud', 'Longitud', 'Respaldo', 'SHA-256', 'ID'],
      ...photos.map(p => [fdate(p.takenAt || p.addedAt), p.visitId, p.findingId, lotNum(p.lotKey), p.caption, locationLabel(p.location), p.location?.lat ?? '', p.location?.lon ?? '', p.backupState, p.sha256, p.id])]},
  ]);
}
export function geojsonExport({visits, findings, photos}) {
  const vById = new Map(visits.map(v => [v.id, v]));
  const feat = (loc, props) => ({type: 'Feature', geometry: {type: 'Point', coordinates: [loc.lon, loc.lat]}, properties: props});
  return new Blob([JSON.stringify({type: 'FeatureCollection', features: [
    ...findings.filter(f => f.gps?.source === 'device').map(f => feat(f.gps, {tipo: 'hallazgo', id: f.id, fecha: f.observedAt, categoria: category(f.category).label, productor: vById.get(f.visitId)?.producer.name, suerte: lotNum(f.lotKey), estado: f.status, precision_m: f.gps.accuracy})),
    ...photos.filter(p => p.location && p.location.source !== 'none').map(p => feat(p.location, {tipo: 'foto', id: p.id, fecha: p.takenAt || p.addedAt, origen_ubicacion: p.location.source, precision_m: p.location.accuracy ?? null, sha256: p.sha256})),
  ]}, null, 1)], {type: 'application/geo+json'});
}
