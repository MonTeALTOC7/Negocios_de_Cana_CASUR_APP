// Tracks existing browser operations. It never saves, clears or migrates module data.
export function protectModuleActivity(win) {
  if (win.CASUR_ACTIVITY_GUARD) return win.CASUR_ACTIVITY_GUARD;
  let pending = 0;
  const edits = new Map();
  const value = node => node.type === 'checkbox' || node.type === 'radio' ? node.checked : node.value;
  const remember = node => { if (node?.matches?.('input,textarea,select') && !edits.has(node)) edits.set(node, value(node)); };
  win.document.addEventListener('focusin', e => remember(e.target), true);
  win.document.addEventListener('beforeinput', e => remember(e.target), true);
  // Read/write transactions remain protected until completion, including abort/error.
  if (win.IDBDatabase) {
    const original = win.IDBDatabase.prototype.transaction;
    win.IDBDatabase.prototype.transaction = function (...args) {
      const tx = original.apply(this, args);
      if (args[1] === 'readwrite' || args[1] === 'versionchange') {
        pending++; let ended = false;
        const end = () => { if (!ended) { ended = true; pending--; } };
        for (const type of ['complete','abort','error']) tx.addEventListener(type, end, {once:true});
      }
      return tx;
    };
  }
  const fetch = win.fetch.bind(win);
  win.fetch = function (input, options = {}) {
    const writing = !['GET','HEAD'].includes(String(options.method || input?.method || 'GET').toUpperCase());
    if (writing) pending++;
    return fetch(input, options).finally(() => { if (writing) pending--; });
  };
  if (win.navigator.geolocation) {
    const geo = win.navigator.geolocation, original = geo.getCurrentPosition.bind(geo);
    geo.getCurrentPosition = (success, failure, options) => {
      pending++; let ended = false;
      const finish = () => { if (!ended) { ended = true; pending--; } };
      try { return original(p => { try { success(p); } finally { win.setTimeout(finish,0); } }, e => { try { failure?.(e); } finally { finish(); } }, options); }
      catch (error) { finish(); throw error; }
    };
  }
  const api = Object.freeze({
    get pending() { return pending; },
    async checkpoint(bridge, reason = 'pwa-update') {
      if (pending || win.document.querySelector('[data-casur-export-kind] button:disabled,[aria-busy="true"]')) return {ok:false,status:'operation-active'};
      const changed = [...edits].filter(([node, original]) => node.isConnected && value(node) !== original);
      const query = node => /^(cronoQ|q|lotSearch|cronoProducerSelect|producerSelect|cronoZoneSelect|zoneSelect)$/.test(node.id) || node.type === 'search' || node.closest('[data-casur-query]');
      const covered = node => (bridge?.moduleId === 'tch' && (!!win.document.querySelector('#bioTechnician')) && (/^bio[A-Z]/.test(node.id) || node.matches('[data-sample-field]'))) || (bridge?.moduleId === 'produccion' && /^operational/.test(node.id));
      if (changed.some(([node]) => !query(node) && !covered(node))) return {ok:false,status:'form-pending'};
      const result = bridge?.protocolVersion === 1 && typeof bridge.checkpoint === 'function' ? await bridge.checkpoint({reason}) : {ok:true,status:'idle'};
      if (!result?.ok || pending) return {ok:false,status:result?.status || 'operation-active'};
      return result;
    },
  });
  win.CASUR_ACTIVITY_GUARD = api;
  return api;
}
