(function () {
  "use strict";
  const E = window.CASUR_ENGINE;
  const results = E.selfTests().tests;
  const add = (name, pass, detail = "") => results.push({ name, pass: Boolean(pass), detail });

  function workbookBuffer(sheetDefinitions) {
    const wb = XLSX.utils.book_new();
    sheetDefinitions.forEach(([name, rows]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name));
    return XLSX.write(wb, { type: "array", bookType: "xlsx" });
  }

  const siagriHeaders = ["Cod. Hacienda", "Nombre Hacienda", "Ste", "Dt", "Variedad", "NC", "Nombre Textura", "Surco", "Tch.Inic", "Tch.Act", "F. Siembra", "F. Ult. Cte", "Tch.Ant", "Nombre Destino del Cultivo", "Tn", "CodTipoRiego", "TipoRiego", "NR", "ERP", "ZONA", "Area"];
  const siagriRows = [
    siagriHeaders,
    ["16", "Sucuya", "01", 6, "CP", "2", "Medio", 1.5, 90, 80, "2020-01-01", "2026-01-01", 80, "Molienda", "PR", "GR", "Gravedad", 0, "", "1-Sur", 5],
    ["007", "Prueba Ceros", "01", 4, "CP", "2", "Medio", 1.5, 90, 80, "2020-01-01", "2026-01-01", 80, "Molienda", "CA", "SC", "Secano", 0, "", "1-Sur", 10],
    ["993", "Pansaco", "24A", 4, "CP", "R", "Medio", 1.5, 90, 80, "", "2026-01-25", 80, "Semilla AS", "CV", "GR", "Gravedad", 0, "", "5-Productores", 2.43],
    ["993", "Pansaco", "47A", 4, "CP", "4", "Medio", 1.5, 90, 80, "2022-04-06", "2025-03-14", 80, "Molienda", "CV", "GR", "Gravedad", 0, "", "5-Productores", 2.38],
  ];
  const estimateHeaders = ["Zona", "CodHacienda", "NomHacienda", "Suerte", "Variedad", "NC", "TipoSuelo", "FecSiembra", "FecUltCorte", "Destino", "Tenencia", "TipoRiego", "Area_ABC", "TCH_Est_Vigente", "TON_ABC"];
  const estimateRows = [
    ["ESTIMADO RENOMBRADO"], [], estimateHeaders,
    ["5-Productores", "993", "Pansaco", "24A", "CP", "R", "Medio", "", "2026-01-25", "Semilla AS", "CV", "Gravedad", 2.43, "", ""],
    ["5-Productores", "993", "Pansaco", "47A", "CP", "4", "Medio", "2022-04-06", "2025-03-14", "Molienda", "CV", "Gravedad", 2.38, 75, 178.5],
  ];
  try {
    const sInspect = E.inspectWorkbook(workbookBuffer([["Resumen", [["Dato"], [1]]], ["Entrada_SIAGRI", siagriRows]]), "siagri");
    const eInspect = E.inspectWorkbook(workbookBuffer([["Portada", [["Título"]]], ["Estimado_Agosto", estimateRows]]), "estimate");
    add("Detecta SIAGRI aunque no sea la primera hoja", sInspect.selectedSheet === "Entrada_SIAGRI", sInspect.selectedSheet);
    add("Detecta estimado con nombre diferente", eInspect.selectedSheet === "Estimado_Agosto", eInspect.selectedSheet);
    const dataset = E.buildDataset(sInspect, sInspect.selectedSheet, eInspect, eInspect.selectedSheet, {}, new Date(2026, 7, 22));
    add("SIAGRI solo excluye Sucuya", dataset.audit.sourceRows === 4 && dataset.audit.sucuyaExcluded === 1 && dataset.audit.finalRows === 3);
    add("Cobertura Productores no crea faltantes en Sur", dataset.audit.coverageZones.length === 1 && dataset.audit.coverageZones[0] === "5-Productores" && dataset.records.find((r) => r.cod === "007").stateDetected === "Fuera de cobertura del estimado");
    add("Pansaco 24A queda renovación pendiente sin edad", dataset.records.find((r) => r.hacSue === "99324A")?.edad === null && dataset.records.find((r) => r.hacSue === "99324A")?.stateDetected === "Renovación pendiente");
    add("Pansaco 47A queda baja e inactiva", dataset.records.find((r) => r.hacSue === "99347A")?.active === false);
    add("TCH detectado conserva el encabezado real", dataset.estimateField === "TCH_Est_Vigente", dataset.estimateField);
    add("Código con cero permanece texto", dataset.records.find((r) => r.cod === "007")?.hacSue === "00701");
    add("Tipo_de_Riego conserva el nombre completo", dataset.records.find((r) => r.cod === "007")?.tipoRiego === "Secano", dataset.records.find((r) => r.cod === "007")?.tipoRiego);
    const multiEstimate = estimateRows.concat([["1-Sur", "007", "Prueba Ceros", "01", "CP", "2", "Medio", "2020-01-01", "2026-01-01", "Molienda", "CA", "Gravedad", 10, 80, 800]]);
    const multiInspect = E.inspectWorkbook(workbookBuffer([["Produccion", multiEstimate]]), "estimate");
    const multiData = E.buildDataset(sInspect, sInspect.selectedSheet, multiInspect, multiInspect.selectedSheet, {}, new Date(2026, 7, 22));
    add("Estimado de varias zonas detectado", multiData.audit.coverageZones.length === 2);
    const fullRows = multiEstimate.concat([["2-Centro", "30", "Centro", "01", "CP", "2", "Medio", "2020-01-01", "2026-01-01", "Molienda", "PR", "Gravedad", 3, 70, 210], ["3-Norte", "40", "Norte", "01", "CP", "2", "Medio", "2020-01-01", "2026-01-01", "Molienda", "PR", "Gravedad", 3, 70, 210]]);
    const fullInspect = E.inspectWorkbook(workbookBuffer([["Estimado", fullRows]]), "estimate");
    const fullData = E.buildDataset(sInspect, sInspect.selectedSheet, fullInspect, fullInspect.selectedSheet, {}, new Date(2026, 7, 22));
    add("Estimado completo CASUR detectado", fullData.audit.coverageZones.length === 4 && fullData.audit.coverageLabel === "Todo CASUR");
  } catch (error) {
    add("Escenarios sintéticos ejecutan sin error", false, error.message);
  }

  const passed = results.filter((test) => test.pass).length;
  const target = document.getElementById("results");
  target.replaceChildren();
  const summary = document.createElement("div");
  summary.className = `summary ${passed === results.length ? "" : "fail"}`;
  summary.textContent = `${passed} de ${results.length} pruebas aprobadas`;
  target.appendChild(summary);
  results.forEach((test) => {
    const row = document.createElement("div"); row.className = `test ${test.pass ? "" : "bad"}`;
    const icon = document.createElement("i"); icon.textContent = test.pass ? "✓" : "!";
    const text = document.createElement("span"); text.textContent = `${test.name}${test.detail ? ` · ${test.detail}` : ""}`;
    row.append(icon, text); target.appendChild(row);
  });
  document.title = `${passed === results.length ? "OK" : "FALLO"} · Pruebas CASUR`;
})();
