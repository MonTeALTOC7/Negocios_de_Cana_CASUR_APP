/* Fotografías de Visitas: el original se guarda tal como lo entrega la cámara o la galería (sin recomprimir,
   conserva el EXIF), con un identificador estable y su SHA-256. Las copias rotuladas se generan bajo demanda con la
   función existente del Estimador TCH, sin modificarla. Nada se sube a la nube y nada se borra solo. */
import {createLabeledVisitPhotoBlob} from '../../tch/js/visit-evidence.js';
import {newId} from './store.js';

export const BACKUP_STATES = {local: 'Solo en el teléfono', exportada: 'Exportada en un respaldo', confirmada: 'Respaldo confirmado',
  restaurada: 'Restaurada desde un respaldo', 'no-disponible': 'No disponible en este dispositivo'};

export async function sha256(blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* EXIF mínimo (JPEG APP1): fecha original y GPS. Si no hay datos, devuelve null; nunca inventa. */
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
      out.gps = {lat: ascii(g[1]) === 'S' ? -lat : lat, lon: ascii(g[3]) === 'W' ? -lon : lon, accuracy: g[31] ? Math.round(rational(g[31])) : null, source: 'exif'};
    }
  }
  return Object.keys(out).length ? out : null;
}

/** Registra una foto. `visitGps` solo se guarda como referencia general de la visita, distinta de la propia de la foto. */
export async function createPhotoRecord(file, {visitId, source, visitGps = null, lotKey = null}) {
  const original = file.slice(0, file.size, file.type || 'image/jpeg');   // mismo contenido, sin recomprimir
  const [hash, exif] = await Promise.all([sha256(original), readExif(original)]);
  return {
    id: newId('foto'), schema: 1, visitId, lotKey, findingId: null, followupId: null,
    blob: original, originalName: file.name || 'foto.jpg', type: original.type, size: original.size, sha256: hash,
    source, addedAt: new Date().toISOString(), takenAt: exif?.takenAt ?? (file.lastModified ? new Date(file.lastModified).toISOString() : null),
    gps: exif?.gps ?? null,                       // coordenadas propias de la evidencia (EXIF), si existen
    visitGps: visitGps ? {lat: visitGps.lat, lon: visitGps.lon, accuracy: visitGps.accuracy, at: visitGps.at, source: 'visit'} : null,
    caption: '', backupState: 'local', exports: [],
  };
}

export function photoExtension(photo) {
  const fromName = String(photo.originalName || '').match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  return fromName || ({'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/webp': 'webp'})[photo.type] || 'jpg';
}

/** Copia rotulada institucional (PNG/JPEG generado al momento). No altera el original. */
export async function labeledCopy(photo, visit, record, number, total) {
  // Solo las coordenadas propias de la foto se rotulan como «GPS»; las generales de la visita se identifican como tales.
  const gps = photo.gps, general = !gps && photo.visitGps ? `Ubicación general de la visita: ${photo.visitGps.lat.toFixed(6)}, ${photo.visitGps.lon.toFixed(6)} · ±${photo.visitGps.accuracy} m` : '';
  const model = {
    lotId: record?.identity.lotCode || '', producer: visit.producer?.name || '', lot: record?.identity.lot || '',
    area: record?.attributes.area || 0, variety: record?.attributes.variety || '', date: (photo.takenAt || visit.startedAt || '').slice(0, 10),
    purpose: visit.reasonLabel || '', notes: [photo.caption, general].filter(Boolean).join(' · '),
    latitude: gps?.lat, longitude: gps?.lon, gpsAccuracyM: gps?.accuracy ?? 0, technician: visit.author?.name || '',
    overallCondition: '', waterStatus: '', weedLevel: '', pestLevel: '', tchSource: 'none', photos: new Array(total),
  };
  return createLabeledVisitPhotoBlob({visit: model, photo: {blob: photo.blob}, photoNumber: number, photoTotal: total,
    logoUrl: new URL('../../../shared/assets/brand/casur-logo.png', import.meta.url).href});
}
