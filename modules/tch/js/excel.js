import { FORMULA_FACTOR, finiteNumber, weightedMean } from "./tch-engine.js";

const colors = { dark: "073D24", green: "0B7F3A", blue: "005BAA", gold: "F4C542", pale: "EAF6EE", line: "D8E6DC", white: "FFFFFF" };

function styleSheet(ws, headerRow = 0, widths = []) {
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const cell = ws[XLSX.utils.encode_cell({ r: headerRow, c: column })];
    if (!cell) continue;
    cell.s = {
      font: { bold: true, color: { rgb: colors.white }, sz: 11 },
      fill: { fgColor: { rgb: colors.green } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: { bottom: { style: "medium", color: { rgb: colors.dark } } },
    };
  }
  for (let row = headerRow + 1; row <= range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const cell = ws[XLSX.utils.encode_cell({ r: row, c: column })];
      if (!cell) continue;
      cell.s = {
        fill: row % 2 ? { fgColor: { rgb: "F8FBF9" } } : undefined,
        border: { bottom: { style: "hair", color: { rgb: colors.line } } },
        alignment: { vertical: "center", wrapText: false },
      };
    }
  }
  ws["!cols"] = widths.map((wch) => ({ wch }));
  ws["!rows"] = [{ hpt: 30 }];
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ r: headerRow, c: range.s.c }, { r: range.e.r, c: range.e.c }) };
}

function titleSheet(ws, title, subtitle, columns) {
  XLSX.utils.sheet_add_aoa(ws, [[title], [subtitle], []], { origin: "A1" });
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(1, columns - 1) } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: Math.max(1, columns - 1) } },
  ];
  ws.A1.s = { font: { bold: true, color: { rgb: colors.white }, sz: 16 }, fill: { fgColor: { rgb: colors.dark } }, alignment: { vertical: "center" } };
  ws.A2.s = { font: { italic: true, color: { rgb: "365A46" } }, fill: { fgColor: { rgb: colors.pale } } };
  ws["!rows"] = [{ hpt: 30 }, { hpt: 22 }, { hpt: 8 }];
}

function addSheet(workbook, name, title, subtitle, headers, rows, widths) {
  const ws = XLSX.utils.aoa_to_sheet([[], [], [], headers, ...rows]);
  titleSheet(ws, title, subtitle, headers.length);
  styleSheet(ws, 3, widths);
  workbook.SheetNames.push(name);
  workbook.Sheets[name] = ws;
  return ws;
}

function latestByLot(records) {
  const map = new Map();
  (records || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).forEach((record) => {
    if (!map.has(record.lotId)) map.set(record.lotId, record);
  });
  return [...map.values()];
}

function pointHeightM(point) {
  return finiteNumber(point?.heightM) || (finiteNumber(point?.lengthCm) / 100) || null;
}

function pointDiameterMm(point) {
  return finiteNumber(point?.diameterMm) || (finiteNumber(point?.diameterCm) * 10) || null;
}

