import test from "node:test";
import assert from "node:assert/strict";
import {
  averageStalkWeightKg, sampleTch, sampleWeightTch, stats, tchAverageStalkWeight,
  tchFullRowWeight, tchProjection, tchVolumetric,
} from "../js/tch-engine.js";
import {
  isOperationalLot, masterFingerprint, masterSuggestions, masterToEmbeddedRows, normalizeEmbeddedMaster,
  parseMasterWorkbook, parseSeasonEstimateWorkbook,
} from "../js/master.js";

test("fórmula oficial H(m) y D(mm) reproduce 162.916 TCH", () => {
  const result = tchVolumetric({ stalksPerMeter: 12, heightM: 2.93, diameterMm: 31.2, rowSpacingM: 1.65 });
  assert.ok(Math.abs(result - 162.916) < 0.002);
});

test("segundo ejemplo oficial reproduce 102.057 TCH", () => {
  const result = tchVolumetric({ stalksPerMeter: 9, heightM: 3.22, diameterMm: 27.2, rowSpacingM: 1.65 });
  assert.ok(Math.abs(result - 102.057) < 0.002);
});

test("compatibilidad v2.3 conserva fórmula con longitud y diámetro en cm", () => {
  const result = tchVolumetric({ stalksPerMeter: 12, lengthCm: 100, diameterCm: 2.5, rowSpacingM: 1.8 });
  assert.ok(Math.abs(result - 32.725) < 0.001);
  assert.ok(Math.abs(sampleTch({ directStalksPerMeter: 12, lengthCm: 100, diameterCm: 2.5, rowSpacingM: 1.8 }, 1.8) - 32.725) < 0.001);
});

test("proyección por edad siempre parte del TCH biométrico", () => {
  const result = tchProjection({ biometricTch: 32.725, currentAgeMonths: 4.63, targetAgeMonths: 10, adjustmentPct: 5 });
  assert.ok(Math.abs(result - 67.14) < 0.01);
  assert.notEqual(result, 80);
});

test("pesaje opcional calcula peso promedio y TCH contraste", () => {
  const average = averageStalkWeightKg({ weighedStalkCount: 5, weighedTotalKg: 8 });
  assert.equal(average, 1.6);
  const result = sampleWeightTch({
    directStalksPerMeter: 12,
    weighedStalkCount: 5,
    weighedTotalKg: 8,
    rowSpacingM: 1.8,
  }, 1.8);
  assert.ok(Math.abs(result - 106.6666667) < 0.001);
});


test("TCHpeso no depende de una edad mínima en el motor", () => {
  const result = sampleWeightTch({ directStalksPerMeter: 10, weighedStalkCount: 2, weighedTotalKg: 3, rowSpacingM: 1.5 }, 1.5);
  assert.equal(result, 100);
});

test("pesaje completo heredado produce 80 TCH", () => {
  assert.equal(tchFullRowWeight({ totalWeightKg: 72, sampleLengthM: 5, rowSpacingM: 1.8 }), 80);
});

test("peso promedio por tallo heredado aplica población y surco", () => {
  assert.equal(tchAverageStalkWeight({ stalksPerMeter: 12, averageStalkWeightKg: 1.2, rowSpacingM: 1.8 }), 80);
});

test("división por cero retorna null", () => {
  assert.equal(tchVolumetric({ stalksPerMeter: 12, heightM: 1, diameterMm: 25, rowSpacingM: 0 }), null);
  assert.equal(tchProjection({ biometricTch: 32.725, currentAgeMonths: 0, targetAgeMonths: 10, adjustmentPct: 5 }), null);
});

test("estadística mantiene variabilidad sin cambiar el promedio", () => {
  const result = stats([40, 50, 60]);
  assert.equal(result.mean, 50);
  assert.equal(result.min, 40);
  assert.equal(result.max, 60);
  assert.ok(result.cv > 0);
});

