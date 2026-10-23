import { APP_VERSION, PRODUCTION_RELEASES } from '../../../core/versions/versions.js';

const release = PRODUCTION_RELEASES[0];
const header = document.querySelector('header .brand-title');
if (header && release) {
  const style = document.createElement('style');
  style.textContent = `.production-release{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:3px 9px;font-size:11px;line-height:1.4;color:#14532d;white-space:nowrap}header>.head{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:3px 12px}.production-release{grid-column:2;grid-row:1}header .brand{grid-column:1;grid-row:1}@media(max-width:650px){header>.head{grid-template-columns:minmax(0,1fr)}.production-release{grid-column:1;grid-row:1}header .brand{grid-row:2}}.production-release button{font:inherit;color:inherit;background:none;border:0;border-radius:0;padding:0;text-decoration:underline;text-underline-offset:3px;cursor:pointer}.production-news{color:#173c29;border:1px solid #adcbb8;border-radius:12px;padding:20px;max-width:480px;width:calc(100% - 36px);box-sizing:border-box;max-height:85vh;overflow:auto}.production-news::backdrop{background:rgba(0,25,15,.35)}.production-news h2{font-size:18px;margin:0 0 12px}.production-news li{margin:6px 0}.production-news button{font:inherit;padding:7px 14px;cursor:pointer}@media print{.production-release,.production-news{display:none!important}}`;
  document.head.append(style);
  const row = document.createElement('div');
  row.className = 'production-release no-print export-excluded';
  row.dataset.exportExclude = 'true';
  const version = document.createElement('span');
  version.textContent = release.moduleVersion;
  const chronoDate = document.createElement('span');
  function refreshChronoDate() {
    const meta = window.CRONO_DATA?.meta;
    const raw = meta?.publishedAt || meta?.generated;
    const day = typeof raw === 'string' && raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    chronoDate.textContent = day && months[Number(day[2])-1] ? `Cronológico ${day[3]}-${months[Number(day[2])-1]}-${day[1]}` : 'Cronológico: fecha N/D';
    chronoDate.title = 'Fecha de la referencia cronológica cargada';
  }
  refreshChronoDate();
  window.addEventListener('load', refreshChronoDate);
  window.addEventListener('focus', refreshChronoDate);
  setInterval(refreshChronoDate, 30000);
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.textContent = 'Novedades';
  trigger.setAttribute('aria-haspopup', 'dialog');
  const dialog = document.createElement('dialog');
  dialog.className = 'production-news no-print export-excluded';
  dialog.setAttribute('aria-labelledby', 'productionNewsTitle');
  const title = document.createElement('h2');
  title.id = 'productionNewsTitle'; title.textContent = 'Novedades de la app';
  dialog.append(title);
  for (const item of PRODUCTION_RELEASES) {
    const section = document.createElement('section');
    const label = document.createElement('p');
    label.textContent = `Producción ${item.moduleVersion} · Histórico ${item.historicalVersion} · App Maestra ${item.appVersion}`;
    section.append(label);
    if (item.publishedAt) { const date = document.createElement('p'); date.textContent = `Publicación: ${item.publishedAt}`; section.append(date); }
    const list = document.createElement('ul');
    for (const change of item.changes) { const li = document.createElement('li'); li.textContent = change; list.append(li); }
    section.append(list); dialog.append(section);
  }
  const close = document.createElement('button');
  close.type = 'button'; close.textContent = 'Cerrar';
  close.onclick = () => dialog.close();
  dialog.append(close); document.body.append(dialog);
  trigger.onclick = () => dialog.showModal();
  dialog.addEventListener('close', () => trigger.focus());
  row.append(version, chronoDate, trigger); header.closest('.head').append(row);
  document.querySelector('meta[name="casur-build"]')?.setAttribute('content', `Producción ${release.moduleVersion} · Histórico ${release.historicalVersion} · App ${APP_VERSION}`);
}
