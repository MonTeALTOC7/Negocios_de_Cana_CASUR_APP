/* GPS y GIS de Visitas. Reutiliza la geometría oficial de shared/geo (offline por la caché del SW) y no la modifica.
   La identidad GIS se toma del contrato (lotCode del catálogo), nunca se deduce del texto. */
import {getLotGeometries, loadGeoManifest} from '../../../shared/geo/geo-data.js';

const R = 6371008.8;
const rad = d => d * Math.PI / 180;
/** Distancia aproximada en metros entre dos puntos [lon, lat] (equirectangular; suficiente a escala de finca). */
export function meters(a, b) {
  const x = rad(b[0] - a[0]) * Math.cos(rad((a[1] + b[1]) / 2)), y = rad(b[1] - a[1]);
  return Math.sqrt(x * x + y * y) * R;
}
function insideRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function polygons(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}
/** Punto [lon, lat] dentro de la geometría (respeta huecos). */
export function containsPoint(geometry, pt) {
  return polygons(geometry).some(([outer, ...holes]) => insideRing(pt, outer) && !holes.some(h => insideRing(pt, h)));
}
function segmentDistance(p, a, b) {
  // Proyección local en metros alrededor de p.
  const k = Math.cos(rad(p[1])), toXY = q => [rad(q[0] - p[0]) * k * R, rad(q[1] - p[1]) * R];
  const [ax, ay] = toXY(a), [bx, by] = toXY(b), dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}
/** Distancia en metros del punto al borde más cercano de la geometría. */
export function distanceToEdge(geometry, pt) {
  let best = Infinity;
  for (const poly of polygons(geometry)) for (const ring of poly) for (let i = 1; i < ring.length; i++) best = Math.min(best, segmentDistance(pt, ring[i - 1], ring[i]));
  return best;
}

/**
 * Propone la suerte según la posición. Devuelve {status, candidates[]} sin decidir por el técnico:
 *  - 'inside': dentro de una sola suerte y lejos del borde (> precisión): propuesta clara, igual se confirma.
 *  - 'ambiguous': dentro de varias, o cerca de un borde respecto de la precisión del GPS.
 *  - 'near': fuera de todas, con la más cercana a menos de 150 m.
 *  - 'outside': fuera y lejos. 'no-geometry': la finca no tiene polígonos.
 */
export function proposeLot(features, gps) {
  if (!features.length) return {status: 'no-geometry', candidates: []};
  const pt = [gps.lon, gps.lat], accuracy = Math.max(5, Number(gps.accuracy) || 0);
  const scored = features.map(f => ({lotId: f.properties?.lotId, inside: containsPoint(f.geometry, pt), edge: distanceToEdge(f.geometry, pt)}))
    .sort((a, b) => (b.inside - a.inside) || a.edge - b.edge);
  const inside = scored.filter(s => s.inside);
  if (inside.length === 1 && inside[0].edge > accuracy && !scored.some(s => !s.inside && s.edge <= accuracy)) return {status: 'inside', candidates: inside};
  if (inside.length) return {status: 'ambiguous', candidates: scored.filter(s => s.inside || s.edge <= accuracy * 2).slice(0, 4)};
  if (scored[0].edge <= 150) return {status: 'near', candidates: scored.slice(0, 3)};
  return {status: 'outside', candidates: scored.slice(0, 1)};
}

/** Geometrías oficiales de las suertes indicadas por su lotCode del catálogo. */
export async function farmFeatures(lotCodes) {
  try { return await getLotGeometries(lotCodes.filter(Boolean)); } catch { return []; }
}
export async function geoVersion() { try { return (await loadGeoManifest())?.dataVersion ?? null; } catch { return null; } }

/** Posición actual. Nunca se usa una posición en caché: maximumAge 0. */
export function currentPosition({timeout = 30000} = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(Error('Este dispositivo no ofrece GPS al navegador.')); return; }
    navigator.geolocation.getCurrentPosition(p => resolve({lat: p.coords.latitude, lon: p.coords.longitude, accuracy: Math.round(p.coords.accuracy),
      altitude: p.coords.altitude ?? null, at: new Date(p.timestamp || Date.now()).toISOString(), source: 'device'}),
    e => reject(Error(e.code === 1 ? 'Permiso de ubicación denegado. Podés elegir la suerte manualmente.' : e.code === 3 ? 'El GPS no respondió a tiempo. Intentá al aire libre o elegí la suerte manualmente.' : 'No se pudo obtener la ubicación.')),
    {enableHighAccuracy: true, maximumAge: 0, timeout});
  });
}
