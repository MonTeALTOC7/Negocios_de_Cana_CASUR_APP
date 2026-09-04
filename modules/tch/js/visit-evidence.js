const encoder = new TextEncoder();

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function cleanName(value, fallback = "sin_nombre") {
  const clean = String(value || fallback).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return clean.slice(0, 80) || fallback;
}

export function dataUrlToBlob(dataUrl) {
  const [header, payload] = String(dataUrl).split(",");
  const type = header.match(/data:([^;]+)/)?.[1] || "application/octet-stream";
  const binary = atob(payload || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}

function canvasBlob(canvas, type = "image/png", quality) {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("No se pudo procesar la fotografía.")),
    type,
    quality,
  ));
}

function blobDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("No se pudo leer la fotografía."));
    reader.readAsDataURL(blob);
  });
}

function imageElement(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo abrir la fotografía."));
    image.src = source;
  });
}

async function loadImage(source) {
  if (source instanceof Blob && globalThis.createImageBitmap) {
    try {
      return await createImageBitmap(source, { imageOrientation: "from-image" });
    } catch { /* fallback below */ }
  }
  const url = source instanceof Blob ? URL.createObjectURL(source) : source;
  try {
    return await imageElement(url);
  } catch (error) {
    if (!(source instanceof Blob)) throw error;
    // Algunos WebView Android no decodifican de forma estable una URL blob
    // recién creada. FileReader ofrece una segunda ruta compatible.
    return imageElement(await blobDataUrl(source));
  } finally {
    if (source instanceof Blob) setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export function snapshotPhotoFiles(fileList) {
  // FileList puede ser una colección viva: hay que copiarla antes de limpiar
  // el input, especialmente después de volver desde la cámara en Android.
  return Array.from(fileList || []);
}

export async function prepareVisitPhoto(file, maxEdge = 1600) {
  if (!file) throw new Error("No se recibió ninguna fotografía.");
  if (file.type && !file.type.startsWith("image/")) throw new Error("Seleccioná un archivo de imagen válido.");
  const image = await loadImage(file);
  const sourceWidth = image.width || image.naturalWidth;
  const sourceHeight = image.height || image.naturalHeight;
  if (!sourceWidth || !sourceHeight) throw new Error("La fotografía no tiene dimensiones válidas.");
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("El teléfono no pudo preparar la fotografía.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  image.close?.();
  const blob = await canvasBlob(canvas, "image/jpeg", 0.84);
  return {
    id: `photo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    blob,
    width,
    height,
    sizeBytes: blob.size,
    originalName: file.name || "camara.jpg",
    capturedAt: new Date().toISOString(),
    mimeType: "image/jpeg",
  };
}

export function visitPhotoBlob(photo) {
  if (photo?.blob instanceof Blob) return photo.blob;
  if (photo?.dataUrl) return dataUrlToBlob(photo.dataUrl);
  throw new Error("La fotografía guardada no está disponible.");
}

export function visitPhotoPreviewUrl(photo) {
  if (photo?.dataUrl) return photo.dataUrl;
  if (photo?.blob instanceof Blob) return URL.createObjectURL(photo.blob);
  return "";
}

function fitText(context, text, maxWidth, initialSize, minSize = 11, weight = 800) {
  let size = initialSize;
  while (size > minSize) {
    context.font = `${weight} ${size}px Arial, sans-serif`;
    if (context.measureText(text).width <= maxWidth) break;
    size -= 1;
  }
  return size;
}

function drawFitted(context, text, x, y, maxWidth, size, color = "#ffffff", weight = 800) {
  const fitted = fitText(context, text, maxWidth, size, Math.max(13, size * 0.58), weight);
  context.font = `${weight} ${fitted}px Arial, sans-serif`;
  context.fillStyle = color;
  context.fillText(text, x, y);
}

function formatCoordinates(visit) {
  if (!Number.isFinite(Number(visit.latitude)) || !Number.isFinite(Number(visit.longitude))) return "";
  return `GPS: ${Number(visit.latitude).toFixed(6)}, ${Number(visit.longitude).toFixed(6)} · ±${Math.round(finite(visit.gpsAccuracyM))} m`;
}

function dateShort(value) {
  if (!value) return "";
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return year && month && day ? `${String(day).padStart(2, "0")}-${months[month - 1]}-${year}` : String(value);
}

function validDetail(value) {
  const clean = String(value ?? "").trim();
  return clean && !/^(no evaluad[oa]|n\/?e|sin registrar|sin estimaci[oó]n.*)$/i.test(clean) ? clean : "";
}

function tchSourceShort(visit) {
  const source = String(visit.tchSource || "").toLowerCase();
  if (source === "visual") return "Visual";
  if (source === "biometry") return "Biometría app";
  if (source === "gauging") return "Aforo";
  return validDetail(visit.tchSourceLabel || visit.tchSource);
}

export function buildVisitLabelModel(visit, photoNumber = 1, photoTotal = visit.photos?.length || 1) {
  const technical = [];
  const add = (label, value) => { const clean = validDetail(value); if (clean) technical.push({ label, value: clean }); };
  add("CONDICIÓN", visit.overallCondition);
  add("ESTADO HÍDRICO", visit.waterStatus);
  add("MALEZAS", visit.weedLevel);
  add("PLAGAS / DAÑO", visit.pestLevel);
  if (String(visit.lodgingPct ?? "").trim() !== "" && Number.isFinite(Number(visit.lodgingPct))) {
    add("ACAME", `${finite(visit.lodgingPct).toFixed(0)}%${validDetail(visit.lodgingDescription) ? ` · ${validDetail(visit.lodgingDescription)}` : ""}`);
  }
  if (visit.tchSource !== "none" && finite(visit.estimatedTch) > 0) {
    add("TCH VISITA", `${finite(visit.estimatedTch).toFixed(1)}${tchSourceShort(visit) ? ` · ${tchSourceShort(visit)}` : ""}${validDetail(visit.tchDescription) ? ` · ${validDetail(visit.tchDescription)}` : ""}`);
  }
  if (finite(visit.estimatedTch2627) > 0) add("TCH ESTIMADO Z26/27", finite(visit.estimatedTch2627).toFixed(1));
  return {
    title: [validDetail(visit.lotId), validDetail(visit.producer) || "Hacienda", visit.lot ? `Suerte ${visit.lot}` : ""].filter(Boolean).join(" · "),
    general: [finite(visit.area) > 0 ? `${finite(visit.area).toFixed(2)} ha` : "", validDetail(visit.variety), dateShort(visit.date), `Foto ${String(photoNumber).padStart(2, "0")}/${String(photoTotal).padStart(2, "0")}`].filter(Boolean),
    purpose: validDetail(visit.purpose),
    technical,
    observation: validDetail(visit.notes),
    footer: [formatCoordinates(visit), validDetail(visit.technician) ? `Técnico: ${visit.technician}` : ""].filter(Boolean),
  };
}

function wrapLines(context, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = candidate;
  });
  if (line) lines.push(line);
  return lines;
}

async function loadLogo(logoUrl) {
  try { return await loadImage(logoUrl); } catch { return null; }
}

export async function createLabeledVisitPhotoBlob({ visit, photo, photoNumber = 1, photoTotal = visit.photos?.length || 1, logoUrl = "./assets/logo_casur.png" }) {
  const image = await loadImage(visitPhotoBlob(photo));
  const width = image.width || image.naturalWidth;
  const height = image.height || image.naturalHeight;
  const landscape = width >= height;
  const padding = Math.max(12, Math.round(width * (landscape ? 0.018 : 0.022)));
  const gap = Math.max(6, Math.round(width * 0.008));
  const baseFont = Math.max(12, Math.min(22, Math.round(width * (landscape ? 0.016 : 0.018))));
  const smallFont = Math.max(10, Math.round(baseFont * 0.78));
  const titleFont = Math.max(14, Math.round(baseFont * 1.12));
  const lineHeight = Math.round(baseFont * 1.34);
  const model = buildVisitLabelModel(visit, photoNumber, photoTotal);
  const measureCanvas = document.createElement("canvas");
  const measure = measureCanvas.getContext("2d");
  const logoWidth = Math.min(Math.round(width * 0.095), landscape ? 116 : 96);
  const contentWidth = width - padding * 2;
  measure.font = `600 ${smallFont}px Arial, sans-serif`;
  const observationLines = model.observation ? wrapLines(measure, model.observation, contentWidth) : [];
  const purposeLines = model.purpose ? wrapLines(measure, `MOTIVO: ${model.purpose}`, contentWidth) : [];
  const columns = landscape ? Math.min(3, Math.max(1, model.technical.length)) : Math.min(2, Math.max(1, model.technical.length));
  const technicalRows = model.technical.length ? Math.ceil(model.technical.length / columns) : 0;
  const headerHeight = Math.max(Math.round(baseFont * 2.55), Math.round(logoWidth * 0.44));
  const purposeHeight = purposeLines.length ? purposeLines.length * lineHeight + gap : 0;
  const technicalHeight = technicalRows ? technicalRows * Math.round(baseFont * 2.35) + gap : 0;
  const observationHeight = observationLines.length ? smallFont + observationLines.length * Math.round(smallFont * 1.35) + gap * 2 : 0;
  const footerHeight = model.footer.length ? Math.round(smallFont * 1.5) + gap : 0;
  const contentHeight = padding * 2 + headerHeight + gap + purposeHeight + technicalHeight + observationHeight + footerHeight;
  const targetRatio = landscape ? 0.15 : 0.13;
  const targetPanel = Math.round(height * targetRatio / (1 - targetRatio));
  // 12–16 % es la referencia compacta. La observación completa tiene prioridad y puede ampliar el panel.
  const panelHeight = Math.max(contentHeight, model.technical.length || model.observation ? targetPanel : Math.round(targetPanel * 0.72));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height + panelHeight;
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, width, height);
  image.close?.();
  context.fillStyle = "#ffffff";
  context.fillRect(0, height, width, canvas.height - height);
  context.fillStyle = "#0b7f3a";
  context.fillRect(0, height, width, Math.max(3, Math.round(width * 0.003)));
  const logo = await loadLogo(logoUrl);
  const panelY = height + padding;
  let drawnLogoWidth = 0;
  if (logo) {
    const logoHeight = Math.round(headerHeight * 0.84);
    const ratio = Math.min(logoWidth / (logo.width || logo.naturalWidth), logoHeight / (logo.height || logo.naturalHeight));
    const drawnWidth = (logo.width || logo.naturalWidth) * ratio;
    const drawnHeight = (logo.height || logo.naturalHeight) * ratio;
    drawnLogoWidth = drawnWidth;
    context.drawImage(logo, padding, panelY + (headerHeight - drawnHeight) / 2, drawnWidth, drawnHeight);
    logo.close?.();
  }
  const textX = padding + (drawnLogoWidth ? drawnLogoWidth + padding : 0);
  drawFitted(context, model.title, textX, panelY + titleFont, width - textX - padding, titleFont, "#123c27", 850);
  drawFitted(context, model.general.join(" · "), textX, panelY + titleFont + lineHeight, width - textX - padding, smallFont, "#596961", 600);
  let y = panelY + headerHeight + gap;
  const divider = () => { context.fillStyle = "#dce6e0"; context.fillRect(padding, y, contentWidth, 1); y += gap; };
  if (purposeLines.length) {
    context.font = `650 ${smallFont}px Arial, sans-serif`; context.fillStyle = "#3f5449";
    purposeLines.forEach((line) => { context.fillText(line, padding, y + smallFont); y += lineHeight; });
    divider();
  }
  if (model.technical.length) {
    const columnGap = gap * 2;
    const cellWidth = (contentWidth - columnGap * (columns - 1)) / columns;
    model.technical.forEach((item, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = padding + column * (cellWidth + columnGap);
      const top = y + row * Math.round(baseFont * 2.35);
      context.font = `800 ${smallFont}px Arial, sans-serif`; context.fillStyle = "#0b7f3a";
      context.fillText(item.label, x, top + smallFont);
      drawFitted(context, item.value, x, top + smallFont + lineHeight, cellWidth, baseFont, "#263d31", 700);
    });
    y += technicalRows * Math.round(baseFont * 2.35);
    divider();
  }
  if (observationLines.length) {
    context.font = `800 ${smallFont}px Arial, sans-serif`; context.fillStyle = "#0b7f3a";
    context.fillText("OBSERVACIÓN", padding, y + smallFont); y += Math.round(smallFont * 1.35);
    context.font = `500 ${smallFont}px Arial, sans-serif`; context.fillStyle = "#344b40";
    observationLines.forEach((line) => { context.fillText(line, padding, y + smallFont); y += Math.round(smallFont * 1.35); });
    y += gap; divider();
  }
  if (model.footer.length) {
    context.font = `600 ${smallFont}px Arial, sans-serif`; context.fillStyle = "#5a6b62";
    context.fillText(model.footer.join(" · "), padding, y + smallFont);
  }
  return canvasBlob(canvas, "image/png");
}

export function visitPhotoFilename(visit, photoNumber = 1, extension = "png") {
  return `${cleanName(visit.lotId)}_${cleanName(visit.producer)}_Suerte_${cleanName(visit.lot)}_${cleanName(dateShort(visit.date))}_Foto_${String(photoNumber).padStart(2, "0")}.${extension}`;
}

function addWorkbookTitle(worksheet, columns) {
  XLSX.utils.sheet_add_aoa(worksheet, [["CASUR · HISTORIAL DE VISITAS DE CAMPO"], ["Evidencias fotográficas, ubicación y condición agronómica"], []], { origin: "A1" });
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: columns - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: columns - 1 } },
  ];
  worksheet.A1.s = { font: { bold: true, color: { rgb: "FFFFFF" }, sz: 16 }, fill: { fgColor: { rgb: "073D24" } } };
  worksheet.A2.s = { font: { italic: true, color: { rgb: "365A46" } }, fill: { fgColor: { rgb: "EAF6EE" } } };
}

export function createVisitsWorkbookBlob(visits = []) {
  if (!globalThis.XLSX) throw new Error("No se cargó el componente Excel.");
  const headers = [
    "ID visita", "Fecha", "Hora", "Técnico", "Zona", "Código hacienda", "Hacienda", "Suerte", "Código suerte", "Área (ha)", "Variedad",
    "Motivo", "Condición general", "Estado hídrico", "Nivel malezas", "Nivel plagas", "Acame (%)", "Descripción acame", "Fuente TCH", "TCH visita", "Descripción TCH", "Biometría vinculada", "TCH ESTIMADO Z26/27", "Fotos",
    "Latitud", "Longitud", "Precisión GPS (m)", "Fecha/hora GPS", "Observaciones", "Creado", "Actualizado", "Revisión",
  ];
  const rows = visits.slice().sort((a, b) => `${b.date}${b.time || ""}`.localeCompare(`${a.date}${a.time || ""}`)).map((visit) => [
    visit.id, visit.date, visit.time, visit.technician, visit.zone, visit.farmCode, visit.producer, visit.lot, visit.lotId, visit.area, visit.variety,
    visit.purpose, visit.overallCondition, visit.waterStatus, visit.weedLevel, visit.pestLevel, visit.lodgingPct, visit.lodgingDescription,
    visit.tchSourceLabel || visit.tchSource, visit.estimatedTch || null, visit.tchDescription, visit.linkedBiometryId, visit.estimatedTch2627 || null, visit.photos?.length || 0,
    visit.latitude, visit.longitude, visit.gpsAccuracyM, visit.capturedAt, visit.notes, visit.createdAt, visit.updatedAt, visit.revision || 0,
  ]);
  const worksheet = XLSX.utils.aoa_to_sheet([[], [], [], headers, ...rows]);
  addWorkbookTitle(worksheet, headers.length);
  worksheet["!cols"] = headers.map((header) => ({ wch: Math.min(38, Math.max(12, header.length + 2)) }));
  worksheet["!autofilter"] = { ref: `A4:${XLSX.utils.encode_col(headers.length - 1)}${rows.length + 4}` };
  headers.forEach((_, column) => {
    const cell = worksheet[XLSX.utils.encode_cell({ r: 3, c: column })];
    if (cell) cell.s = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "0B7F3A" } }, alignment: { wrapText: true, vertical: "center" } };
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Visitas de campo");

  const photoRows = visits.flatMap((visit) => (visit.photos || []).map((photo, index) => [
    visit.id, visit.date, visit.farmCode, visit.producer, visit.lot, visit.lotId, index + 1, photo.id, photo.originalName,
    photo.width, photo.height, photo.sizeBytes, photo.capturedAt,
  ]));
  const photoHeaders = ["ID visita", "Fecha", "Código hacienda", "Hacienda", "Suerte", "Código suerte", "N° foto", "ID foto", "Nombre original", "Ancho px", "Alto px", "Tamaño bytes", "Capturada"];
  const photoSheet = XLSX.utils.aoa_to_sheet([photoHeaders, ...photoRows]);
  photoSheet["!cols"] = photoHeaders.map((header) => ({ wch: Math.min(34, Math.max(12, header.length + 2)) }));
  photoSheet["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(photoHeaders.length - 1)}${photoRows.length + 1}` };
  photoHeaders.forEach((_, column) => {
    const cell = photoSheet[XLSX.utils.encode_cell({ r: 0, c: column })];
    if (cell) cell.s = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "005BAA" } } };
  });
  XLSX.utils.book_append_sheet(workbook, photoSheet, "Índice fotografías");
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true });
  return new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

