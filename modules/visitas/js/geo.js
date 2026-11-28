/* GPS y GIS de Visitas. El GPS asiste, nunca restringe: sin permiso, sin señal o con baja precisión todo sigue
   funcionando con selección manual. Geometría oficial de shared/geo (offline por la caché del SW), de solo lectura.

   Estados del GPS: apagado · buscando · confiable · aproximada · fuera · sin-senal · denegado.
   Una suerte se CONFIRMA solo si: el punto está dentro de un único polígono, la precisión es ≤ 25 m, no hay otro
   polígono a menos de 12 m (borde) y se repite en 3 lecturas seguidas. Proximidad sola nunca confirma. La salida
   se declara tras 3 lecturas precisas fuera. El centroide de una suerte nunca se usa como posición del técnico. */
import {loadGeoManifest} from '../../../shared/geo/geo-data.js';

const R = 6371008.8, rad = d => d * Math.PI / 180;
export const GPS_RULES = {confirmAcc: 25, approxAcc: 60, tieM: 12, stable: 3, exitN: 3, staleMs: 30000, maxUseAcc: 100};
export function meters(a, b) { const x = rad(b[0] - a[0]) * Math.cos(rad((a[1] + b[1]) / 2)), y = rad(b[1] - a[1]); return Math.sqrt(x * x + y * y) * R; }
function insideRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const polygons = g => !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
export const containsPoint = (g, pt) => polygons(g).some(([outer, ...holes]) => insideRing(pt, outer) && !holes.some(h => insideRing(pt, h)));
function segDist(p, a, b) {
  const k = Math.cos(rad(p[1])), xy = q => [rad(q[0] - p[0]) * k * R, rad(q[1] - p[1]) * R];
  const [ax, ay] = xy(a), [bx, by] = xy(b), dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}
export function distanceToEdge(g, pt) { let best = Infinity; for (const poly of polygons(g)) for (const ring of poly) for (let i = 1; i < ring.length; i++) best = Math.min(best, segDist(pt, ring[i - 1], ring[i])); return best; }
function bboxOf(g) { let b = [Infinity, Infinity, -Infinity, -Infinity]; for (const poly of polygons(g)) for (const [x, y] of poly[0]) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]; return b; }

/* ---------- Índice espacial por zona (cajas envolventes) ---------- */
const zoneIndex = new Map();
let manifestP = null;
const manifest = () => (manifestP ??= loadGeoManifest().catch(e => { manifestP = null; throw e; }));
const geoUrl = file => new URL('../../../shared/geo/data/' + file, import.meta.url);
/* La geometría se sirve solo desde su caché verificada del SW. En la primera apertura puede no estar lista: se pide
   prepararla (WARM_GEO) y se reintenta con espera creciente (≈ 1 min en total) antes de declararla no disponible. */
