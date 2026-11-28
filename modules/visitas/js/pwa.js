/* Acceso directo e instalación de Visitas: usa el MISMO Service Worker raíz de la App Maestra (nunca uno propio).
   - Abierta de forma independiente, registra el SW raíz con el control de actualización compartido
     (aviso, «Más tarde», checkpoint): sin esto, una ventana de Visitas no respondería a la coordinación del SW y
     bloquearía la actualización de todas las ventanas.
   - Prepara el bundle verificado, la caché GIS y la generación oficial para el uso sin conexión.
   - Dentro de la App Maestra (iframe) no hace nada: el shell ya hace todo esto. */
import {installUpdateControl} from '../../../core/updates/pwa-update.js';
import {APP_VERSION} from '../../../core/versions/versions.js';

const embedded = window.parent !== window;
const root = new URL('../../../', import.meta.url);
const setStatus = (text, result) => document.dispatchEvent(new CustomEvent('visitas-offline', {detail: {text, result}}));
const controlled = () => navigator.serviceWorker.controller ? Promise.resolve() : new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error('sw-controller-timeout')), 40000);
  navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timer); resolve(); }, {once: true});
  if (navigator.serviceWorker.controller) { clearTimeout(timer); resolve(); }
});
async function prepare() {
  await navigator.serviceWorker.ready; await controlled();
  const worker = navigator.serviceWorker.controller; if (!worker) return;
  const manifest = await (await fetch(new URL('core/versions/runtime-assets.json', root))).json();
  let result = await new Promise(resolve => {
    const channel = new MessageChannel(), timer = setTimeout(() => resolve('timeout'), 60000);
    channel.port1.onmessage = ({data}) => { if (data.type === 'PROGRESS') return; clearTimeout(timer); resolve(data.type === 'READY' ? 'ready' : data.code || 'error'); };
    worker.postMessage({type: 'PREPARE_BUNDLE', bundleId: 'visitas', releaseId: manifest.releaseId}, [channel.port2]);
  });
  worker.postMessage({type: 'WARM_GEO'});
  // La generación oficial queda como última buena conocida solo si la pide una página controlada por el SW.
  const data = await fetch(new URL('modules/produccion/data/cronologico.json', root)).then(r => r.ok).catch(() => false);
  if (result === 'ready' && !data) result = 'data-unavailable';
  window.CASUR_VISITAS_OFFLINE = result;
  setStatus(result === 'ready' ? 'Lista sin conexión' : 'Abrí con conexión para usar sin red', result);
}
if (!embedded && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  installUpdateControl({version: APP_VERSION, scriptUrl: new URL('sw.js', root).href, scope: root.pathname,
    checkpoint: async reason => window.CASUR_MODULE_BRIDGE?.checkpoint ? window.CASUR_MODULE_BRIDGE.checkpoint({reason}) : {ok: true, status: 'idle'}})
    .then(() => (navigator.onLine ? prepare() : null))
    .catch(() => setStatus('Sin preparación offline', 'error'));
}
