/* Acceso directo e instalación de Visitas: usa el MISMO Service Worker raíz de la App Maestra (nunca uno propio).
   Dentro de la App Maestra (iframe) no hace nada: el shell ya registró el SW y preparó el bundle. */
const embedded = window.parent !== window;
const status = document.getElementById('vcOffline');
const controlled = () => navigator.serviceWorker.controller ? Promise.resolve() : new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error('sw-controller-timeout')), 40000);
  navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timer); resolve(); }, {once: true});
  if (navigator.serviceWorker.controller) { clearTimeout(timer); resolve(); }
});
async function prepare() {
  await navigator.serviceWorker.ready;
  await controlled();                       // en la primera visita el SW raíz toma el control al activarse
  const worker = navigator.serviceWorker.controller;
  if (!worker) return;
  const manifest = await (await fetch(new URL('../../../core/versions/runtime-assets.json', import.meta.url))).json();
  // Prepara (o verifica) el bundle de Visitas y sus dependencias para el uso sin conexión.
  let result = await new Promise(resolve => {
    const channel = new MessageChannel(), timer = setTimeout(() => resolve('timeout'), 60000);
    channel.port1.onmessage = ({data}) => { if (data.type === 'PROGRESS') return; clearTimeout(timer); resolve(data.type === 'READY' ? 'ready' : data.code || 'error'); };
    worker.postMessage({type: 'PREPARE_BUNDLE', bundleId: 'visitas', releaseId: manifest.releaseId}, [channel.port2]);
  });
  worker.postMessage({type: 'WARM_GEO'});
  // La generación oficial del Maestro queda como última buena conocida solo si la pide una página controlada por el SW.
  const data = await fetch(new URL('../../../modules/produccion/data/cronologico.json', import.meta.url)).then(r => r.ok).catch(() => false);
  if (result === 'ready' && !data) result = 'data-unavailable';
  if (status) { status.hidden = false; status.textContent = result === 'ready' ? 'Lista sin conexión' : 'Abrí con conexión para usar sin red'; status.dataset.result = result; }
}
if (!embedded && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register(new URL('../../../sw.js', import.meta.url), {scope: new URL('../../../', import.meta.url).pathname, updateViaCache: 'none'})
    .then(() => (navigator.onLine ? prepare() : null)).catch(() => { if (status) { status.hidden = false; status.textContent = 'Sin preparación offline'; } });
}