const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function withGeoRetry(fn, attempts = 8) {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) {
      if (i >= attempts - 1) throw e;
      if (i === 0) try { navigator.serviceWorker?.controller?.postMessage({type: 'WARM_GEO'}); } catch { /* sin SW */ }
      await sleep(1200 * (i + 1));
    }
  }
}
async function zone(key) {
  if (!zoneIndex.has(key)) zoneIndex.set(key, (async () => {
    const m = await withGeoRetry(manifest);
    const fc = await withGeoRetry(async () => { const r = await fetch(geoUrl(m.zones[key].file)); if (!r.ok) throw Error('Zona GIS no disponible'); return r.json(); });
    return fc.features.map(f => ({lotId: String(f.properties?.lotId || '').toUpperCase(), feature: f, bbox: f.bbox?.length === 4 ? f.bbox : bboxOf(f.geometry)}));
  })().catch(e => { zoneIndex.delete(key); throw e; }));
  return zoneIndex.get(key);
}
async function zonesNear(lon, lat) {
  const m = await manifest(), pad = 0.01;
  return Object.entries(m.zones).filter(([, z]) => z.bounds && lon >= z.bounds[0] - pad && lon <= z.bounds[2] + pad && lat >= z.bounds[1] - pad && lat <= z.bounds[3] + pad).map(([k]) => k);
}
/** Polígonos cercanos a un punto: [{lotId, feature, inside, edge}] ordenados (dentro primero, luego por distancia). */
export async function lotsNear(lon, lat, radiusM = 60) {
  const pt = [lon, lat], dLat = radiusM / 111320, dLon = radiusM / (111320 * Math.cos(rad(lat))), out = [];
  for (const key of await zonesNear(lon, lat)) for (const item of await zone(key)) {
    const b = item.bbox;
    if (lon < b[0] - dLon || lon > b[2] + dLon || lat < b[1] - dLat || lat > b[3] + dLat) continue;
    const inside = containsPoint(item.feature.geometry, pt), edge = distanceToEdge(item.feature.geometry, pt);
    if (inside || edge <= radiusM) out.push({lotId: item.lotId, feature: item.feature, inside, edge});
  }
  return out.sort((a, b) => (b.inside - a.inside) || a.edge - b.edge);
}
/** Todas las geometrías de una zona (para el mapa). */
export async function zoneFeatures(key) { return (await zone(key)).map(i => i.feature); }
export async function zoneOfLot(lotId) { const m = await withGeoRetry(manifest); const v = m.lotIndex?.[String(lotId).toUpperCase()]; return typeof v === 'string' ? v : v?.zone ?? null; }
export async function featuresFor(lotIds) {
  const want = new Set(lotIds.filter(Boolean).map(x => String(x).toUpperCase())), keys = new Set();
  for (const id of want) { const z = await zoneOfLot(id).catch(() => null); if (z) keys.add(z); }
  const out = []; for (const k of keys) for (const i of await zone(k)) if (want.has(i.lotId)) out.push(i.feature);
  return out;
}
export async function geoVersion() { try { return (await manifest()).dataVersion ?? null; } catch { return null; } }

/* ---------- Motor GPS ---------- */
const listeners = new Set();
export const gps = {state: 'apagado', fix: null, detected: null, candidates: [], watchId: null, error: null,
  _cand: '', _candN: 0, _outN: 0, _staleTimer: null, _pending: 0};
function emit() { listeners.forEach(fn => { try { fn(gps); } catch { /* aislado */ } }); }
export function onGps(fn) { listeners.add(fn); fn(gps); return () => listeners.delete(fn); }

