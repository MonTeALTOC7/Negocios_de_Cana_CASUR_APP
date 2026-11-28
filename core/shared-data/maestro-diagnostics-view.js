/* Vista del diagnóstico del Maestro Central en el Centro Maestro. Solo lectura: no ofrece acciones que modifiquen datos. */
import {runMaestroDiagnostics} from './maestro-diagnostics.js';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export function formatDate(value) {
  const m = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${MONTHS[Number(m[2]) - 1]}-${m[1]}` : '—';
}
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
const ha = v => v === null || v === undefined ? '—' : Number(v).toLocaleString('es-NI', {maximumFractionDigits: 2});
const FIELD = {area: 'Área', variety: 'Variedad', irrigationType: 'Tipo de riego', texture: 'Textura', zone: 'Zona', cut: 'Corte', destination: 'Destino'};
const POLICY = {null: 'Sin generación local', 'explicit-official': 'Datos oficiales elegidos', official: 'Al día con la generación oficial',
  pinned: 'Generación local fijada', 'not-newer': 'Generación local vigente', offline: 'Sin conexión', preserved: 'Generación local preservada',
  customized: 'Generación local con cambios propios'};

function moduleRow(m) {
  const c = m.comparison, origin = {local: 'Copia del dispositivo', published: 'Copia publicada del módulo', unavailable: 'No disponible'}[m.origin] || '—';
  const date = m.version ? formatDate(m.version.cutoff || m.version.estimateDate || m.version.generatedAt) : '—';
  const ids = c ? `${c.matched} coinciden${c.onlyCentral.length ? ` · ${c.onlyCentral.length} faltan` : ''}${c.onlyModule.length ? ` · ${c.onlyModule.length} sobran` : ''}${c.duplicates.length ? ` · ${c.duplicates.length} duplicadas` : ''}` : '—';
  const diffs = c ? Object.entries(c.diffs).map(([f, n]) => `${FIELD[f] || f} ${n}`).join(' · ') || 'Sin diferencias' : esc(m.note || m.error || '—');
  let detail = '';
  if (c?.diffs.area) {
    const a = c.area;
    detail = `<details class="mc-diag__detail"><summary>Diferencias de área</summary>
      <ul class="mc-diag__list">
        <li><strong>${a.presentNonProductive.length}</strong> suertes presentes no productivas: la generación oficial trae 0 ha; no indica pérdida física.</li>
        <li><strong>${a.absent.length}</strong> ausentes de la fuente: conservan su identidad y su área heredada.</li>
        <li><strong>${a.minor.length}</strong> diferencias menores (≤ 0,02 ha), sin declarar remensura.</li>
        <li><strong>${a.toReconcile.length}</strong> por conciliar con su fuente, fecha y significado.</li>
      </ul>
      ${a.toReconcile.length ? `<div class="mc-diag__scroll"><table class="mc-diag__table"><thead><tr><th>Suerte</th><th>Oficial (ha)</th><th>${esc(m.name)} (ha)</th><th>Estado</th></tr></thead><tbody>
        ${a.toReconcile.map(r => `<tr><td>${esc(r.key.replace('|', ' · '))}</td><td>${ha(r.central)}</td><td>${ha(r.module)}</td><td>${esc(r.state || '—')}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
    </details>`;
  }
  const extra = [...Object.entries(m.temporal || {}).map(([f, t]) => `${esc(f)}: ${esc(t)}`), ...Object.entries(m.notEquivalent || {}).map(([f, t]) => `${esc(f)}: ${esc(t)}`)];
  return `<div class="mc-diag__module">
    <div class="mc-diag__mhead"><strong>${esc(m.name)}</strong><span>${esc(origin)} · ${esc(date)}</span></div>
    <div class="mc-diag__mbody"><span>Identidades: ${esc(ids)}</span><span>Diferencias: ${esc(diffs)}</span></div>
    ${extra.length ? `<p class="mc-diag__note">No se comparan: ${extra.join(' · ')}</p>` : ''}
    ${detail}</div>`;
}

export async function renderMaestroDiagnostics(box, {base} = {}) {
  box.innerHTML = '<p class="panel__note" role="status">Revisando el Maestro Central…</p>';
  // Las referencias GIS se sirven solo desde su caché verificada: se pide prepararla (sin efecto si ya está lista).
  try { navigator.serviceWorker?.controller?.postMessage({type: 'WARM_GEO'}); } catch { /* sin SW */ }
  let d;
  try { d = await runMaestroDiagnostics(base ? {base} : {}); }
  catch (e) { box.innerHTML = `<p class="panel__note" role="alert">No se pudo leer la generación oficial (${esc(e.message)}). Abrí el Maestro de Suertes con conexión y volvé a intentar.</p>`; return null; }
  const r = d.resolution, v = d.contract;
  const local = r.localVersion ? `${r.localVersion}${r.localKind === 'siagri' ? ' · importación SIAGRI' : r.localKind === 'operational' ? ' · importación por contenido' : ''}` : 'Ninguna';
  box.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="stat__label">Generación oficial</div><div class="stat__value">${esc(r.officialVersion)}</div></div>
      <div class="stat"><div class="stat__label">Aforo oficial</div><div class="stat__value">${esc(formatDate(v.aforoDate))}</div></div>
      <div class="stat"><div class="stat__label">Generación local</div><div class="stat__value">${esc(local)}</div></div>
      <div class="stat"><div class="stat__label">Fuente efectiva</div><div class="stat__value">${r.effective === 'local' ? 'Local' : 'Oficial'} · ${esc(v.dataVersion)}</div></div>
      <div class="stat"><div class="stat__label">Estado de actualización</div><div class="stat__value">${esc(POLICY[r.policy] || r.policy)}</div></div>
      <div class="stat"><div class="stat__label">Referencias GIS</div><div class="stat__value">${v.gisVersion ? esc(v.gisVersion) : 'Pendientes de preparar'}</div></div>
      <div class="stat"><div class="stat__label">Suertes en el contrato</div><div class="stat__value">${d.count.toLocaleString('es-NI')}${d.issues.length ? ` · ${d.issues.length} observaciones` : ''}</div></div>
    </div>
    <p class="panel__note mc-diag__reason">${esc(r.reason)}${r.warning === 'local-incompatible' ? ' Producción y el resto de módulos no ven la misma generación.' : r.warning === 'local-reduced' ? ' Todos los módulos leen esta misma generación local.' : ''}</p>
    <h3 class="mc-diag__title">Maestros que usan los módulos</h3>
    ${d.modules.map(moduleRow).join('')}
    <div class="mc-diag__actions"><button class="btn" type="button" data-diag-refresh>Revisar de nuevo</button>
      <button class="btn" type="button" data-diag-export>Descargar diagnóstico</button></div>`;
  box.querySelector('[data-diag-refresh]').onclick = () => renderMaestroDiagnostics(box, {base});
  box.querySelector('[data-diag-export]').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 1)], {type: 'application/json'}));
    a.download = `Diagnostico_Maestro_Central_${formatDate(d.started.slice(0, 10))}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  box.dataset.ready = 'true';
  return d;
}
