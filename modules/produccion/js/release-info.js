import { APP_VERSION, PRODUCTION_RELEASES } from '../../../core/versions/versions.js';

const release = PRODUCTION_RELEASES[0];
const header = document.querySelector('header .brand-title');
if (header && release) {
  const style = document.createElement('style');
  style.textContent = `.production-release{display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;margin-top:6px;font-size:12px;line-height:1.4;color:#14532d}.production-release button{font:inherit;color:inherit;background:#f0f8f3;border:1px solid #b8d5c2;border-radius:16px;padding:4px 10px;cursor:pointer}.production-news{color:#173c29;border:1px solid #adcbb8;border-radius:12px;padding:20px;max-width:480px;width:calc(100% - 36px);box-sizing:border-box;max-height:85vh;overflow:auto}.production-news::backdrop{background:rgba(0,25,15,.35)}.production-news h2{font-size:18px;margin:0 0 12px}.production-news li{margin:6px 0}.production-news button{font:inherit;padding:7px 14px;cursor:pointer}@media print{.production-release,.production-news{display:none!important}}`;
  document.head.append(style);
  const row = document.createElement('div');
  row.className = 'production-release no-print export-excluded';
  row.dataset.exportExclude = 'true';
  const version = document.createElement('span');
  version.textContent = `Producción ${release.moduleVersion} · Histórico ${release.historicalVersion}`;
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.textContent = 'Novedades';
  trigger.setAttribute('aria-haspopup', 'dialog');
  const dialog = document.createElement('dialog');
  dialog.className = 'production-news no-print export-excluded';
  dialog.setAttribute('aria-labelledby', 'productionNewsTitle');
  const title = document.createElement('h2');
  title.id = 'productionNewsTitle'; title.textContent = 'Novedades de Producción';
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
  row.append(version, trigger); header.append(row);
  document.querySelector('meta[name="casur-build"]')?.setAttribute('content', `Producción ${release.moduleVersion} · Histórico ${release.historicalVersion} · App ${APP_VERSION}`);
}
