/* ZIP sin compresión (método 0, «stored») para respaldos de Visitas.
   - Escritura: cada entrada se añade como Blob; el ZIP final es un Blob compuesto (el navegador no copia los
     originales a un único búfer), así una parte grande no necesita duplicarse en memoria.
   - Lectura: se recorre el directorio central leyendo solo las porciones necesarias del archivo (File.slice).
   Las fotos JPEG ya están comprimidas: comprimirlas otra vez no ahorra espacio y sí memoria y batería. */
const encoder = new TextEncoder(), decoder = new TextDecoder();
let table;
function crcTable() {
  if (table) return table;
  table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  return table;
}
export function crc32(bytes, crc = 0) {
  const t = crcTable(); crc = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) crc = t[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return ~crc >>> 0;
}
function dos(date) {
  const d = date instanceof Date && !isNaN(date) ? date : new Date();
  return {time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()};
}
/** entries: [{name, blob, date?}] → Blob application/zip. Los nombres usan «/» y UTF-8. */
export async function createStoredZip(entries) {
  const parts = [], central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name), blob = entry.blob instanceof Blob ? entry.blob : new Blob([entry.blob]);
    const bytes = new Uint8Array(await blob.arrayBuffer()), crc = crc32(bytes), stamp = dos(entry.date);
    if (offset + 30 + name.length + bytes.length > 0xFFFFFFFF) throw Error('La parte del respaldo supera 4 GB');
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
    local.setUint16(10, stamp.time, true); local.setUint16(12, stamp.date, true); local.setUint32(14, crc, true);
    local.setUint32(18, bytes.length, true); local.setUint32(22, bytes.length, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
    parts.push(local.buffer, name, blob);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, stamp.time, true); c.setUint16(14, stamp.date, true); c.setUint32(16, crc, true); c.setUint32(20, bytes.length, true);
    c.setUint32(24, bytes.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    central.push(c.buffer, name);
    offset += 30 + name.length + bytes.length;
  }
  const centralSize = central.reduce((s, p) => s + (p.byteLength ?? p.length), 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], {type: 'application/zip'});
}

/** Lee el índice de un ZIP «stored». Devuelve [{name, size, crc, read(): Promise<Blob>}]. */
export async function readStoredZip(file) {
  const tailSize = Math.min(file.size, 22 + 0xFFFF);
  const tail = new DataView(await file.slice(file.size - tailSize).arrayBuffer());
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw Error('El archivo no es un ZIP válido');
  const count = tail.getUint16(eocd + 10, true), size = tail.getUint32(eocd + 12, true), start = tail.getUint32(eocd + 16, true);
  const dir = new DataView(await file.slice(start, start + size).arrayBuffer());
  const entries = [];
  for (let p = 0, i = 0; i < count; i++) {
    if (dir.getUint32(p, true) !== 0x02014b50) throw Error('Directorio del ZIP dañado');
    const method = dir.getUint16(p + 10, true), crc = dir.getUint32(p + 16, true), csize = dir.getUint32(p + 20, true), usize = dir.getUint32(p + 24, true);
    const nlen = dir.getUint16(p + 28, true), elen = dir.getUint16(p + 30, true), clen = dir.getUint16(p + 32, true), local = dir.getUint32(p + 42, true);
    const name = decoder.decode(new Uint8Array(dir.buffer, dir.byteOffset + p + 46, nlen));
    entries.push({name, size: usize, crc, method, async read() {
      if (method !== 0 || csize !== usize) throw Error('Entrada comprimida no admitida: ' + name);
      const head = new DataView(await file.slice(local, local + 30).arrayBuffer());
      if (head.getUint32(0, true) !== 0x04034b50) throw Error('Entrada dañada: ' + name);
      const begin = local + 30 + head.getUint16(26, true) + head.getUint16(28, true);
      return file.slice(begin, begin + csize);
    }});
    p += 46 + nlen + elen + clen;
  }
  return entries;
}
