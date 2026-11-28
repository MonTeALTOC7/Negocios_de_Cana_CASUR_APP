/* Fotografías de Visitas. El original se guarda tal como lo entrega la cámara o la galería (sin recomprimir; el EXIF
   se conserva), con identificador estable y SHA-256. Miniaturas y copias rotuladas son derivados regenerables.
   Nada se sube a la nube y nada se borra automáticamente.

   Ubicación de cada foto, siempre con su procedencia (nunca se inventa ni se presume):
     exif           coordenadas que la cámara escribió en el archivo (las más fiables);
     device-before  lectura del GPS del teléfono tomada ANTES de abrir la cámara (se informa cuántos segundos antes);
     device-after   lectura tomada al volver de la cámara (cuántos segundos después);
     none           sin ubicación verificable.
   A las fotos de la galería nunca se les asigna la ubicación actual del teléfono: solo su propio EXIF. */
import {newId} from './store.js';
import {latestFix, readOnce} from './geo.js';

export const BACKUP_STATES = {local: 'Solo en el teléfono', exportada: 'En un respaldo descargado', confirmada: 'Respaldo confirmado',
  restaurada: 'Restaurada desde respaldo', 'no-disponible': 'No disponible en este dispositivo'};
const MAX_DELTA_MS = 120000;   // una lectura a más de 2 min de la captura no se asocia a la foto

export async function sha256(blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* EXIF mínimo (JPEG APP1): fecha original y GPS. Si no hay datos, null; nunca se inventa. */
export async function readExif(blob) {
  try {
    const head = new DataView(await blob.slice(0, Math.min(blob.size, 256 * 1024)).arrayBuffer());
    if (head.getUint16(0) !== 0xFFD8) return null;
    let p = 2;
    while (p + 4 < head.byteLength) {
      const marker = head.getUint16(p), size = head.getUint16(p + 2);
      if (marker === 0xFFE1 && head.getUint32(p + 4) === 0x45786966) return parseTiff(head, p + 10);
      if ((marker & 0xFF00) !== 0xFF00) break;
      p += 2 + size;
    }
  } catch { /* sin EXIF legible */ }
  return null;
}
function parseTiff(v, t) {
  const le = v.getUint16(t) === 0x4949, u16 = o => v.getUint16(t + o, le), u32 = o => v.getUint32(t + o, le);
  const ifd = o => { const n = u16(o), tags = {}; for (let i = 0; i < n; i++) { const e = o + 2 + i * 12; tags[u16(e)] = {type: u16(e + 2), count: u32(e + 4), at: e + 8}; } return tags; };
  const ascii = tag => { if (!tag) return null; const off = tag.count > 4 ? u32(tag.at) : tag.at; let s = ''; for (let i = 0; i < tag.count - 1; i++) s += String.fromCharCode(v.getUint8(t + off + i)); return s; };
  const rational = (tag, i = 0) => { const off = u32(tag.at) + i * 8; const d = u32(off + 4); return d ? u32(off) / d : null; };
  const ifd0 = ifd(u32(4)), out = {};
  const exifIfd = ifd0[0x8769] ? ifd(u32(ifd0[0x8769].at)) : {};
  const dt = ascii(exifIfd[0x9003]) || ascii(ifd0[0x0132]);
  const m = dt?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (m) out.takenAt = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  if (ifd0[0x8825]) {
    const g = ifd(u32(ifd0[0x8825].at)), dms = tag => tag && tag.count === 3 ? rational(tag, 0) + rational(tag, 1) / 60 + rational(tag, 2) / 3600 : null;
    const lat = dms(g[2]), lon = dms(g[4]);
    if (Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon)) {
      const err = g[31] ? rational(g[31]) : null;
      out.gps = {lat: ascii(g[1]) === 'S' ? -lat : lat, lon: ascii(g[3]) === 'W' ? -lon : lon, accuracy: Number.isFinite(err) ? Math.round(err) : null};
    }
  }
  return Object.keys(out).length ? out : null;
}

/** Al tocar «Tomar foto», ANTES de abrir la cámara: guarda la lectura reciente y pide una nueva en paralelo. */
export function beginCapture() {
  return {openedAt: Date.now(), before: latestFix(30000), fresh: readOnce(10000)};
}
function pickDevice(captureT, readings) {
  const valid = readings.filter(Boolean).map(r => ({...r, delta: r.t - captureT})).filter(r => Math.abs(r.delta) <= MAX_DELTA_MS);
  if (!valid.length) return null;
  const best = valid.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta) || a.accuracy - b.accuracy)[0];
  return {lat: best.lat, lon: best.lon, accuracy: best.accuracy, at: best.at, source: best.delta <= 0 ? 'device-before' : 'device-after', deltaS: Math.round(Math.abs(best.delta) / 1000)};
}
/** Texto honesto de la procedencia de la ubicación de una foto. */
export function locationLabel(loc) {
  if (!loc || loc.source === 'none') return 'Sin ubicación verificable';
  const acc = Number.isFinite(loc.accuracy) ? ` · ±${loc.accuracy} m` : ' · precisión desconocida';
  if (loc.source === 'exif') return `GPS de la cámara${acc}`;
  return `GPS del teléfono ${loc.deltaS <= 2 ? 'al tomar la foto' : `${loc.deltaS} s ${loc.source === 'device-before' ? 'antes' : 'después'}`}${acc}`;
}

async function thumbnail(blob) {
  try {
    const bmp = await createImageBitmap(blob, {resizeWidth: 480, resizeQuality: 'medium'});
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0); bmp.close?.();
    return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
  } catch { return null; }   // formato no decodificable (p. ej. HEIC en algunos navegadores): se guarda igual el original
}

/**
 * Crea el registro de una foto. `capture` (de beginCapture) solo se usa con la cámara.
 * Devuelve el registro y, si hay una lectura pendiente, una promesa que entrega la ubicación definitiva.
 */
export async function createPhotoRecord(file, {visitId, findingId = null, followupId = null, lotKey = null, source, role = 'inicial', capture = null}) {
  const original = file.slice(0, file.size, file.type || 'image/jpeg');
  const [hash, exif, thumb] = await Promise.all([sha256(original), readExif(original), thumbnail(original)]);
  const captureT = source === 'camera' ? (file.lastModified && Math.abs(file.lastModified - Date.now()) < 3600000 ? file.lastModified : Date.now()) : null;
  let location = exif?.gps ? {...exif.gps, source: 'exif'} : {source: 'none'};
  if (!exif?.gps && source === 'camera' && capture) location = pickDevice(captureT, [capture.before]) || location;
  const record = {
    id: newId('foto'), schema: 2, visitId, findingId, followupId, lotKey, role,
    blob: original, thumb, originalName: file.name || 'foto.jpg', type: original.type, size: original.size, sha256: hash,
    source, addedAt: new Date().toISOString(), takenAt: exif?.takenAt ?? (captureT ? new Date(captureT).toISOString() : file.lastModified ? new Date(file.lastModified).toISOString() : null),
    location, caption: '', backupState: 'local', exports: [],
  };
  // Lectura cercana al retorno de la cámara: puede mejorar la asociación (más cercana en tiempo o más precisa).
  const refine = !exif?.gps && source === 'camera' && capture ? Promise.all([capture.fresh, readOnce(8000)]).then(([a, b]) => pickDevice(captureT, [capture.before, a, b])) : null;
  return {record, refine};
}

export function photoExtension(photo) {
  const fromName = String(photo.originalName || '').match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  return fromName || ({'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/webp': 'webp'})[photo.type] || 'jpg';
}