export async function permissionState() {
  try { return (await navigator.permissions.query({name: 'geolocation'})).state; } catch { return 'prompt'; }
}
function setState(s) { if (gps.state !== s) { gps.state = s; } }
async function onPosition(p) {
  gps._lastRaw = p;
  const fix = {lat: p.coords.latitude, lon: p.coords.longitude, accuracy: Math.round(p.coords.accuracy), altitude: p.coords.altitude ?? null,
    at: new Date(p.timestamp || Date.now()).toISOString(), t: p.timestamp || Date.now(), source: 'device'};
  gps.fix = fix; gps.error = null;
  clearTimeout(gps._staleTimer); gps._staleTimer = setTimeout(() => { setState('sin-senal'); emit(); }, GPS_RULES.staleMs);
  if (fix.accuracy > GPS_RULES.maxUseAcc) { setState('aproximada'); gps.candidates = []; emit(); return; }
  let near;
  try { near = await lotsNear(fix.lon, fix.lat, Math.max(50, Math.min(120, fix.accuracy + GPS_RULES.tieM))); gps.gisReady = true; }
  catch {
    // Geometría todavía no preparada (primera apertura sin caché GIS): no se declara «fuera»; se reintenta.
    gps.gisReady = false; gps.candidates = []; setState('aproximada'); emit();
    clearTimeout(gps._gisRetry); gps._gisRetry = setTimeout(() => { if (gps.fix === fix) void onPosition(gps._lastRaw); }, 3000);
    return;
  }
  if (gps.fix !== fix) return;                                // llegó otra lectura mientras se calculaba
  gps.candidates = near.slice(0, 6);
  const inside = near.filter(c => c.inside);
  const rivals = inside.length === 1 ? near.filter(c => c.lotId !== inside[0].lotId && c.edge <= Math.max(GPS_RULES.tieM, Math.min(45, fix.accuracy + 3))) : [];
  if (inside.length === 1 && fix.accuracy <= GPS_RULES.confirmAcc && !rivals.length) {
    const id = inside[0].lotId;
    gps._candN = gps._cand === id ? gps._candN + 1 : 1; gps._cand = id; gps._outN = 0;
    if (gps._candN >= GPS_RULES.stable) { gps.detected = {lotId: id, since: gps.detected?.lotId === id ? gps.detected.since : fix.at, edge: inside[0].edge}; setState('confiable'); }
    else setState(gps.detected?.lotId === id ? 'confiable' : 'aproximada');
  } else {
    gps._cand = ''; gps._candN = 0;
    if (gps.detected && fix.accuracy <= GPS_RULES.confirmAcc && !inside.some(c => c.lotId === gps.detected.lotId)) {
      if (++gps._outN >= GPS_RULES.exitN) { gps.detected = null; gps._outN = 0; }
    }
    setState(gps.detected && inside.some(c => c.lotId === gps.detected.lotId) ? 'confiable' : inside.length ? 'aproximada' : 'fuera');
  }
  emit();
}
function onError(e) {
  gps.error = e.code === 1 ? 'Permiso de ubicación denegado' : e.code === 3 ? 'El GPS no respondió a tiempo' : 'Ubicación no disponible';
  setState(e.code === 1 ? 'denegado' : 'sin-senal');
  if (e.code === 1) stopGps(true);
  emit();
}
export function startGps() {
  if (!navigator.geolocation) { gps.error = 'Este dispositivo no ofrece ubicación al navegador'; setState('sin-senal'); emit(); return false; }
  if (gps.watchId !== null) return true;
  setState(gps.fix ? gps.state : 'buscando'); emit();
  gps.watchId = navigator.geolocation.watchPosition(p => void onPosition(p), onError, {enableHighAccuracy: true, maximumAge: 2000, timeout: 30000});
  return true;
}
export function stopGps(keepState = false) {
  if (gps.watchId !== null) navigator.geolocation.clearWatch(gps.watchId);
  gps.watchId = null; clearTimeout(gps._staleTimer);
  if (!keepState) { setState('apagado'); gps.detected = null; gps._cand = ''; gps._candN = 0; }
  emit();
}
/** Última lectura útil si es reciente (para asociar a una foto o un hallazgo). */
export function latestFix(maxAgeMs = 30000, maxAcc = GPS_RULES.maxUseAcc) {
  const f = gps.fix; return f && Date.now() - f.t <= maxAgeMs && f.accuracy <= maxAcc ? f : null;
}
/** Lectura puntual de alta precisión (no usa caché). Resuelve null si no hay permiso o señal: nunca bloquea. */
export function readOnce(timeout = 12000) {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    gps._pending++;
    const finish = v => { gps._pending--; resolve(v); };
    navigator.geolocation.getCurrentPosition(p => finish({lat: p.coords.latitude, lon: p.coords.longitude, accuracy: Math.round(p.coords.accuracy),
      at: new Date(p.timestamp || Date.now()).toISOString(), t: p.timestamp || Date.now(), source: 'device'}), () => finish(null),
    {enableHighAccuracy: true, maximumAge: 0, timeout});
  });
}
export const GPS_LABEL = {apagado: 'GPS apagado', buscando: 'Buscando GPS…', confiable: 'Ubicación confiable', aproximada: 'Ubicación aproximada',
  fuera: 'Fuera de suerte', 'sin-senal': 'Sin señal GPS', denegado: 'Ubicación sin permiso'};