let crcTable;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      crcTable[index] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(dateValue) {
  const date = new Date(dateValue || Date.now());
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

function uint16(view, offset, value) { view.setUint16(offset, value, true); }
function uint32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

async function createZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const bytes = new Uint8Array(await entry.blob.arrayBuffer());
    const checksum = crc32(bytes);
    const stamp = dosDateTime(entry.date);
    const local = new Uint8Array(30 + nameBytes.length + bytes.length);
    const localView = new DataView(local.buffer);
    uint32(localView, 0, 0x04034b50);
    uint16(localView, 4, 20);
    uint16(localView, 6, 0x0800);
    uint16(localView, 8, 0);
    uint16(localView, 10, stamp.time);
    uint16(localView, 12, stamp.date);
    uint32(localView, 14, checksum);
    uint32(localView, 18, bytes.length);
    uint32(localView, 22, bytes.length);
    uint16(localView, 26, nameBytes.length);
    uint16(localView, 28, 0);
    local.set(nameBytes, 30);
    local.set(bytes, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    uint32(centralView, 0, 0x02014b50);
    uint16(centralView, 4, 20);
    uint16(centralView, 6, 20);
    uint16(centralView, 8, 0x0800);
    uint16(centralView, 10, 0);
    uint16(centralView, 12, stamp.time);
    uint16(centralView, 14, stamp.date);
    uint32(centralView, 16, checksum);
    uint32(centralView, 20, bytes.length);
    uint32(centralView, 24, bytes.length);
    uint16(centralView, 28, nameBytes.length);
    uint16(centralView, 30, 0);
    uint16(centralView, 32, 0);
    uint16(centralView, 34, 0);
    uint16(centralView, 36, 0);
    uint32(centralView, 38, 0);
    uint32(centralView, 42, offset);
    central.set(nameBytes, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((sum, entry) => sum + entry.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  uint32(endView, 0, 0x06054b50);
  uint16(endView, 4, 0);
  uint16(endView, 6, 0);
  uint16(endView, 8, entries.length);
  uint16(endView, 10, entries.length);
  uint32(endView, 12, centralSize);
  uint32(endView, 16, offset);
  uint16(endView, 20, 0);
  return new Blob([...locals, ...centrals, end], { type: "application/zip" });
}

function visitFolder(visit) {
  return `Visitas_CASUR/${cleanName(visit.farmCode)}_${cleanName(visit.producer)}/Suerte_${cleanName(visit.lot)}/${cleanName(visit.date)}`;
}

export async function createVisitsPackageBlob(visits, {
  logoUrl = "./assets/logo_casur.png",
  includeLabeled = true,
  includeOriginals = true,
  includeExcel = true,
} = {}) {
  if (!visits?.length) throw new Error("No hay visitas para exportar.");
  const entries = [];
  if (includeExcel) entries.push({ name: "Visitas_CASUR/Historial_Visitas_Campo_CASUR.xlsx", blob: createVisitsWorkbookBlob(visits), date: new Date() });
  for (const visit of visits) {
    const folder = visitFolder(visit);
    for (let index = 0; index < (visit.photos || []).length; index += 1) {
      const photo = visit.photos[index];
      const number = String(index + 1).padStart(2, "0");
      if (includeLabeled) entries.push({
        name: `${folder}/Etiquetadas/${visitPhotoFilename(visit, index + 1)}`,
        blob: await createLabeledVisitPhotoBlob({ visit, photo, photoNumber: index + 1, photoTotal: visit.photos.length, logoUrl }),
        date: photo.capturedAt,
      });
      if (includeOriginals) entries.push({
        name: `${folder}/Originales_para_IA/${visitPhotoFilename(visit, index + 1, "jpg").replace(/\.jpg$/, "_ORIGINAL.jpg")}`,
        blob: visitPhotoBlob(photo),
        date: photo.capturedAt,
      });
    }
  }
  if (!entries.length) throw new Error("Seleccioná al menos un contenido para el ZIP.");
  return createZip(entries);
}

export function visitPackageFilename(visits) {
  if (visits.length === 1) {
    const visit = visits[0];
    return `Visita_${cleanName(visit.farmCode)}_${cleanName(visit.producer)}_S${cleanName(visit.lot)}_${cleanName(visit.date)}.zip`;
  }
  const dates = visits.map((visit) => visit.date).filter(Boolean).sort();
  const period = dates.length ? `${dates[0]}_${dates.at(-1)}` : new Date().toISOString().slice(0, 10);
  const farms = [...new Set(visits.map((visit) => visit.farmCode).filter(Boolean))];
  const group = farms.length === 1 ? `${cleanName(farms[0])}_${cleanName(visits[0].producer)}` : "Seleccion";
  return `Visitas_Campo_CASUR_${group}_${period}.zip`;
}

export function visitsExcelFilename(visits = []) {
  const dates = visits.map((visit) => visit.date).filter(Boolean).sort();
  const period = dates.length ? `${dates[0]}_${dates.at(-1)}` : new Date().toISOString().slice(0, 10);
  return `Historial_Visitas_Campo_CASUR_${period}.xlsx`;
}