test("maestro integrado conserva cero de suerte, tenencia y compatibilidad legacy", () => {
  const master = normalizeEmbeddedMaster([{
    codigoHacienda: "993", productor: "Pansaco", suerte: "01", hacSue: "9931", area: 19,
    variedad: "CP 72-2086", surco: 1.65, tenenciaCode: "CV", tenenciaLabel: "Compra Venta", zona: "5-Productores",
  }]);
  assert.equal(master[0].id, "99301");
  assert.equal(master[0].legacyId, "9931");
  assert.equal(master[0].tenureCode, "CV");
  assert.equal(masterSuggestions(master, "Pansaco 01")[0].id, "99301");
});

test("Sucuya / Zona 0 queda fuera del maestro operativo", () => {
  assert.equal(isOperationalLot({ producer: "Sucuya", zone: "0-Sin Definir" }), false);
  const master = normalizeEmbeddedMaster([
    { codigoHacienda: "16", productor: "Sucuya", suerte: "01", area: 9.56, zona: "0-Sin Definir" },
    { codigoHacienda: "242", productor: "Productor A", suerte: "01", area: 1, zona: "5-Productores", tenenciaCode: "CV" },
  ]);
  assert.equal(master.length, 1);
  assert.equal(master[0].producer, "Productor A");
});

test("Productores se prioriza en búsquedas equivalentes sin ocultar otras zonas", () => {
  const master = normalizeEmbeddedMaster([
    { codigoHacienda: "100", productor: "San Jose", suerte: "01", area: 1, zona: "1-Sur", tenenciaCode: "PR" },
    { codigoHacienda: "200", productor: "San Jose Productor", suerte: "01", area: 1, zona: "5-Productores", tenenciaCode: "CV" },
  ]);
  const results = masterSuggestions(master, "San Jose");
  assert.equal(results.length, 2);
  assert.equal(results[0].zone, "5-Productores");
  assert.equal(results[1].zone, "1-Sur");
});

test("maestro publicado conserva campos y detecta cambios por huella", async () => {
  const master = normalizeEmbeddedMaster([{
    codigoHacienda: "993", productor: "Pansaco", suerte: "01", hacSue: "9931", area: 19,
    variedad: "CP 72-2086", surco: 1.65, tipoRiego: "Gravedad", tchHistorico: 63.66,
    tchHistoricoPromedio: 70.14, tchZafra2526: 63.66, tenenciaCode: "PR", zona: "5-Productores",
    tchEstimado2627: 65, tchEstimado2627Fecha: "2026-07-17", tchEstimado2627Fuente: "Fuente oficial",
  }]);
  const published = masterToEmbeddedRows(master);
  assert.equal(published[0].codigoHacienda, "993");
  assert.equal(published[0].suerte, "01");
  assert.equal(published[0].tipoRiego, "Gravedad");
  assert.equal(published[0].tenenciaCode, "PR");
  assert.equal(published[0].tchHistoricoPromedio, 70.14);
  assert.equal(published[0].tchZafra2526, 63.66);
  assert.equal(published[0].tchEstimado2627, 65);
  assert.equal(published[0].tchEstimado2627Fecha, "2026-07-17");
  const originalFingerprint = await masterFingerprint(master);
  master[0].area = 20;
  assert.notEqual(await masterFingerprint(master), originalFingerprint);
});