export function buildWorkbook({ master = [], biometries = [], weighings = [], harvests = [] }) {
  if (!globalThis.XLSX) throw new Error("No se cargó el componente Excel.");
  const wb = XLSX.utils.book_new();
  const estimates = latestByLot(biometries);

  const masterRows = master.map((lot) => [
    lot.zone, lot.tenureCode, lot.tenureLabel, lot.farmCode, lot.producer, lot.lot, lot.id, lot.area,
    lot.variety, lot.referenceAge, lot.rowSpacingM, lot.cutNumber, lot.texture, lot.distanceKm,
    lot.plantingDate, lot.lastCutDate, lot.destination, lot.cropType, lot.irrigation, lot.irrigationCount, lot.erp,
    lot.historicalTch, lot.latestSeasonTch, lot.estimatedTch2627, lot.estimatedTons2627, lot.estimatedTch2627UpdatedAt, lot.masterStatus, lot.masterObservation,
  ]);
  addSheet(wb, "Maestro General", "CASUR · MAESTRO GENERAL DE SUERTES", "Zonas operativas 1, 2, 3 y 5. Zona 0 / Sucuya excluida.", [
    "Zona", "Tn", "Tenencia", "Código hacienda", "Hacienda", "Suerte", "Código suerte", "Área (ha)",
    "Variedad", "Edad referencia", "Surco (m)", "# Corte", "Textura", "Distancia (km)", "F. Siembra",
    "F. Último corte", "Destino", "Tipo cultivo", "Riego", "# Riegos", "ERP", "TCH histórico promedio", "TCH 25/26", "TCH ESTIMADO Z26/27", "Ton estimadas Z26/27", "Fecha fuente Z26/27", "Estado", "Observación",
  ], masterRows, [16, 8, 17, 15, 32, 10, 15, 12, 18, 14, 12, 10, 14, 14, 13, 15, 16, 20, 16, 12, 25, 21, 15, 22, 22, 18, 22, 38]);

  const byFarm = new Map();
  estimates.forEach((record) => {
    if (!byFarm.has(record.farmCode)) byFarm.set(record.farmCode, []);
    byFarm.get(record.farmCode).push(record);
  });
  const farmCodes = [...new Set(master.map((lot) => lot.farmCode))];
  const summaryRows = farmCodes.map((farmCode) => {
    const rows = byFarm.get(farmCode) || [];
    const farmLots = master.filter((lot) => lot.farmCode === farmCode);
    const producer = farmLots[0]?.producer || rows[0]?.producer || "";
    const zone = farmLots[0]?.zone || rows[0]?.zone || "";
    const evaluatedArea = rows.reduce((sum, row) => sum + finiteNumber(row.area), 0);
    const totalArea = farmLots.reduce((sum, lot) => sum + finiteNumber(lot.area), 0);
    return [farmCode, producer, zone, totalArea, evaluatedArea, totalArea > 0 ? evaluatedArea / totalArea : 0,
      weightedMean(rows, "projectedTch", "area"), rows.reduce((sum, row) => sum + finiteNumber(row.projectedTons), 0), rows.length, farmLots.length];
  });
  const wsSummary = addSheet(wb, "Resumen Haciendas", "CASUR · RESUMEN POR HACIENDA", "Últimas biometrías ponderadas por área neta", [
    "Código hacienda", "Hacienda", "Zona", "Área total (ha)", "Área evaluada (ha)", "Avance por área", "TCH proyectado ponderado", "Toneladas proyectadas", "Suertes evaluadas", "Suertes maestro",
  ], summaryRows, [16, 32, 16, 15, 18, 16, 24, 22, 18, 16]);
  for (let row = 5; row <= summaryRows.length + 4; row += 1) {
    if (wsSummary[`F${row}`]) wsSummary[`F${row}`].z = "0.0%";
    ["D", "E", "G", "H"].forEach((col) => { if (wsSummary[`${col}${row}`]) wsSummary[`${col}${row}`].z = "0.00"; });
  }

  addSheet(wb, "Estimados por Suerte", "CASUR · ESTIMADOS POR SUERTE", "El TCH proyectado por biometría es el resultado principal; peso e históricos son contrastes.", [
    "Fecha", "Zona", "Tn", "Tenencia", "Código finca", "Hacienda", "Suerte", "Código suerte", "Área (ha)", "Variedad",
    "Edad actual", "Edad referencia", "TCHe biométrico", "TCH peso contraste", "Puntos con peso", "Ajuste (%)", "Motivo ajuste",
    "TCH proyectado", "Toneladas", "TCH histórico promedio", "TCH zafra 25/26", "TCH ESTIMADO Z26/27", "Dif. proy. vs Z26/27 (%)", "CV (%)", "Calidad", "Validado", "Validado por", "Técnico",
  ], estimates.map((r) => [
    r.date, r.zone, r.tenureCode, r.tenureLabel, r.farmCode, r.producer, r.lot, r.lotId, r.area, r.variety,
    r.currentAgeMonths, r.targetAgeMonths, r.biometricTch, r.weightTch, r.weightPointCount, r.adjustmentPct, r.adjustmentReason,
    r.projectedTch, r.projectedTons, r.historicalTch, r.latestSeasonTch, r.estimatedTch2627,
    r.estimatedTch2627 ? ((r.projectedTch - r.estimatedTch2627) / r.estimatedTch2627) * 100 : null,
    r.cvPct, r.quality, r.validated ? "Sí" : "No", r.validatedBy, r.technician,
  ]), [12, 16, 8, 17, 13, 32, 9, 14, 11, 18, 13, 14, 15, 18, 15, 12, 24, 16, 16, 21, 18, 20, 22, 11, 11, 10, 22, 22]);

  addSheet(wb, "Biometrías", "CASUR · BIOMETRÍAS", "Todas las evaluaciones guardadas, incluidas versiones anteriores.", [
    "ID", "Fecha", "Hora", "Técnico", "Código suerte", "Hacienda", "Suerte", "Zona", "Tenencia",
    "Edad actual", "Edad referencia", "Ajuste (%)", "Motivo", "TCHe actual", "TCH peso contraste", "TCH proyectado",
    "Toneladas", "TCH ESTIMADO Z26/27", "Dif. proy. vs Z26/27 (%)", "Puntos", "Puntos con peso", "Tramo común (m)", "Mínimo", "Máximo", "Desv. estándar", "CV (%)",
    "Calidad", "Validado", "Fecha validación", "Validado por", "Observaciones", "Actualizado", "Revisión",
  ], biometries.map((r) => [
    r.id, r.date, r.time, r.technician, r.lotId, r.producer, r.lot, r.zone, r.tenureLabel || r.tenureCode,
    r.currentAgeMonths, r.targetAgeMonths, r.adjustmentPct, r.adjustmentReason, r.biometricTch, r.weightTch, r.projectedTch,
    r.projectedTons, r.estimatedTch2627, r.estimatedTch2627 ? ((r.projectedTch - r.estimatedTch2627) / r.estimatedTch2627) * 100 : null,
    r.pointCount, r.weightPointCount || 0, r.sampleLengthM, r.minTch, r.maxTch, r.sdTch, r.cvPct,
    r.quality, r.validated ? "Sí" : "No", r.validatedAt, r.validatedBy, r.notes, r.updatedAt, r.revision || 0,
  ]), [24, 12, 10, 22, 14, 30, 9, 16, 17, 13, 13, 12, 24, 14, 18, 16, 16, 10, 15, 17, 12, 12, 15, 11, 11, 10, 22, 22, 38, 22, 10]);

  const pointRows = biometries.flatMap((record) => (record.samples || []).map((point) => [
    record.id, record.date, record.lotId, record.producer, record.lot, record.zone, record.tenureLabel || record.tenureCode,
    point.pointCode, point.sampleLengthM, point.stalkCount, point.directStalksPerMeter || point.stalksPerMeter,
    pointHeightM(point), pointDiameterMm(point), point.rowSpacingM, point.tch,
    point.weighingEnabled ? "Sí" : "No", point.weighedStalkCount, point.weighedTotalKg, point.averageStalkWeightKg, point.weightTch,
    point.latitude, point.longitude, point.gpsAccuracyM, point.capturedAt, point.notes,
  ]));
  addSheet(wb, "Puntos de Muestreo", "CASUR · PUNTOS DE MUESTREO", "TCHe oficial con H en metros y D en milímetros. Peso por tallo es opcional y se registra solo cuando el técnico lo activa.", [
    "ID biometría", "Fecha", "Código suerte", "Hacienda", "Suerte", "Zona", "Tenencia", "Punto",
    "Tramo (m)", "Tallos contados", "POB tallos/m", "H altura (m)", "D diámetro (mm)", "Surco (m)", "TCHe punto",
    "Pesaje opcional", "Tallos pesados", "Peso total (kg)", "Peso promedio/tallo (kg)", "TCH peso contraste",
    "Latitud", "Longitud", "Precisión GPS (m)", "Fecha/hora GPS", "Observación",
  ], pointRows, [24, 12, 14, 30, 9, 16, 17, 10, 12, 15, 13, 14, 16, 12, 14, 15, 15, 15, 21, 18, 14, 14, 17, 22, 36]);

  addSheet(wb, "Pesajes", "CASUR · PESAJE PRECOSECHA HISTÓRICO", "Registros del módulo separado conservados por compatibilidad.", [
    "ID", "Fecha", "Técnico", "Código suerte", "Hacienda", "Suerte", "Zona", "Tenencia", "Edad", "Método",
    "Peso total (kg)", "Tramo (m)", "Tallos contados", "Tallos/m", "Peso tallo (kg)", "Surco (m)", "TCH peso", "Latitud", "Longitud", "Observación",
  ], weighings.map((r) => [
    r.id, r.date, r.technician, r.lotId, r.producer, r.lot, r.zone, r.tenureLabel || r.tenureCode, r.ageMonths, r.method,
    r.totalWeightKg, r.sampleLengthM, r.stalkCount, r.stalksPerMeter, r.averageStalkWeightKg, r.rowSpacingM, r.tch, r.latitude, r.longitude, r.notes,
  ]), [24, 12, 22, 14, 30, 9, 16, 17, 10, 20, 17, 12, 15, 12, 16, 12, 13, 14, 14, 36]);

  const historicalRows = estimates.map((r) => {
    const oldWeight = weighings.filter((w) => w.lotId === r.lotId).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    const harvest = harvests.filter((h) => h.lotId === r.lotId).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    const weightTch = finiteNumber(r.weightTch) || finiteNumber(oldWeight?.tch) || null;
    const historicalDelta = r.historicalTch ? ((r.projectedTch - r.historicalTch) / r.historicalTch) * 100 : null;
    const realError = harvest?.tchReal ? ((r.projectedTch - harvest.tchReal) / harvest.tchReal) * 100 : null;
    const latestSeasonDelta = r.latestSeasonTch ? ((r.projectedTch - r.latestSeasonTch) / r.latestSeasonTch) * 100 : null;
    const estimateDelta = r.estimatedTch2627 ? ((r.projectedTch - r.estimatedTch2627) / r.estimatedTch2627) * 100 : null;
    return [r.lotId, r.producer, r.lot, r.zone, r.tenureLabel || r.tenureCode, r.historicalTch, r.latestSeasonTch, r.estimatedTch2627, r.biometricTch, r.projectedTch, weightTch, harvest?.tchReal || null, historicalDelta, latestSeasonDelta, estimateDelta, realError];
  });
  addSheet(wb, "Comparativo Histórico", "CASUR · COMPARATIVO", "Histórico, TCHe, proyección, peso opcional y cosecha real", [
    "Código suerte", "Hacienda", "Suerte", "Zona", "Tenencia", "TCH histórico promedio", "TCH zafra 25/26", "TCH estimado 26/27",
    "TCHe biométrico", "TCH proyectado", "TCH peso contraste", "TCH real", "Dif. proy. vs histórico (%)",
    "Dif. proy. vs 25/26 (%)", "Dif. proy. vs 26/27 (%)", "Error proy. vs real (%)",
  ], historicalRows, [14, 32, 9, 16, 17, 21, 18, 20, 16, 16, 18, 13, 24, 22, 22, 22]);

  const methodology = [
    ["Parámetro", "Definición / fórmula"],
    ["Biometría oficial", "TCHe = D²(mm) × H(m) × POB(tallos/m) × 0.007854 ÷ DistSurco(m)"],
    ["Constante", FORMULA_FACTOR],
    ["Compatibilidad v2.3", "Los registros antiguos con longitud en cm y diámetro en cm se convierten al leerlos; no se reinterpretan."],
    ["Proyección principal", "TCH proyectado = (TCHe biométrico ÷ edad actual) × edad de referencia × (1 − ajuste/100)"],
    ["Peso opcional", "El pesaje inicia desactivado. Si el técnico lo activa, se captura número de tallos y peso total. Peso promedio = peso total ÷ tallos pesados."],
    ["TCH peso contraste", "TCHpeso = POB × peso promedio/tallo(kg) × 10 ÷ DistSurco(m). No sustituye ni se promedia automáticamente con TCHe."],
    ["Pesaje completo heredado", "TCH peso = (peso total kg × 10) ÷ (longitud muestreada m × distancia entre surcos m)"],
    ["TCH hacienda", "Σ(TCH proyectado × área) ÷ Σ(área)"],
    ["CV", "Coeficiente de variación = desviación estándar ÷ promedio × 100. Describe uniformidad; no modifica el TCH."],
    ["Maestro", "Fuente oficial: hoja REPORTE. Zonas operativas: 1-Sur, 2-Centro, 3-Norte y 5-Productores. Zona 0/Sucuya excluida."],
    ["Tenencia", "Tn: CA=Arriendo, CV=Compra Venta, PR=Propio."],
    ["Fecha de generación", new Date().toLocaleString("es-NI")],
  ];
  const wsMethod = XLSX.utils.aoa_to_sheet(methodology);
  styleSheet(wsMethod, 0, [31, 110]);
  wsMethod["!autofilter"] = undefined;
  wb.SheetNames.push("Metodología");
  wb.Sheets["Metodología"] = wsMethod;

  return wb;
}

export function downloadWorkbook(data, filename = `Estimados_TCH_CASUR_${new Date().toISOString().slice(0, 10)}.xlsx`) {
  const workbook = buildWorkbook(data);
  XLSX.writeFile(workbook, filename, { compression: true });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}
