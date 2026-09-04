(function () {
  "use strict";

  const E = window.CASUR_ENGINE;
  const C = window.CASUR_CONFIG;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = {
    siagri: null,
    estimate: null,
    previous: null,
    dataset: null,
    comparison: null,
    manualValidations: loadValidations(),
    masterPage: 1,
    masterPageSize: 40,
    installPrompt: null,
  };

  const palette = [
    ["#159447", "#e4f5e9"], ["#2293b8", "#e4f4f8"], ["#c99518", "#fff3cf"],
    ["#70a832", "#edf6df"], ["#d45b45", "#fbe9e5"],
  ];

  function loadValidations() {
    try { return JSON.parse(localStorage.getItem("casur-master-validations-v1") || "{}"); }
    catch { return {}; }
  }

  function saveValidations() {
    localStorage.setItem("casur-master-validations-v1", JSON.stringify(state.manualValidations));
  }

  function formatNumber(value, digits = 0) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
    return new Intl.NumberFormat("es-NI", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value));
  }

  function formatDate(value) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "—";
    return new Intl.DateTimeFormat("es-NI", { day: "2-digit", month: "short", year: "numeric" }).format(value);
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return "";
    if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, 1)} KB`;
    return `${formatNumber(bytes / 1024 / 1024, 1)} MB`;
  }

  function setPage(page) {
    $$("[data-page-section]").forEach((section) => section.classList.toggle("active", section.dataset.pageSection === page));
    $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.page === page));
    $("#sideNav").classList.remove("open");
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (page === "validacion") renderValidation();
    if (page === "comparativo") renderComparison();
    if (page === "maestro") renderMaster();
  }

  function toast(title, message, type = "success") {
    const node = document.createElement("div");
    node.className = `toast ${type}`;
    const icon = document.createElement("i");
    icon.textContent = type === "error" ? "!" : "✓";
    const copy = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = title;
    const p = document.createElement("p");
    p.textContent = message;
    copy.append(strong, p);
    node.append(icon, copy);
    $("#toastStack").appendChild(node);
    setTimeout(() => node.remove(), 4500);
  }

  function loading(show, text = "Procesando Excel…") {
    $("#loadingText").textContent = text;
    $("#loadingOverlay").hidden = !show;
  }

  function statusClass(status) {
    const value = E.fold(status);
    if (value === "alta" || value === "retirada" || value.includes("baja definitiva") || value.includes("invalida")) return "danger";
    if (value === "media" || value === "modificada" || value.includes("pendiente") || value.includes("validacion") || value.includes("revisar")) return "warning";
    if (value === "nueva" || value.includes("semilla") || value.includes("activo")) return "success";
    if (value === "baja") return "info";
    if (value.includes("cobertura")) return "info";
    return "neutral";
  }

  function statusChip(status) {
    const span = document.createElement("span");
    span.className = `status-chip ${statusClass(status)}`;
    span.textContent = status || "Sin estado";
    return span;
  }

  function kpiHTML(items) {
    return items.map((item, index) => {
      const [accent, tint] = palette[index % palette.length];
      const tag = item.drill ? "button" : "article";
      const drill = item.drill ? ` type="button" data-drill="${encodeURIComponent(item.drill)}" aria-label="Ver detalle: ${item.label}"` : "";
      return `<${tag} class="kpi-card${item.drill ? " interactive" : ""}"${drill} style="--accent:${accent};--tint:${tint}"><span class="kpi-icon">${item.icon}</span><small>${item.label}</small><strong>${item.value}</strong><span>${item.note || ""}</span>${item.drill ? '<em>Ver detalle →</em>' : ""}</${tag}>`;
    }).join("");
  }

  async function handleFile(file, kind) {
    if (!file) return;
    if (!/\.xlsx?$/i.test(file.name)) {
      toast("Archivo no compatible", "Selecciona un archivo .xlsx o .xls.", "error");
      return;
    }
    loading(true, kind === "siagri" ? "Analizando SIAGRI…" : kind === "previous" ? "Analizando cronológico anterior…" : "Analizando estimado…");
    await new Promise((resolve) => setTimeout(resolve, 30));
    try {
      const buffer = await file.arrayBuffer();
      const inspection = E.inspectWorkbook(new Uint8Array(buffer), kind === "estimate" ? "estimate" : "siagri");
      state[kind] = { file, inspection, selectedSheet: inspection.selectedSheet, buffer };
      renderFileResult(kind);
      renderDetection();
      if (kind === "siagri" || (kind === "estimate" && state.siagri)) rebuildDataset();
      else if (kind === "previous") rebuildComparison();
      toast("Archivo analizado", `${file.name}: hoja sugerida ${inspection.selectedSheet}.`);
    } catch (error) {
      console.error(error);
      state[kind] = null;
      renderFileResult(kind);
      toast("No se pudo leer el Excel", error.message || "Revisa que el archivo no esté dañado.", "error");
    } finally {
      loading(false);
    }
  }

  function renderFileResult(kind) {
    const target = $(`#${kind}Result`);
    const item = state[kind];
    target.replaceChildren();
    target.classList.toggle("loaded", Boolean(item));
    if (!item) {
      const span = document.createElement("span");
      span.textContent = kind === "siagri" ? "Sin archivo" : kind === "previous" ? "Sin base anterior" : "Sin archivo opcional";
      target.appendChild(span);
      return;
    }
    const strong = document.createElement("strong");
    strong.textContent = item.file.name;
    const small = document.createElement("small");
    small.textContent = `${formatBytes(item.file.size)} · ${new Date(item.file.lastModified).toLocaleDateString("es-NI")}`;
    const badge = document.createElement("b");
    badge.textContent = "✓";
    target.append(strong, small, badge);
  }

  function renderDetection() {
    const panel = $("#detectionPanel");
    panel.hidden = !state.siagri && !state.estimate && !state.previous;
    renderSheetControl("siagri", $("#siagriSheetSelect"), $("#siagriCompatibility"));
    renderSheetControl("estimate", $("#estimateSheetSelect"), $("#estimateCompatibility"));
    renderSheetControl("previous", $("#previousSheetSelect"), $("#previousCompatibility"));
    const meta = $("#detectedMeta");
    meta.replaceChildren();
    if (state.siagri) addMeta(meta, `SIAGRI: ${state.siagri.inspection.profiles[0].rows} registros detectados`);
    if (state.estimate) {
      const profile = state.estimate.inspection.profiles.find((p) => p.sheetName === state.estimate.selectedSheet);
      addMeta(meta, `Estimado: ${profile?.rows || 0} registros detectados`);
      if (state.dataset?.estimateField) addMeta(meta, `TCH detectado: ${state.dataset.estimateField}`);
      if (state.dataset) addMeta(meta, `Cobertura: ${state.dataset.audit.coverageLabel}`);
    }
    if (state.previous) {
      const profile = state.previous.inspection.profiles.find((p) => p.sheetName === state.previous.selectedSheet);
      addMeta(meta, `Anterior: ${profile?.rows || 0} registros detectados`);
    }
  }

  function addMeta(target, text) {
    const span = document.createElement("span");
    span.textContent = text;
    target.appendChild(span);
  }

  function renderSheetControl(kind, select, list) {
    const item = state[kind];
    select.replaceChildren();
    list.replaceChildren();
    select.disabled = !item;
    if (!item) {
      const option = document.createElement("option");
      option.textContent = kind === "siagri" ? "Carga el SIAGRI" : kind === "previous" ? "Sin base anterior" : "Sin archivo opcional";
      select.appendChild(option);
      return;
    }
    item.inspection.profiles.forEach((profile) => {
      const option = document.createElement("option");
      option.value = profile.sheetName;
      option.textContent = `${profile.sheetName} · ${profile.score}%`;
      option.selected = profile.sheetName === item.selectedSheet;
      select.appendChild(option);
    });
    item.inspection.profiles.slice(0, 6).forEach((profile) => {
      const row = document.createElement("div");
      row.className = "compatibility-row";
      const name = document.createElement("span");
      name.textContent = profile.sheetName;
      const bar = document.createElement("div");
      bar.className = "compatibility-bar";
      const fill = document.createElement("i");
      fill.style.width = `${profile.score}%`;
      bar.appendChild(fill);
      const score = document.createElement("b");
      score.textContent = `${profile.score}%${profile.score >= 90 ? " ✓" : ""}`;
      row.append(name, bar, score);
      list.appendChild(row);
    });
  }

  function rebuildDataset() {
    if (!state.siagri) {
      state.dataset = null;
      renderAll();
      return;
    }
    try {
      state.dataset = E.buildDataset(
        state.siagri.inspection,
        state.siagri.selectedSheet,
        state.estimate?.inspection || null,
        state.estimate?.selectedSheet || "",
        state.manualValidations,
        new Date(),
      );
      state.masterPage = 1;
      rebuildComparison(false);
      renderAll();
    } catch (error) {
      console.error(error);
      state.dataset = null;
      renderAll();
      toast("No se pudo construir el maestro", error.message, "error");
    }
  }

  function rebuildComparison(render = true) {
    state.comparison = null;
    if (state.dataset && state.previous) {
      try {
        const previousDataset = E.buildDataset(
          state.previous.inspection,
          state.previous.selectedSheet,
          null,
          "",
          {},
          new Date(),
        );
        state.comparison = E.compareDatasets(state.dataset.records, previousDataset.records);
        state.comparison.previousFile = state.previous.file.name;
      } catch (error) {
        console.error(error);
        toast("No se pudo comparar", error.message || "Revisa la hoja del cronológico anterior.", "error");
      }
    }
    if (render) renderAll();
  }

  function renderAll() {
    renderHome();
    renderAudit();
    renderComparison();
    renderValidationFilters();
    renderValidation();
    renderMasterFilters();
    renderMaster();
    renderExport();
    renderDetection();
  }

  function renderHome() {
    const a = state.dataset?.audit;
    const records = state.dataset?.records || [];
    const states = records.map((r) => r.stateValidated || r.stateDetected);
    const items = [
      { icon: "S", label: "Suertes", value: formatNumber(a?.finalRows || 0), note: "Todo CASUR válido", drill: "records:all" },
      { icon: "H", label: "Haciendas", value: formatNumber(a?.haciendas || 0), note: "Códigos únicos", drill: "aggregate:haciendas" },
      { icon: "ha", label: "Área total", value: formatNumber(a?.areaTotal || 0, 2), note: "hectáreas SIAGRI", drill: "aggregate:area" },
      { icon: "P", label: "Productores", value: formatNumber(a?.producers || 0), note: "Zona 5-Productores", drill: "records:productores" },
      { icon: "T", label: "Con estimado", value: formatNumber(a?.estimatesAvailable || 0), note: a?.coverageLabel || "Sin estimado", drill: "records:estimados" },
      { icon: "S", label: "Semilla", value: formatNumber(a?.seeds || 0), note: "TCH no obligatorio", drill: "records:semilla" },
      { icon: "Ø", label: "Sin caña", value: formatNumber(states.filter((s) => s === "Sin caña / No cosecha Z26/27").length), note: "Validación manual", drill: "records:sin-cana" },
      { icon: "R", label: "Renovación pendiente", value: formatNumber(a?.renewalPending || 0), note: "Sin edad", drill: "records:renovacion" },
      { icon: "!", label: "Alertas de calidad", value: formatNumber(a?.alerts || 0), note: "Revisión de datos", drill: "records:alertas" },
      { icon: "CT", label: "Atención agronómica", value: formatNumber(a?.agronomicAttention || 0), note: "Criterio técnico", drill: "records:agronomia" },
    ];
    $("#homeKpis").innerHTML = kpiHTML(items);
    $("#homeStatus").textContent = a ? `${formatNumber(a.finalRows)} registros normalizados · ${a.coverageLabel}` : "Carga el SIAGRI para iniciar.";
    const readiness = !a ? 0 : a.criticalPass ? (a.alerts ? 86 : 100) : 48;
    const ring = $("#readinessRing");
    ring.style.setProperty("--progress", `${readiness}%`);
    ring.dataset.value = `${readiness}%`;
    ring.textContent = "";
    const list = $("#readinessList");
    const steps = [
      [Boolean(state.siagri), state.siagri ? "SIAGRI cargado" : "SIAGRI pendiente"],
      [Boolean(a?.criticalPass), a?.criticalPass ? "Validaciones críticas aprobadas" : "Validaciones críticas pendientes"],
      [Boolean(a), a ? "Maestro generado" : "Maestro no generado"],
    ];
    list.replaceChildren(...steps.map(([ok, label]) => {
      const li = document.createElement("li");
      li.className = ok ? "ok" : "";
      li.appendChild(document.createElement("i"));
      li.append(label);
      return li;
    }));
    $("#navAlertBadge").textContent = formatNumber(a?.alerts || 0);
    renderZoneAnalysis();
    renderAgronomyChecks();
  }

  function renderZoneAnalysis() {
    const target = $("#zoneAnalysis");
    const zonesData = state.dataset?.audit.zoneSummary || [];
    target.replaceChildren();
    if (!zonesData.length) {
      const p = document.createElement("p"); p.className = "empty-copy"; p.textContent = "Carga el SIAGRI para conciliar el área por zona."; target.appendChild(p); return;
    }
    const maxArea = Math.max(...zonesData.map((zone) => zone.area), 1);
    zonesData.forEach((zone) => {
      const button = document.createElement("button");
      button.type = "button"; button.className = "zone-row"; button.dataset.drill = encodeURIComponent(`zone:${zone.zona}`);
      const name = document.createElement("span"); name.className = "zone-name"; const nameStrong = document.createElement("strong"); nameStrong.textContent = zone.zona; const nameSmall = document.createElement("small"); nameSmall.textContent = `${formatNumber(zone.suertes)} suertes · ${formatNumber(zone.haciendas)} haciendas`; name.append(nameStrong, nameSmall);
      const track = document.createElement("span"); track.className = "zone-track"; const fill = document.createElement("i"); fill.style.width = `${Math.max(3, (zone.area / maxArea) * 100)}%`; track.appendChild(fill);
      const values = document.createElement("span"); values.className = "zone-values"; const valueStrong = document.createElement("strong"); valueStrong.textContent = `${formatNumber(zone.area, 2)} ha`; const valueSmall = document.createElement("small"); valueSmall.textContent = `${formatNumber(zone.percent, 1)}% CASUR`; values.append(valueStrong, valueSmall);
      button.append(name, track, values);
      target.appendChild(button);
    });
  }

  function renderAgronomyChecks() {
    const a = state.dataset?.audit;
    const checks = [
      ["Edad >18 meses", a?.overAge || 0, "Maduración y programación de corte", "flag:Edad mayor de 18 meses"],
      ["Cepas ≥5 cortes", a?.highCuts || 0, "Revisar productividad y renovación", "flag:Cepa con 5 o más cortes"],
      ["Caída TCH ≥15%", a?.fallingTch || 0, "Comparación contra TCH Z25/26", "flag:Caída de TCH estimada ≥ 15%"],
      ["Riego por revisar", a?.irrigationReview || 0, "Nombre completo, no solo código", "flag:riego"],
      ["Cambio de área", a?.areaMismatch || 0, "Conciliar SIAGRI vs. estimado", "flag:Cambio de área entre fuentes"],
      ["Variedad faltante", a?.missingVariety || 0, "Completar trazabilidad varietal", "flag:Variedad faltante"],
    ];
    const target = $("#agronomyChecks"); target.replaceChildren();
    checks.forEach(([label, value, note, drill]) => {
      const button = document.createElement("button"); button.type = "button"; button.className = "agronomy-check"; button.dataset.drill = encodeURIComponent(drill);
      button.innerHTML = `<span><strong>${label}</strong><small>${note}</small></span><b>${formatNumber(value)}</b><i>→</i>`; target.appendChild(button);
    });
    $("#agronomyBadge").textContent = `${formatNumber(a?.agronomicAttention || 0)} suertes`;
  }

  function renderAudit() {
    const a = state.dataset?.audit;
    const metrics = [
      ["Origen SIAGRI", a?.sourceRows || 0, "S", "audit:source"], ["Sucuya excluida", a?.sucuyaExcluded || 0, "−", "audit:sucuya"],
      ["Registros finales", a?.finalRows || 0, "✓", "records:all"], ["Hac-Sue únicos", a?.uniqueKeys || 0, "#", "records:all"],
      ["Duplicados", a?.duplicates || 0, "D", "audit:duplicates"], ["Fechas inválidas", a?.invalidDates || 0, "F", "audit:dates"],
      ["Renovaciones pendientes", a?.renewalPending || 0, "R", "records:renovacion"], ["Suertes inválidas", a?.invalidLuck || 0, "?", "records:invalid-luck"],
      ["Haciendas inválidas", a?.invalidFarm || 0, "H", "records:invalid-farm"], ["Áreas faltantes", a?.missingArea || 0, "ha", "records:missing-area"],
      ["Estimados disponibles", a?.estimatesAvailable || 0, "T", "records:estimados"], ["Estimados sin dato", a?.estimatesMissing || 0, "Ø", "records:missing-estimate"],
      ["Semilleros", a?.seeds || 0, "S", "records:semilla"], ["Bajas definitivas", a?.definitiveDrops || 0, "B", "records:bajas"],
      ["Alertas de calidad", a?.alerts || 0, "!", "records:alertas"], ["Atención agronómica", a?.agronomicAttention || 0, "CT", "records:agronomia"],
    ].map(([label, value, icon, drill]) => ({ label, value: formatNumber(value), icon, note: "Abrir detalle", drill }));
    $("#auditKpis").innerHTML = kpiHTML(metrics);
    const coverage = $("#auditCoverage");
    coverage.textContent = a?.coverageLabel || "Sin estimado";
    coverage.className = `status-chip ${state.estimate ? "info" : "neutral"}`;
    $("#reconciliation").innerHTML = `
      <div class="reconciliation-row"><span>Registros SIAGRI originales</span><strong>${formatNumber(a?.sourceRows || 0)}</strong></div>
      <div class="reconciliation-row minus"><span>− Sucuya · Código 16</span><strong>${formatNumber(a?.sucuyaExcluded || 0)}</strong></div>
      <div class="reconciliation-total"><span>= Registros válidos</span><strong>${formatNumber(a?.finalRows || 0)}</strong></div>`;
    const checks = [
      [Boolean(a) && (a.sucuyaExcluded >= 0) && state.dataset.records.every((r) => Number(r.cod) !== 16), "Sucuya = 0 en resultado"],
      [Boolean(a) && a.duplicates === 0, "Hac-Sue sin duplicados"],
      [Boolean(a) && state.dataset.records.every((r) => typeof r.cod === "string" && typeof r.suerte === "string"), "Identificadores como texto"],
      [Boolean(a) && state.dataset.records.filter((r) => r.zona === "5-Productores").length === a.producers, "Productores solo zona 5"],
      [Boolean(a) && state.dataset.records.every((r) => !["CA", "CV", "PR"].includes(r.tenencia)), "Tenencia traducida"],
      [Boolean(a) && state.dataset.records.find((r) => r.hacSue.toUpperCase() === "99347A")?.active === false, "Baja 99347A inactiva"],
      [Boolean(a) && (!state.estimate || a.coverageZones.length > 0), "Cobertura del estimado detectada"],
    ];
    const target = $("#criticalList");
    target.replaceChildren(...checks.map(([ok, label]) => {
      const item = document.createElement("div");
      item.className = `critical-item ${ok ? "" : "fail"}`;
      const icon = document.createElement("i");
      icon.textContent = ok ? "✓" : "!";
      const span = document.createElement("span");
      span.textContent = label;
      const badge = document.createElement("b");
      badge.textContent = ok ? "Aprobado" : "Pendiente";
      item.append(icon, span, badge);
      return item;
    }));
  }

  function renderComparison() {
    const comparison = state.comparison;
    $("#comparisonEmpty").hidden = Boolean(comparison);
    $("#comparisonContent").hidden = !comparison;
    const badge = $("#comparisonStatus");
    badge.textContent = comparison ? `${comparison.previousFile} · ${formatNumber(comparison.details.length)} cambios` : "Sin base anterior";
    badge.className = `status-chip ${comparison ? "info" : "neutral"}`;
    if (!comparison) return;
    const deltaSign = comparison.areaDelta > 0 ? "+" : "";
    $("#comparisonKpis").innerHTML = kpiHTML([
      { icon: "+", label: "Nuevas", value: formatNumber(comparison.newRecords), note: "No estaban en la base anterior", drill: "comparison:Nueva" },
      { icon: "−", label: "Retiradas", value: formatNumber(comparison.removedRecords), note: "Ya no aparecen en la actual", drill: "comparison:Retirada" },
      { icon: "Δ", label: "Modificadas", value: formatNumber(comparison.modifiedRecords), note: "Cambió al menos una variable", drill: "comparison:Modificada" },
      { icon: "=", label: "Sin cambios", value: formatNumber(comparison.unchangedRecords), note: "Coincidencia de variables clave", drill: "comparison:Sin cambios" },
      { icon: "ha", label: "Variación de área", value: `${deltaSign}${formatNumber(comparison.areaDelta, 2)}`, note: `${formatNumber(comparison.areaPrevious, 2)} → ${formatNumber(comparison.areaCurrent, 2)} ha`, drill: "comparison:area" },
    ]);
    const fieldTarget = $("#fieldChangeBars"); fieldTarget.replaceChildren();
    const entries = Object.entries(comparison.fieldCounts).sort((a, b) => b[1] - a[1]);
    const max = Math.max(...entries.map(([, count]) => count), 1);
    if (!entries.length) {
      const p = document.createElement("p"); p.className = "empty-copy"; p.textContent = "No se detectaron cambios de variables en las suertes coincidentes."; fieldTarget.appendChild(p);
    } else entries.forEach(([field, count]) => {
      const row = document.createElement("button"); row.type = "button"; row.className = "field-change-row"; row.dataset.drill = encodeURIComponent(`comparison-field:${field}`);
      const name = document.createElement("span"); name.textContent = field;
      const track = document.createElement("i"); const fill = document.createElement("b"); fill.style.width = `${Math.max(4, (count / max) * 100)}%`; track.appendChild(fill);
      const value = document.createElement("strong"); value.textContent = formatNumber(count);
      row.append(name, track, value); fieldTarget.appendChild(row);
    });
    renderComparisonTable();
  }

  function filteredComparisonDetails() {
    const query = E.fold($("#comparisonSearch").value);
    const type = $("#comparisonTypeFilter").value;
    const severity = $("#comparisonSeverityFilter").value;
    return (state.comparison?.details || []).filter((detail) => {
      const record = detail.current || detail.previous || {};
      const changeText = detail.changes.map((change) => `${change.label} ${change.before} ${change.after}`).join(" ");
      return (!type || detail.type === type) && (!severity || detail.severity === severity)
        && (!query || [detail.hacSue, record.hacienda, record.zona, detail.type, changeText].some((value) => E.fold(value).includes(query)));
    });
  }

  function renderComparisonTable() {
    const details = filteredComparisonDetails();
    $("#comparisonCount").textContent = `${formatNumber(details.length)} cambios`;
    const body = $("#comparisonBody"); body.replaceChildren();
    if (!details.length) return addEmptyRow(body, 7, state.comparison ? "No hay cambios con estos filtros." : "Carga una base anterior para comparar.");
    details.slice(0, 500).forEach((detail) => {
      const record = detail.current || detail.previous || {};
      const row = document.createElement("tr");
      addCell(row, detail.hacSue, true); addCell(row, record.hacienda); addCell(row, record.zona);
      const typeCell = document.createElement("td"); typeCell.appendChild(statusChip(detail.type)); row.appendChild(typeCell);
      const priorityCell = document.createElement("td"); priorityCell.appendChild(statusChip(detail.severity)); row.appendChild(priorityCell);
      addCell(row, detail.changes.length ? detail.changes.map((change) => change.label).join(", ") : detail.type === "Nueva" ? "Registro incorporado" : "Registro retirado");
      const actionCell = document.createElement("td"); const action = document.createElement("button"); action.type = "button"; action.className = "table-action"; action.dataset.compareDetail = detail.hacSue; action.textContent = "Antes → Ahora"; actionCell.appendChild(action); row.appendChild(actionCell);
      body.appendChild(row);
    });
  }

  function zones() {
    return [...new Set((state.dataset?.records || []).map((r) => r.zona).filter(Boolean))].sort();
  }

  function renderValidationFilters() {
    const status = $("#validationStatusFilter");
    const currentStatus = status.value;
    const detected = [...new Set((state.dataset?.records || []).map((r) => r.stateValidated || r.stateDetected).filter(Boolean))].sort();
    status.replaceChildren(new Option("Todos los estados", ""), ...detected.map((value) => new Option(value, value)));
    status.value = currentStatus;
    fillZoneSelect($("#validationZoneFilter"), "Todas las zonas");
    const options = C.STATUS_OPTIONS;
    $("#validationStatusFilter").dataset.options = JSON.stringify(options);
  }

  function fillZoneSelect(select, allLabel) {
    const value = select.value;
    select.replaceChildren(new Option(allLabel, ""), ...zones().map((zone) => new Option(zone, zone)));
    select.value = value;
  }

  function filteredValidationRecords() {
    const query = E.fold($("#validationSearch").value);
    const status = $("#validationStatusFilter").value;
    const zone = $("#validationZoneFilter").value;
    return (state.dataset?.records || []).filter((r) => {
      const recordStatus = r.stateValidated || r.stateDetected;
      const matchesQuery = !query || [r.hacSue, r.hacienda, r.suerte, r.destino].some((v) => E.fold(v).includes(query));
      return matchesQuery && (!status || recordStatus === status) && (!zone || r.zona === zone);
    });
  }

  function renderValidation() {
    const records = filteredValidationRecords();
    $("#validationCount").textContent = `${formatNumber(records.length)} registros`;
    const body = $("#validationBody");
    body.replaceChildren();
    if (!records.length) return addEmptyRow(body, 11, state.dataset ? "No hay coincidencias." : "Carga el SIAGRI para revisar las suertes.");
    records.slice(0, 250).forEach((record) => {
      const row = document.createElement("tr");
      addCell(row, record.hacSue, true);
      addCell(row, record.hacienda);
      addCell(row, record.suerte);
      addCell(row, record.zona);
      addCell(row, record.destino);
      addCell(row, formatNumber(record.area, 2));
      addCell(row, formatNumber(record.estimateArea, 2));
      addCell(row, formatNumber(record.tchEstimate, 2));
      const detectedCell = document.createElement("td");
      detectedCell.appendChild(statusChip(record.stateDetected));
      row.appendChild(detectedCell);
      const stateCell = document.createElement("td");
      const select = document.createElement("select");
      select.className = "validation-select";
      select.append(new Option("Usar estado detectado", ""), ...C.STATUS_OPTIONS.map((value) => new Option(value, value)));
      select.value = record.stateValidated || "";
      select.addEventListener("change", () => updateValidation(record.hacSue, select.value, record.observation));
      stateCell.appendChild(select);
      row.appendChild(stateCell);
      const noteCell = document.createElement("td");
      const input = document.createElement("input");
      input.className = "validation-note";
      input.maxLength = 280;
      input.placeholder = "Agregar observación";
      input.value = record.observation || "";
      input.addEventListener("change", () => updateValidation(record.hacSue, record.stateValidated, input.value, false));
      noteCell.appendChild(input);
      row.appendChild(noteCell);
      body.appendChild(row);
    });
  }

  function updateValidation(hacSue, status, observation, rebuild = true) {
    const cleanStatus = E.cleanText(status);
    const cleanObservation = E.cleanText(observation);
    if (!cleanStatus && !cleanObservation) delete state.manualValidations[hacSue];
    else state.manualValidations[hacSue] = { state: cleanStatus, observation: cleanObservation, updatedAt: new Date().toISOString() };
    saveValidations();
    if (rebuild) rebuildDataset();
    else {
      const record = state.dataset?.records.find((r) => r.hacSue === hacSue);
      if (record) record.observation = cleanObservation;
      toast("Observación guardada", `${hacSue} quedó actualizado en este navegador.`);
    }
  }

  function renderMasterFilters() {
    fillZoneSelect($("#masterZoneFilter"), "Todo CASUR");
  }

  function filteredMasterRecords() {
    const query = E.fold($("#masterSearch").value);
    const zone = $("#masterZoneFilter").value;
    return (state.dataset?.records || []).filter((r) => (!zone || r.zona === zone) && (!query || [r.hacSue, r.hacienda, r.suerte, r.zona, r.stateValidated || r.stateDetected].some((v) => E.fold(v).includes(query))));
  }

  function renderMaster() {
    const columns = C.MASTER_COLUMNS;
    const head = $("#masterHead");
    if (!head.childElementCount) {
      const row = document.createElement("tr");
      columns.forEach((column) => { const th = document.createElement("th"); th.textContent = column; row.appendChild(th); });
      head.appendChild(row);
    }
    const records = filteredMasterRecords();
    const pages = Math.max(1, Math.ceil(records.length / state.masterPageSize));
    state.masterPage = Math.min(Math.max(1, state.masterPage), pages);
    const start = (state.masterPage - 1) * state.masterPageSize;
    const body = $("#masterBody");
    body.replaceChildren();
    if (!records.length) addEmptyRow(body, columns.length, state.dataset ? "No hay coincidencias." : "Carga el SIAGRI para construir la vista maestra.");
    records.slice(start, start + state.masterPageSize).forEach((record) => {
      const rowData = E.toMasterRow(record);
      const row = document.createElement("tr");
      columns.forEach((column) => {
        let value = rowData[column];
        if (value instanceof Date) value = formatDate(value);
        else if (["Area", "Edad", "TCH_Z2526", "TCH_Estimado_Z2627", "Ton_Estimadas_Z2627", "Km", "Tch.Inic", "Tch.Act", "#_de_Riegos"].includes(column)) value = formatNumber(value, 2);
        addCell(row, value, ["Hac-Sue", "Cod", "Hacienda"].includes(column));
      });
      body.appendChild(row);
    });
    $("#masterCount").textContent = `${formatNumber(records.length)} registros`;
    $("#masterRowsBadge").textContent = `${formatNumber(state.dataset?.records.length || 0)} filas`;
    $("#pageIndicator").textContent = `Página ${state.masterPage} de ${pages}`;
    $("#prevPage").disabled = state.masterPage <= 1;
    $("#nextPage").disabled = state.masterPage >= pages;
  }

  function addCell(row, value, strong = false) {
    const cell = document.createElement("td");
    if (strong) {
      const node = document.createElement("strong");
      node.textContent = value === null || value === undefined || value === "" ? "—" : String(value);
      cell.appendChild(node);
    } else cell.textContent = value === null || value === undefined || value === "" ? "—" : String(value);
    row.appendChild(cell);
  }

  function addEmptyRow(body, columns, text) {
    const row = document.createElement("tr");
    row.className = "empty-row";
    const cell = document.createElement("td");
    cell.colSpan = columns;
    cell.textContent = text;
    row.appendChild(cell);
    body.appendChild(row);
  }

  function qualityAlertRecords() {
    return (state.dataset?.records || []).filter((record) => record.warnings.length || ["Requiere validación", "Renovación pendiente", "Pendiente de estimar TCH"].includes(record.stateValidated || record.stateDetected));
  }

  function drillRecords(key) {
    const records = state.dataset?.records || [];
    if (key === "records:all" || key === "audit:source") return records;
    if (key === "records:productores") return records.filter((record) => record.zona === "5-Productores");
    if (key === "records:estimados") return records.filter((record) => record.tchEstimate !== null);
    if (key === "records:semilla") return records.filter((record) => E.isSeed(record.destino) || (record.stateValidated || record.stateDetected) === "Semilla");
    if (key === "records:sin-cana") return records.filter((record) => (record.stateValidated || record.stateDetected) === "Sin caña / No cosecha Z26/27");
    if (key === "records:renovacion") return records.filter((record) => record.ageStatus === "Renovación pendiente");
    if (key === "records:alertas") return qualityAlertRecords();
    if (key === "records:agronomia") return records.filter((record) => record.agronomicFlags.length);
    if (key === "records:invalid-luck") return records.filter((record) => !record.suerte);
    if (key === "records:invalid-farm") return records.filter((record) => !record.cod);
    if (key === "records:missing-area") return records.filter((record) => record.area === null);
    if (key === "records:missing-estimate") return records.filter((record) => record.estimateInCoverage && !E.isSeed(record.destino) && record.tchEstimate === null);
    if (key === "records:bajas") return records.filter((record) => (record.stateValidated || record.stateDetected) === "Baja definitiva");
    if (key.startsWith("zone:")) return records.filter((record) => record.zona === key.slice(5));
    if (key.startsWith("flag:")) {
      const flag = E.fold(key.slice(5));
      return records.filter((record) => record.agronomicFlags.some((item) => E.fold(item).includes(flag)));
    }
    return [];
  }

  function drillTitle(key, count) {
    const titles = {
      "records:all": "Suertes del maestro", "audit:source": "Registros válidos del SIAGRI", "records:productores": "Suertes de Productores",
      "records:estimados": "Suertes con TCH estimado", "records:semilla": "Semilleros", "records:sin-cana": "Suertes sin caña",
      "records:renovacion": "Renovaciones pendientes", "records:alertas": "Alertas de calidad", "records:agronomia": "Atención agronómica",
      "records:invalid-luck": "Suertes inválidas", "records:invalid-farm": "Haciendas inválidas", "records:missing-area": "Áreas faltantes",
      "records:missing-estimate": "Estimados sin dato", "records:bajas": "Bajas definitivas",
    };
    if (key.startsWith("zone:")) return `Zona ${key.slice(5)}`;
    if (key.startsWith("flag:")) return key.slice(5);
    return titles[key] || `Detalle · ${formatNumber(count)} registros`;
  }

  function showDrill(title, eyebrow, summary, bodyNode, icon = "CT") {
    $("#drillTitle").textContent = title;
    $("#drillEyebrow").textContent = eyebrow;
    $("#drillSummary").textContent = summary;
    $("#drillIcon").textContent = icon;
    $("#drillBody").replaceChildren(bodyNode);
    $("#drillModal").hidden = false;
    document.body.classList.add("modal-open");
    $("#drillClose").focus();
  }

  function recordDrillTable(records, reasonKey = "") {
    const wrap = document.createElement("div"); wrap.className = "table-scroll drill-table-wrap";
    const table = document.createElement("table");
    table.innerHTML = "<thead><tr><th>Hac-Sue</th><th>Hacienda</th><th>Zona</th><th>Área</th><th>Tipo de riego</th><th>Edad</th><th>Corte</th><th>Motivo / estado</th></tr></thead>";
    const body = document.createElement("tbody");
    records.slice(0, 1000).forEach((record) => {
      const row = document.createElement("tr");
      addCell(row, record.hacSue, true); addCell(row, record.hacienda); addCell(row, record.zona); addCell(row, formatNumber(record.area, 2));
      addCell(row, record.tipoRiego); addCell(row, formatNumber(record.edad, 2)); addCell(row, record.corte);
      const reasons = reasonKey.includes("agron") || reasonKey.startsWith("flag:") ? record.agronomicFlags : record.warnings;
      addCell(row, reasons.length ? reasons.join(" · ") : (record.stateValidated || record.stateDetected));
      body.appendChild(row);
    });
    if (!records.length) addEmptyRow(body, 8, "No hay registros en este indicador.");
    table.appendChild(body); wrap.appendChild(table); return wrap;
  }

  function simpleDrillTable(headers, rows) {
    const wrap = document.createElement("div"); wrap.className = "table-scroll drill-table-wrap";
    const table = document.createElement("table"); const head = document.createElement("thead"); const headRow = document.createElement("tr");
    headers.forEach((header) => { const th = document.createElement("th"); th.textContent = header.label; headRow.appendChild(th); }); head.appendChild(headRow); table.appendChild(head);
    const body = document.createElement("tbody"); rows.forEach((item) => { const row = document.createElement("tr"); headers.forEach((header, index) => addCell(row, header.format ? header.format(item) : item[header.key], index === 0)); body.appendChild(row); });
    if (!rows.length) addEmptyRow(body, headers.length, "No hay registros en este indicador."); table.appendChild(body); wrap.appendChild(table); return wrap;
  }

  function openDrill(encodedKey) {
    const key = decodeURIComponent(encodedKey);
    if (key === "aggregate:haciendas") {
      const groups = new Map();
      (state.dataset?.records || []).forEach((record) => { if (!groups.has(record.cod)) groups.set(record.cod, []); groups.get(record.cod).push(record); });
      const rows = [...groups.entries()].map(([cod, records]) => ({ cod, hacienda: records[0]?.hacienda, suertes: records.length, area: records.reduce((sum, record) => sum + (record.area || 0), 0), zona: [...new Set(records.map((record) => record.zona))].join(", ") })).sort((a, b) => b.area - a.area);
      showDrill("Haciendas del maestro", "DRILL-DOWN · AGRUPACIÓN", `${formatNumber(rows.length)} haciendas · ${formatNumber(state.dataset?.audit.areaTotal || 0, 2)} ha`, simpleDrillTable([{ key: "cod", label: "Cod" }, { key: "hacienda", label: "Hacienda" }, { key: "zona", label: "Zona" }, { key: "suertes", label: "Suertes" }, { key: "area", label: "Área ha", format: (row) => formatNumber(row.area, 2) }], rows), "H"); return;
    }
    if (key === "aggregate:area") {
      const rows = state.dataset?.audit.zoneSummary || [];
      showDrill("Distribución del área CASUR", "DRILL-DOWN · TERRITORIO", `${formatNumber(state.dataset?.audit.areaTotal || 0, 2)} hectáreas conciliadas`, simpleDrillTable([{ key: "zona", label: "Zona" }, { key: "area", label: "Área ha", format: (row) => formatNumber(row.area, 2) }, { key: "percent", label: "% CASUR", format: (row) => `${formatNumber(row.percent, 1)}%` }, { key: "suertes", label: "Suertes" }, { key: "haciendas", label: "Haciendas" }, { key: "edadPromedio", label: "Edad pond.", format: (row) => formatNumber(row.edadPromedio, 2) }, { key: "tchPonderado", label: "TCH pond.", format: (row) => formatNumber(row.tchPonderado, 2) }], rows), "ha"); return;
    }
    if (key === "audit:sucuya") {
      const rows = state.dataset?.source.excluded || [];
      showDrill("Sucuya excluida", "AUDITORÍA · CÓDIGO 16", `${formatNumber(rows.length)} filas excluidas antes de construir el maestro`, simpleDrillTable([{ key: "row", label: "Fila fuente" }, { key: "cod", label: "Cod" }, { key: "suerte", label: "Suerte" }, { key: "hacSue", label: "Hac-Sue" }], rows), "−"); return;
    }
    if (key === "audit:dates") {
      const rows = state.dataset?.source.invalidDates || [];
      showDrill("Fechas inválidas", "AUDITORÍA · CALENDARIO", `${formatNumber(rows.length)} celdas no pudieron interpretarse como fecha`, simpleDrillTable([{ key: "row", label: "Fila" }, { key: "hacSue", label: "Hac-Sue" }, { key: "field", label: "Campo" }, { key: "value", label: "Valor original" }], rows), "F"); return;
    }
    if (key === "audit:duplicates") {
      const rows = state.dataset?.audit.duplicateDetail || [];
      showDrill("Hac-Sue duplicados", "AUDITORÍA · LLAVE ÚNICA", `${formatNumber(rows.length)} llaves repetidas`, simpleDrillTable([{ key: "key", label: "Hac-Sue" }, { key: "count", label: "Repeticiones" }], rows), "D"); return;
    }
    if (key.startsWith("comparison-field:")) {
      const field = key.slice("comparison-field:".length);
      const rows = (state.comparison?.details || []).filter((detail) => detail.changes.some((change) => change.label === field));
      showComparisonDrill(`${field} · cambios`, rows); return;
    }
    if (key.startsWith("comparison:")) {
      const type = key.slice("comparison:".length);
      if (type === "area") {
        const c = state.comparison; const rows = [{ label: "Anterior", area: c?.areaPrevious }, { label: "Actual", area: c?.areaCurrent }, { label: "Variación", area: c?.areaDelta }];
        showDrill("Variación total de área", "COMPARATIVO · HECTÁREAS", `${formatNumber(c?.areaPrevious || 0, 2)} → ${formatNumber(c?.areaCurrent || 0, 2)} ha`, simpleDrillTable([{ key: "label", label: "Base" }, { key: "area", label: "Área ha", format: (row) => formatNumber(row.area, 2) }], rows), "ha"); return;
      }
      const rows = type === "Sin cambios" ? (state.comparison?.unchangedDetails || []) : (state.comparison?.details || []).filter((detail) => detail.type === type);
      showComparisonDrill(type, rows); return;
    }
    const records = drillRecords(key);
    const area = records.reduce((sum, record) => sum + (record.area || 0), 0);
    showDrill(drillTitle(key, records.length), "DETALLE DE SUERTES · DRILL-DOWN", `${formatNumber(records.length)} suertes · ${formatNumber(area, 2)} ha`, recordDrillTable(records, key), key.startsWith("zone:") ? "ha" : "CT");
  }

  function showComparisonDrill(title, details) {
    const rows = details.map((detail) => ({ hacSue: detail.hacSue, hacienda: (detail.current || detail.previous || {}).hacienda, zona: (detail.current || detail.previous || {}).zona, tipo: detail.type, prioridad: detail.severity, cambios: detail.changes.map((change) => `${change.label}: ${change.before} → ${change.after}`).join(" · ") || detail.type }));
    showDrill(title, "COMPARATIVO · ANTES → AHORA", `${formatNumber(rows.length)} suertes`, simpleDrillTable([{ key: "hacSue", label: "Hac-Sue" }, { key: "hacienda", label: "Hacienda" }, { key: "zona", label: "Zona" }, { key: "tipo", label: "Tipo" }, { key: "prioridad", label: "Prioridad" }, { key: "cambios", label: "Cambios" }], rows), "⇄");
  }

  function openComparisonDetail(hacSue) {
    const detail = [...(state.comparison?.details || []), ...(state.comparison?.unchangedDetails || [])].find((item) => item.hacSue === hacSue);
    if (!detail) return;
    const changes = detail.changes.length ? detail.changes : [{ label: "Registro", before: detail.previous ? "Presente" : "—", after: detail.current ? "Presente" : "—" }];
    showDrill(`${hacSue} · ${detail.type}`, "CAMBIO POR SUERTE", `${(detail.current || detail.previous || {}).hacienda || "Sin hacienda"} · prioridad ${detail.severity}`, simpleDrillTable([{ key: "label", label: "Variable" }, { key: "before", label: "Anterior" }, { key: "after", label: "Actual" }], changes), "⇄");
  }

  function closeDrill() {
    $("#drillModal").hidden = true;
    document.body.classList.remove("modal-open");
  }

  function renderExport() {
    const ready = Boolean(state.dataset?.audit.criticalPass);
    $("#exportExcelButton").disabled = !ready;
    $("#exportJsonButton").disabled = !ready;
    const status = $("#exportStatus");
    status.textContent = ready ? "Listo" : "Pendiente";
    status.className = `status-chip ${ready ? "success" : "warning"}`;
    $("#exportCheckOrb").textContent = ready ? "✓" : "!";
    $("#exportCheckTitle").textContent = ready ? "Validaciones críticas aprobadas" : "Carga y valida el SIAGRI";
    $("#exportCheckText").textContent = ready
      ? `${formatNumber(state.dataset.audit.finalRows)} registros listos. Las alertas no críticas permanecen visibles para revisión.`
      : "Las salidas se habilitarán cuando Sucuya sea cero y no existan Hac-Sue duplicados.";
  }

  function sourceMetadata() {
    return {
      siagriFile: state.siagri?.file.name || null,
      siagriSheet: state.siagri?.selectedSheet || null,
      estimateFile: state.estimate?.file.name || null,
      estimateSheet: state.estimate?.selectedSheet || null,
      estimateIncluded: Boolean(state.estimate),
      previousFile: state.previous?.file.name || null,
      previousSheet: state.previous?.selectedSheet || null,
      comparison: state.comparison ? {
        newRecords: state.comparison.newRecords,
        removedRecords: state.comparison.removedRecords,
        modifiedRecords: state.comparison.modifiedRecords,
        unchangedRecords: state.comparison.unchangedRecords,
        areaDelta: state.comparison.areaDelta,
      } : null,
    };
  }

  function runTests() {
    const results = E.selfTests();
    const target = $("#testResults");
    target.replaceChildren();
    const summary = document.createElement("p");
    summary.textContent = `${results.passed} de ${results.total} pruebas aprobadas.`;
    target.appendChild(summary);
    results.tests.forEach((test) => {
      const row = document.createElement("div");
      row.className = `test-row ${test.pass ? "" : "fail"}`;
      const icon = document.createElement("i"); icon.textContent = test.pass ? "✓" : "!";
      const span = document.createElement("span"); span.textContent = test.name;
      row.append(icon, span); target.appendChild(row);
    });
    toast(results.passed === results.total ? "Pruebas aprobadas" : "Hay pruebas pendientes", `${results.passed}/${results.total} reglas correctas.`, results.passed === results.total ? "success" : "error");
  }

  function bindEvents() {
    $$(".nav-item").forEach((button) => button.addEventListener("click", () => setPage(button.dataset.page)));
    $$('[data-page-jump]').forEach((button) => button.addEventListener("click", () => setPage(button.dataset.pageJump)));
    $$('[data-page-link]').forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); setPage(link.dataset.pageLink); }));
    $("#menuToggle").addEventListener("click", () => $("#sideNav").classList.toggle("open"));
    $$('[data-file-trigger]').forEach((button) => button.addEventListener("click", () => $(`#${button.dataset.fileTrigger}`).click()));
    $("#siagriInput").addEventListener("change", (event) => handleFile(event.target.files[0], "siagri"));
    $("#estimateInput").addEventListener("change", (event) => handleFile(event.target.files[0], "estimate"));
    $("#previousInput").addEventListener("change", (event) => handleFile(event.target.files[0], "previous"));
    $$('[data-drop-zone]').forEach((zone) => {
      ["dragenter", "dragover"].forEach((name) => zone.addEventListener(name, (event) => { event.preventDefault(); zone.classList.add("dragging"); }));
      ["dragleave", "drop"].forEach((name) => zone.addEventListener(name, (event) => { event.preventDefault(); zone.classList.remove("dragging"); }));
      zone.addEventListener("drop", (event) => handleFile(event.dataTransfer.files[0], zone.dataset.dropZone));
    });
    $("#siagriSheetSelect").addEventListener("change", (event) => { if (state.siagri) { state.siagri.selectedSheet = event.target.value; rebuildDataset(); } });
    $("#estimateSheetSelect").addEventListener("change", (event) => { if (state.estimate) { state.estimate.selectedSheet = event.target.value; rebuildDataset(); } });
    $("#previousSheetSelect").addEventListener("change", (event) => { if (state.previous) { state.previous.selectedSheet = event.target.value; rebuildComparison(); } });
    ["validationSearch", "validationStatusFilter", "validationZoneFilter"].forEach((id) => $(`#${id}`).addEventListener(id === "validationSearch" ? "input" : "change", renderValidation));
    $("#clearFiltersButton").addEventListener("click", () => { $("#validationSearch").value = ""; $("#validationStatusFilter").value = ""; $("#validationZoneFilter").value = ""; renderValidation(); });
    $("#comparisonSearch").addEventListener("input", renderComparisonTable);
    $("#comparisonTypeFilter").addEventListener("change", renderComparisonTable);
    $("#comparisonSeverityFilter").addEventListener("change", renderComparisonTable);
    $("#masterSearch").addEventListener("input", () => { state.masterPage = 1; renderMaster(); });
    $("#masterZoneFilter").addEventListener("change", () => { state.masterPage = 1; renderMaster(); });
    $("#prevPage").addEventListener("click", () => { state.masterPage -= 1; renderMaster(); });
    $("#nextPage").addEventListener("click", () => { state.masterPage += 1; renderMaster(); });
    $("#runTestsButton").addEventListener("click", runTests);
    document.addEventListener("click", (event) => {
      const drill = event.target.closest("[data-drill]");
      if (drill) openDrill(drill.dataset.drill);
      const comparisonDetail = event.target.closest("[data-compare-detail]");
      if (comparisonDetail) openComparisonDetail(comparisonDetail.dataset.compareDetail);
    });
    $("#drillClose").addEventListener("click", closeDrill);
    $("#drillModal").addEventListener("mousedown", (event) => { if (event.target === $("#drillModal")) closeDrill(); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !$("#drillModal").hidden) closeDrill(); });
    $("#exportExcelButton").addEventListener("click", async () => {
      loading(true, "Generando Excel profesional…");
      try { const name = await E.exportExcel(state.dataset); toast("Excel generado", name); }
      catch (error) { console.error(error); toast("No se pudo exportar", error.message, "error"); }
      finally { loading(false); }
    });
    $("#exportJsonButton").addEventListener("click", () => {
      try { const name = E.exportJson(state.dataset, sourceMetadata()); toast("JSON generado", name); }
      catch (error) { console.error(error); toast("No se pudo exportar", error.message, "error"); }
    });
    window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); state.installPrompt = event; $("#installButton").hidden = false; });
    $("#installButton").addEventListener("click", async () => {
      if (!state.installPrompt) return;
      state.installPrompt.prompt();
      await state.installPrompt.userChoice;
      state.installPrompt = null;
      $("#installButton").hidden = true;
    });
  }

  async function initialize() {
    bindEvents();
    C.STATUS_OPTIONS.forEach((value) => $("#validationStatusFilter").appendChild(new Option(value, value)));
    renderAll();
    runTests();
    // [INTEGRACIÓN App Maestra] Service Worker propio DESACTIVADO: dentro de
    // "Negocios de Caña CASUR" solo debe existir el SW raíz. El repositorio
    // fuente standalone conserva su SW; aquí no se registra para evitar
    // conflictos de caché entre módulos (regla crítica de la App Maestra).
    // if ("serviceWorker" in navigator && location.protocol !== "file:") {
    //   try { await navigator.serviceWorker.register("./service-worker.js"); }
    //   catch (error) { console.warn("Service worker no disponible", error); }
    // }
  }

  initialize();
})();