test("actualizador 26/27 vincula por código hacienda + suerte normalizada", async () => {
  const originalXlsx = globalThis.XLSX;
  const matrix = [
    ["Reporte preliminar"],
    ["Zona", "CodHacienda", "NomHacienda", "Suerte", "hac-sue", "Destino", "TCH_Est_170726"],
    ["5-Productores", "993", "Pansaco", "2", "9932", "Molienda", 65],
  ];
  globalThis.XLSX = {
    read: () => ({ SheetNames: ["Productores_V3"], Sheets: { Productores_V3: matrix } }),
    utils: { sheet_to_json: (sheet, options) => options?.header === 1 ? sheet : [] },
  };
  try {
    const current = normalizeEmbeddedMaster([{ codigoHacienda: "993", productor: "Pansaco", suerte: "02", area: 9.87, zona: "5-Productores" }]);
    const withoutDeclaration = await parseSeasonEstimateWorkbook({ name: "fuente.xlsx", arrayBuffer: async () => new ArrayBuffer(0) }, current, { requireDeclaredDate: true });
    assert.equal(withoutDeclaration.report.canApply, false, "La actualización debe exigir fecha declarada por el usuario");
    const result = await parseSeasonEstimateWorkbook({ name: "fuente.xlsx", arrayBuffer: async () => new ArrayBuffer(0) }, current, { declaredSourceDate: "2026-07-17", requireDeclaredDate: true });
    assert.equal(result.report.matched, 1);
    assert.equal(result.report.withEstimate, 1);
    assert.equal(result.report.canApply, true);
    assert.equal(result.report.dateMismatch, false);
    assert.equal(result.lots[0].estimatedTch2627, 65);
    assert.equal(result.lots[0].estimatedTch2627UpdatedAt, "2026-07-17");
    const mismatch = await parseSeasonEstimateWorkbook({ name: "fuente.xlsx", arrayBuffer: async () => new ArrayBuffer(0) }, current, { declaredSourceDate: "2026-07-18", requireDeclaredDate: true });
    assert.equal(mismatch.report.canApply, false, "Una fecha declarada distinta de la fecha detectada debe bloquearse");
    assert.equal(mismatch.report.dateMismatch, true);
  } finally { globalThis.XLSX = originalXlsx; }
});

test("cronológico oficial detecta REPORTE y encabezados flexibles", async () => {
  const originalXlsx = globalThis.XLSX;
  const matrix = [
    ["Hac-Sue", "Cod", "Hacienda", "Suerte", "Area", "Variedad", "TCH_Z2526", "TCH_Estimado_Z2627", "#_de_Corte", "Tipo_de_Riego", "#_de_Riegos", "Tenencia", "ZONA", "Estado", "Observación"],
    ["60303", "603", "Freddy Sovalvarro", "3", 4.53, "RB 84-5210", 72.5, 78.4, "2", "Gravedad", 3, "Compra Venta", "5-Productores", "Mantener activo", "Validar población"],
  ];
  globalThis.XLSX = {
    read: () => ({ SheetNames: ["Hoja auxiliar", "REPORTE"], Sheets: { "Hoja auxiliar": [["nada"]], REPORTE: matrix } }),
    utils: { sheet_to_json: (sheet, options) => options?.header === 1 ? sheet : [] },
  };
  try {
    const current = normalizeEmbeddedMaster([{
      codigoHacienda: "603", productor: "Freddy Sovalvarro", suerte: "03", area: 4.53,
      zona: "5-Productores", tchEstimado2627: 78.4, tchEstimado2627Fecha: "2026-07-17",
      tchEstimado2627Fuente: "Estimado oficial 17-jul-2026",
    }]);
    const result = await parseMasterWorkbook({ name: "Cronologico_2026-08-24.xlsx", arrayBuffer: async () => new ArrayBuffer(0) }, current);
    assert.equal(result.sheetName, "REPORTE");
    assert.equal(result.report.headerRow, 1);
    assert.equal(result.lots[0].id, "60303");
    assert.equal(result.lots[0].latestSeasonTch, 72.5);
    assert.equal(result.lots[0].estimatedTch2627, 78.4);
    assert.equal(result.lots[0].estimatedTch2627UpdatedAt, "2026-07-17", "Actualizar el cronológico no debe fechar de nuevo el estimado");
    assert.equal(result.lots[0].irrigationCount, 3);
    assert.equal(result.lots[0].tenureCode, "CV");
    assert.equal(result.lots[0].masterStatus, "Mantener activo");
  } finally { globalThis.XLSX = originalXlsx; }
});
