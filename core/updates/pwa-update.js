// Only a prepared waiting worker can coordinate activation. No storage is cleared.
export function workerRequest(worker, message, timeout = 15000) {
  if (!worker) return Promise.reject(new Error('Service Worker no disponible'));
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error('Tiempo de espera agotado')); }, timeout);
    channel.port1.onmessage = ({data}) => { clearTimeout(timer); channel.port1.close(); resolve(data); };
    try { worker.postMessage(message, [channel.port2]); }
    catch (error) { clearTimeout(timer); channel.port1.close(); reject(error); }
  });
}

export async function installUpdateControl({ version, checkpoint }) {
  if (!('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  let registration, waiting, shownVersion, prepared = false, refreshing = false, busy = false, lastCheck = 0, unlockTimer;
  const read = key => { try { return sessionStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => { try { sessionStorage.setItem(key, value); } catch { /* private mode */ } };
  // Retired confirmation marker: remove only our obsolete key, never user data.
  try { sessionStorage.removeItem('casur-update-confirm'); } catch { /* private mode */ }
  const style = document.createElement('style');
  style.textContent = '.casur-update{position:fixed;right:12px;bottom:76px;z-index:10000;width:min(350px,calc(100vw - 24px));box-sizing:border-box;background:#fff;color:#173c29;border:1px solid #95b9a3;border-radius:12px;padding:14px;box-shadow:0 4px 18px #0002;font:14px/1.4 system-ui}.casur-update p{margin:6px 0}.casur-update button{font:inherit;min-height:36px;margin:5px 6px 0 0;cursor:pointer}.casur-update-lock{border:1px solid #95b9a3;border-radius:12px;max-width:calc(100vw - 40px)}.casur-update-lock::backdrop{background:#082c2266}@media print{.casur-update,.casur-update-lock{display:none!important}}';
  document.head.append(style);
  const box = document.createElement('section');
  box.className = 'casur-update no-print export-excluded'; box.dataset.exportExclude = 'true'; box.hidden = true;
  box.setAttribute('aria-live', 'polite');
  const title = document.createElement('strong'), detail = document.createElement('p'), message = document.createElement('p');
  const apply = document.createElement('button'), later = document.createElement('button');
  apply.textContent = 'Actualizar ahora'; later.textContent = 'Más tarde';
  box.append(title, detail, message, apply, later); document.body.append(box);
  const lock = document.createElement('dialog'); lock.className = 'casur-update-lock'; lock.textContent = 'Guardando estado para actualizar CASUR…';
  lock.addEventListener('cancel', event => event.preventDefault()); document.body.append(lock);
  function release() { prepared = false; clearTimeout(unlockTimer); if (lock.open) lock.close(); }
  sw.addEventListener('message', async event => {
    // The source must be this registration's waiting/activating worker.
    if (!registration || ![registration.waiting, waiting].includes(event.source)) return;
    if (event.data?.type === 'CASUR_UPDATE_CANCEL') { release(); return; }
    if (event.data?.type !== 'CASUR_UPDATE_PREPARE') return;
    if (prepared) { event.ports[0]?.postMessage({ok:false}); return; }
    lock.showModal();
    let result;
    try { result = await checkpoint('pwa-update'); } catch { result = {ok:false}; }
    prepared = result?.ok === true;
    if (!prepared) release();
    else unlockTimer = setTimeout(release, 20000);
    event.ports[0]?.postMessage({ok:prepared});
  });
  sw.addEventListener('controllerchange', () => {
    if (!prepared || refreshing) return;
    refreshing = true; location.reload();
  });
  async function showWaiting() {
    const candidate = registration.waiting, controller = sw.controller;
    if (!candidate || !controller || candidate === controller) return;
    const [info, installed] = await Promise.all([
      workerRequest(candidate, {type:'CASUR_UPDATE_INFO'}),
      workerRequest(controller, {type:'CASUR_UPDATE_INFO'}),
    ]);
    if (registration.waiting !== candidate || sw.controller !== controller || !info.ready ||
        !info.version || !installed.version || info.version === installed.version || info.version === version) return;
    waiting = candidate;
    if (shownVersion === info.version || busy) return;
    shownVersion = info.version;
    title.textContent = 'Nueva versión de CASUR disponible'; detail.textContent = `Versión ${info.version}`;
    later.textContent = 'Más tarde';
    message.textContent = '';
    const postponed = read('casur-update-later') === info.version;
    message.hidden = true; detail.hidden = postponed; later.hidden = postponed;
    apply.hidden = false; apply.textContent = postponed ? 'Ver actualización' : 'Actualizar ahora'; box.hidden = false;
    later.onclick = () => { write('casur-update-later', info.version); shownVersion = null; void showWaiting().catch(() => {}); };
    apply.onclick = async () => {
      if (apply.textContent === 'Ver actualización') { detail.hidden = later.hidden = false; apply.textContent = 'Actualizar ahora'; return; }
      if (busy) return; busy = true; apply.disabled = true;
      message.hidden = false; message.textContent = 'Comprobando recursos y guardando el estado de las ventanas…';
      try {
        const result = await workerRequest(waiting, {type:'CASUR_UPDATE_APPLY'}, 18000);
        if (!result.ok) throw new Error('No se pudo guardar el estado de todas las ventanas. Reintentá o cerrá las ventanas antiguas después de guardar.');
      } catch (error) { release(); message.hidden = false; message.textContent = error.message; }
      finally { busy = false; apply.disabled = false; }
    };
  }
  async function check(force = false) {
    if (!registration || !navigator.onLine || (!force && Date.now()-lastCheck < 300000)) return;
    lastCheck = Date.now();
    try { await registration.update(); await showWaiting(); } catch { /* Keep installed release usable offline. */ }
  }
  registration = await sw.register('./sw.js', {scope:'./', updateViaCache:'none'});
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => { if (worker.state === 'installed') void showWaiting().catch(() => {}); });
  });
  await showWaiting().catch(() => {});
  const warm = () => registration.active?.postMessage({type:'WARM_GEO'});
  void sw.ready.then(warm); void check(true);
  window.addEventListener('online', () => { warm(); void check(true); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void check(); });
}
