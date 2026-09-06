(function () {
  "use strict";

  const ESTIMATE_DATE = "2026-07-17";
  const PASSWORD_HASH = "6315700c5446173c02844f5fcc514d3b52e8da0ad4b31f6126049d2d8709ad34";
  const UNLOCK_MINUTES = 30;
  const $ = (id) => document.getElementById(id);
  const nf = new Intl.NumberFormat("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf0 = new Intl.NumberFormat("es-NI", { maximumFractionDigits: 0 });
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[char]));
  const text = (value) => String(value ?? "").trim();
  const normal = (value) => text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "");
  const finite = (value) => {
    if (value === null || value === undefined || text(value) === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const round = (value, digits = 2) => {
    const number = finite(value);
    if (number === null) return null;
    const factor = 10 ** digits;
    return Math.round(number * factor) / factor;
  };
  const fmt = (value, suffix = "") => finite(value) === null ? "—" : `${nf.format(Number(value))}${suffix}`;
  const formatDate = (value) => {
    if (!value) return "—";
    const parts = String(value).slice(0, 10).split("-");
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(value);
  };
  const weighted = (rows, field) => {
    let numerator = 0;
    let denominator = 0;
    (rows || []).forEach((row) => {
      const area = finite(row.area);
      const value = finite(row[field]);
      if (area > 0 && value !== null) { numerator += area * value; denominator += area; }
    });
    return denominator ? round(numerator / denominator) : null;
  };
  const dominant = (rows, field) => {
    const totals = new Map();
    (rows || []).forEach((row) => {
      const key = text(row[field]) || "Sin dato";
      totals.set(key, (totals.get(key) || 0) + (finite(row.area) || 0));
    });
    return [...totals].sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
  };
  const estimateSummary = (rows) => {
    const all = rows || [];
    const covered = all.filter((row) => finite(row.tchEst2627) !== null);
    const totalArea = all.reduce((sum, row) => sum + (finite(row.area) || 0), 0);
    const area = covered.reduce((sum, row) => sum + (finite(row.area) || 0), 0);
    return {
      tchEst2627: weighted(covered, "tchEst2627"),
      tonEst2627: round(covered.reduce((sum, row) => sum + (finite(row.tonEst2627) ?? ((finite(row.area) || 0) * (finite(row.tchEst2627) || 0))), 0)) || 0,
      areaEstimado2627: round(area) || 0,
      suertesEstimado2627: covered.length,
      coberturaEstimadoAreaPct: totalArea ? round(area / totalArea * 100) : 0,
      coberturaEstimadoSuertesPct: all.length ? round(covered.length / all.length * 100) : 0,
    };
  };
  const groupRows = (rows, field) => {
    const groups = new Map();
    (rows || []).forEach((row) => {
      const key = text(row[field]) || "Sin dato";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    return [...groups].map(([key, values]) => ({
      key,
      area: round(values.reduce((sum, row) => sum + (finite(row.area) || 0), 0)) || 0,
      suertes: values.length,
      tch: weighted(values, "tch"),
      ...estimateSummary(values),
    })).sort((a, b) => b.area - a.area);
  };

  function allCronoRecords(data = window.CRONO_DATA) {
    return (data?.producers || []).flatMap((producer) => (producer.details || []).map((row) => ({
      ...row, code: text(row.code || producer.code), name: text(row.name || producer.name),
    })));
  }

  function buildCronoData(records, source = "Edición manual interna") {
    const farms = new Map();
    records.forEach((record) => {
      const key = text(record.code) || text(record.name) || "SIN_CODIGO";
      if (!farms.has(key)) farms.set(key, { code: text(record.code), name: text(record.name) || "Sin nombre", details: [] });
      farms.get(key).details.push(record);
    });
    const producers = [...farms.values()].map((farm) => {
      const rows = farm.details;
      const summary = {
        code: farm.code, name: farm.name, zone: dominant(rows, "zona"), tenencia: dominant(rows, "tenencia"),
        destino: dominant(rows, "destino"), tipoCultivo: dominant(rows, "tipoCultivo"),
        area: round(rows.reduce((sum, row) => sum + (finite(row.area) || 0), 0)) || 0,
        tch: weighted(rows, "tch"), suertes: rows.length,
        areaBajoTch: 0, areaMedioTch: 0, areaAltoTch: 0, areaSecano: 0, areaRiego: 0,
        areaSinDatoRiego: 0, suertesCriticas: 0,
        riegoDom: dominant(rows, "tipoRiego"), variedadDom: dominant(rows, "variedad"), texturaDom: dominant(rows, "textura"),
        ...estimateSummary(rows), details: rows,
      };
      rows.forEach((row) => {
        const area = finite(row.area) || 0;
        const tch = finite(row.tch);
        if (tch !== null && tch > 0 && tch < 60) { summary.areaBajoTch += area; summary.suertesCriticas += 1; }
        else if (tch !== null && tch < 70) summary.areaMedioTch += area;
        else if (tch !== null) summary.areaAltoTch += area;
        const irrigation = normal(row.tipoRiego);
        if (!irrigation) summary.areaSinDatoRiego += area;
        else if (irrigation.includes("secano")) summary.areaSecano += area;
        else summary.areaRiego += area;
      });
      ["areaBajoTch", "areaMedioTch", "areaAltoTch", "areaSecano", "areaRiego", "areaSinDatoRiego"]
        .forEach((key) => { summary[key] = round(summary[key]) || 0; });
      return summary;
    }).sort((a, b) => a.name.localeCompare(b.name, "es"));
    const rows = producers.flatMap((producer) => producer.details);
    const totalArea = round(rows.reduce((sum, row) => sum + (finite(row.area) || 0), 0)) || 0;
    const global = {
      area: totalArea, tch: weighted(rows, "tch"), suertes: rows.length, productores: producers.length,
      areaBajoTch: round(rows.filter((row) => finite(row.tch) > 0 && finite(row.tch) < 60).reduce((sum, row) => sum + (finite(row.area) || 0), 0)) || 0,
      areaMedioTch: round(rows.filter((row) => finite(row.tch) >= 60 && finite(row.tch) < 70).reduce((sum, row) => sum + (finite(row.area) || 0), 0)) || 0,
      areaAltoTch: round(rows.filter((row) => finite(row.tch) >= 70).reduce((sum, row) => sum + (finite(row.area) || 0), 0)) || 0,
      areaSecano: round(rows.filter((row) => normal(row.tipoRiego).includes("secano")).reduce((sum, row) => sum + (finite(row.area) || 0), 0)) || 0,
      areaRiego: round(rows.filter((row) => text(row.tipoRiego) && !normal(row.tipoRiego).includes("secano")).reduce((sum, row) => sum + (finite(row.area) || 0), 0)) || 0,
      ...estimateSummary(rows),
    };
    const priorMeta = window.CRONO_DATA?.meta || {};
    return {
      meta: { ...priorMeta, source, rows: rows.length, rawRows: rows.length, productores: producers.length,
        generated: new Date().toISOString().slice(0, 10), tchEst2627EffectiveDate: ESTIMATE_DATE, manualChanges: true },
      global,
      options: producers.map((producer) => ({ code: producer.code, name: producer.name, zone: producer.zone,
        area: producer.area, tch: producer.tch, tchEst2627: producer.tchEst2627, label: `${producer.code} · ${producer.name}` })),
      producers,
      groups: { zona: groupRows(rows, "zona"), riego: groupRows(rows, "tipoRiego"), tenencia: groupRows(rows, "tenencia"),
        tipoCultivo: groupRows(rows, "tipoCultivo"), destino: groupRows(rows, "destino"), variedad: groupRows(rows, "variedad"),
        textura: groupRows(rows, "textura"), estado: groupRows(rows, "estado") },
    };
  }

  function replaceObject(target, source) {
    Object.keys(target || {}).forEach((key) => { delete target[key]; });
    Object.assign(target, source);
  }

  function applyCronoData(data, message) {
    if (!window.CRONO_DATA) window.CRONO_DATA = {};
    replaceObject(window.CRONO_DATA, data);
    window.__CRONO_ZONE_ROWS = null;
    window.CASUR_ADMIN_DATA = window.CRONO_DATA;
    refreshCronoEditorOptions();
    if (typeof window.renderCronoHome === "function") window.renderCronoHome();
    addLog(message || "Cronológico actualizado en memoria.");
  }

  function currentCronoScope() {
    const data = window.CRONO_DATA || {};
    const selectValue = text($("cronoProducerSelect")?.value);
    const query = text($("cronoQ")?.value);
    const code = selectValue || query.split(" · ")[0];
    const producer = (data.producers || []).find((item) => text(item.code) === code);
    if (!producer) return { rows: allCronoRecords(data), summary: data.global || {}, producer: null };
    const table = $("cronoContent")?.querySelector("table");
    if (table && table.tBodies[0]?.rows.length === 1) {
      const lotCode = text(table.tBodies[0].rows[0].cells[0]?.querySelector("b")?.textContent);
      const found = (producer.details || []).filter((row) => [text(row.codLote), `${producer.code}${row.suerte}`].includes(lotCode));
      if (found.length) return { rows: found, summary: estimateSummary(found), producer };
    }
    return { rows: producer.details || [], summary: { ...producer, ...estimateSummary(producer.details || []) }, producer };
  }

  function estimateKpi(label, value, sub) {
    return `<div class="kpi casur-estimate-kpi" data-casur-estimate="1"><span class="label">${esc(label)}</span><strong>${value}</strong><em>${esc(sub)}</em></div>`;
  }

  let enhancing = false;
  function enhanceCronoView() {
    if (enhancing) return;
    const content = $("cronoContent");
    if (!content || !content.dataset.ready) return;
    enhancing = true;
    try {
      const scope = currentCronoScope();
      const summary = scope.summary || estimateSummary(scope.rows);
      const kpis = content.querySelector(".kpis");
      if (kpis && !kpis.querySelector("[data-casur-estimate]")) {
        kpis.insertAdjacentHTML("beforeend",
          estimateKpi("TCH estimado 26/27", fmt(summary.tchEst2627), finite(summary.tchEst2627) === null ? "Sin estimado oficial" : "Estimado oficial") +
          estimateKpi("Ton. estimadas 26/27", fmt(summary.tonEst2627, " t"), `${nf0.format(summary.suertesEstimado2627 || 0)} suertes con estimado`));
      }
      const actions = content.querySelector(".ficha-actions");
      if (actions && !actions.querySelector(".casur-estimate-badge")) {
        const hasEstimate = finite(summary.tchEst2627) !== null;
        actions.insertAdjacentHTML("afterbegin", `<span class="casur-estimate-badge ${hasEstimate ? "" : "is-empty"}">26/27: ${fmt(summary.tchEst2627)} TCH${hasEstimate ? ` · ${formatDate(ESTIMATE_DATE)}` : " · sin estimado"}</span>`);
      }
      content.querySelectorAll("#cronoPrintPanel table").forEach((table) => {
        if (table.dataset.casurEstimate === "1") return;
        const header = table.tHead?.rows?.[0];
        if (!header || header.cells.length < 3 || !normal(header.cells[2].textContent).includes("tch")) return;
        const estHeader = document.createElement("th"); estHeader.textContent = "TCH est. 26/27";
        const tonHeader = document.createElement("th"); tonHeader.textContent = "Ton. est. 26/27";
        header.cells[2].after(tonHeader); header.cells[2].after(estHeader);
        const oldState = [...header.cells].find((cell) => normal(cell.textContent) === "estado");
        if (oldState) oldState.textContent = "Estado TCH 25/26";
        const masterState = document.createElement("th"); masterState.textContent = "Estado maestro";
        const noteHeader = document.createElement("th"); noteHeader.textContent = "Observación";
        header.append(masterState, noteHeader);
        [...(table.tBodies[0]?.rows || [])].forEach((row, index) => {
          const lotCode = text(row.cells[0]?.querySelector("b")?.textContent);
          const record = scope.rows.find((item) => [text(item.codLote), `${scope.producer?.code || item.code}${item.suerte}`].includes(lotCode)) || scope.rows[index];
          const estimate = finite(record?.tchEst2627);
          const estCell = document.createElement("td"); estCell.className = estimate === null ? "casur-no-estimate" : "casur-estimate-cell";
          estCell.textContent = estimate === null ? "—" : fmt(estimate);
          const tonCell = document.createElement("td"); tonCell.className = estimate === null ? "casur-no-estimate" : "casur-estimate-cell";
          tonCell.textContent = estimate === null ? "—" : fmt(record.tonEst2627 ?? ((finite(record.area) || 0) * estimate), " t");
          row.cells[2].after(tonCell); row.cells[2].after(estCell);
          const stateCell = document.createElement("td"); stateCell.className = "casur-master-state"; stateCell.textContent = text(record?.estado) || "—";
          const noteCell = document.createElement("td"); noteCell.className = "casur-master-note"; noteCell.textContent = text(record?.observacion) || "—";
          row.append(stateCell, noteCell);
        });
        table.dataset.casurEstimate = "1";
      });
    } finally { enhancing = false; }
  }

  function installCronoObserver() {
    const content = $("cronoContent");
    if (!content) return;
    new MutationObserver(() => queueMicrotask(enhanceCronoView)).observe(content, { childList: true, subtree: true });
    enhanceCronoView();
  }

  function releaseStrip() {
    const section = $("cronoSection")?.querySelector(".accordion-body");
    if (!section || section.querySelector(".casur-release-strip")) return;
    const release = window.CASUR_RELEASE || {};
    section.insertAdjacentHTML("afterbegin", `<div class="casur-release-strip"><span><i class="casur-release-dot"></i><b>Datos compartidos</b> · versión ${esc(release.version || "integrada")}</span><span class="casur-sync-pill" id="casurSyncPill">Actualización automática al abrir</span></div>`);
  }

  async function sha256(value) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  function unlockValid() {
    const stamp = Number(sessionStorage.getItem("casurAdminUnlockedAt"));
    return Number.isFinite(stamp) && Date.now() - stamp < UNLOCK_MINUTES * 60 * 1000;
  }
  function touchUnlock() { if (unlockValid()) sessionStorage.setItem("casurAdminUnlockedAt", String(Date.now())); }
  function updateAdminLauncher(unlocked = unlockValid(), expanded = false) {
    const launcher = $("masterAdminLauncher");
    const state = $("masterAdminLauncherState");
    if (!launcher) return;
    launcher.classList.toggle("is-locked", !unlocked);
    launcher.classList.toggle("is-unlocked", unlocked);
    launcher.setAttribute("aria-expanded", expanded ? "true" : "false");
    launcher.setAttribute("aria-label", unlocked ? "Abrir Centro Maestro desbloqueado" : "Abrir módulo técnico protegido");
    if (state) state.textContent = unlocked ? "Acceso desbloqueado" : "Acceso protegido";
  }
  function ensureLockDialog() {
    if ($("casurLockLayer")) return;
    document.body.insertAdjacentHTML("beforeend", `<div class="casur-lock-layer" id="casurLockLayer" hidden role="dialog" aria-modal="true" aria-labelledby="casurLockTitle"><div class="casur-lock-card"><div class="casur-lock-accent"></div><div class="casur-lock-body"><div class="casur-lock-icon">🔐</div><h2 id="casurLockTitle">Centro Maestro</h2><p>Acceso operativo para actualización, edición y publicación de datos.</p><form id="casurLockForm"><input id="casurLockPassword" type="password" inputmode="numeric" autocomplete="current-password" maxlength="12" aria-label="Contraseña"><div class="casur-lock-error" id="casurLockError"></div><div class="casur-lock-actions"><button class="casur-btn neutral" type="button" id="casurLockCancel">Cancelar</button><button class="casur-btn" type="submit">Desbloquear</button></div></form></div></div></div>`);
    $("casurLockCancel").addEventListener("click", closeLock);
    $("casurLockLayer").addEventListener("click", (event) => { if (event.target === $("casurLockLayer")) closeLock(); });
    $("casurLockForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = $("casurLockPassword");
      if (await sha256(input.value) !== PASSWORD_HASH) {
        $("casurLockError").textContent = "Contraseña incorrecta.";
        input.select();
        return;
      }
      sessionStorage.setItem("casurAdminUnlockedAt", String(Date.now()));
      updateAdminLauncher(true, false);
      $("casurLockError").textContent = "";
      closeLock();
      openAdmin();
    });
  }
  function closeLock() { const layer = $("casurLockLayer"); if (layer) layer.hidden = true; }
  function requestAdminUnlock() {
    ensureLockDialog();
    $("casurLockLayer").hidden = false;
    $("casurLockPassword").value = "";
    setTimeout(() => $("casurLockPassword")?.focus(), 40);
  }
  function openAdmin(button) {
    if (!unlockValid()) { updateAdminLauncher(false, false); requestAdminUnlock(); return; }
    touchUnlock();
    document.querySelectorAll(".navbtn").forEach((item) => item.classList.remove("active"));
    if (button) button.classList.add("active");
    const section = $("masterUpdateSection");
    if (section) { section.classList.remove("is-locked"); section.open = true; updateAdminLauncher(true, true); section.scrollIntoView({ behavior: "smooth", block: "start" }); }
    if (typeof window.updateState === "function") window.updateState("Centro Maestro · Programador", "Actualización protegida");
  }

  let selectedCronoKey = "";
  let selectedHistoryLot = null;
  const changes = [];
  function addLog(message) {
    changes.unshift(`${new Date().toLocaleTimeString("es-NI", { hour: "2-digit", minute: "2-digit" })} · ${message}`);
    const log = $("casurChangeLog");
    if (log) log.innerHTML = changes.slice(0, 20).map((item) => `<div>${esc(item)}</div>`).join("");
  }
  function cronoKey(record) { return `${text(record.code)}||${text(record.suerte).toUpperCase()}`; }
  function refreshCronoEditorOptions() {
    const list = $("casurCronoOptions");
    if (!list) return;
    list.innerHTML = allCronoRecords().map((row) => `<option value="${esc(`${row.code} · ${row.suerte} · ${row.name}`)}"></option>`).join("");
  }
  function findCronoEditorRecord(value) {
    const raw = text(value);
    const [code, lot] = raw.split(" · ");
    return allCronoRecords().find((row) => text(row.code) === text(code) && text(row.suerte).toUpperCase() === text(lot).toUpperCase()) ||
      allCronoRecords().find((row) => cronoKey(row) === raw);
  }
  function setValue(id, value) { const element = $(id); if (element) element.value = value ?? ""; }
  function loadCronoEditor() {
    const record = findCronoEditorRecord($("casurCronoSearch")?.value);
    if (!record) { alert("Seleccione una suerte válida de la lista."); return; }
    selectedCronoKey = cronoKey(record);
    setValue("editCode", record.code); setValue("editName", record.name); setValue("editLot", record.suerte);
    setValue("editArea", record.area); setValue("editTch", record.tch); setValue("editTchEst", record.tchEst2627);
    setValue("editTchDate", record.tchEst2627Fecha || ESTIMATE_DATE); setValue("editZone", record.zona);
    setValue("editVariety", record.variedad); setValue("editCut", record.corte); setValue("editIrrigation", record.tipoRiego);
    setValue("editState", record.estado); setValue("editObservation", record.observacion);
  }
  function newCronoEditor() {
    selectedCronoKey = "";
    ["casurCronoSearch", "editCode", "editName", "editLot", "editArea", "editTch", "editTchEst", "editZone", "editVariety", "editCut", "editIrrigation", "editState", "editObservation"].forEach((id) => setValue(id, ""));
    setValue("editTchDate", ESTIMATE_DATE);
  }
  function saveCronoEditor() {
    const records = allCronoRecords();
    const code = text($("editCode")?.value); const name = text($("editName")?.value); const suerte = text($("editLot")?.value);
    const area = finite($("editArea")?.value);
    if (!code || !name || !suerte || !(area > 0)) { alert("Código, hacienda, suerte y área mayor que cero son obligatorios."); return; }
    const nextKey = `${code}||${suerte.toUpperCase()}`;
    const duplicate = records.find((row) => cronoKey(row) === nextKey && cronoKey(row) !== selectedCronoKey);
    if (duplicate) { alert("Ya existe esa combinación de hacienda y suerte."); return; }
    const estimate = finite($("editTchEst")?.value);
    const record = records.find((row) => cronoKey(row) === selectedCronoKey) || {};
    Object.assign(record, {
      code, name, suerte, codLote: text(record.codLote) || `${code}${suerte}`, area: round(area), tch: round(finite($("editTch")?.value)),
      tchEst2627: round(estimate), tonEst2627: estimate === null ? null : round(area * estimate),
      tchEst2627Fecha: estimate === null ? null : (text($("editTchDate")?.value) || ESTIMATE_DATE),
      tchEst2627Fuente: estimate === null ? null : "Edición manual Centro Maestro",
      zona: text($("editZone")?.value) || "Sin zona", variedad: text($("editVariety")?.value) || "—",
      corte: text($("editCut")?.value) || "—", tipoRiego: text($("editIrrigation")?.value) || "—",
      estado: text($("editState")?.value) || "—", observacion: text($("editObservation")?.value),
    });
    if (!selectedCronoKey) records.push(record);
    const wasExisting = Boolean(selectedCronoKey);
    selectedCronoKey = nextKey;
    applyCronoData(buildCronoData(records), `${wasExisting ? "Guardada" : "Agregada"} ${code}-${suerte}.`);
    $("casurCronoSearch").value = `${code} · ${suerte} · ${name}`;
  }
  function deleteCronoEditor() {
    if (!selectedCronoKey) { alert("Primero seleccione una suerte existente."); return; }
    const records = allCronoRecords();
    const record = records.find((row) => cronoKey(row) === selectedCronoKey);
    if (!record || !confirm(`¿Eliminar ${record.code}-${record.suerte} del cronológico?`)) return;
    applyCronoData(buildCronoData(records.filter((row) => cronoKey(row) !== selectedCronoKey)), `Eliminada ${record.code}-${record.suerte}.`);
    newCronoEditor();
  }

  function historyLots() { return window.APP_DATA?.lotCompact || []; }
  function refreshHistoryOptions() {
    const list = $("casurHistoryOptions"); if (!list) return;
    list.innerHTML = historyLots().map((lot) => `<option value="${esc(`${lot[0]} · ${lot[9]} · Suerte ${lot[10]}`)}"></option>`).join("");
  }
  function loadHistoryLot() {
    const id = text($("casurHistorySearch")?.value).split(" · ")[0];
    selectedHistoryLot = historyLots().find((lot) => text(lot[0]) === id) || null;
    if (!selectedHistoryLot) { alert("Seleccione una suerte histórica válida."); return; }
    const select = $("histSeason");
    select.innerHTML = (selectedHistoryLot[11] || []).map((row) => `<option value="${row[0]}">${String(row[0]).replace(/^(\d{2})(\d{2})$/, "$1/$2")}</option>`).join("");
    select.value = String((selectedHistoryLot[11] || []).at(-1)?.[0] || "");
    loadHistorySeason();
  }
  function loadHistorySeason() {
    if (!selectedHistoryLot) return;
    const season = Number($("histSeason")?.value);
    const row = (selectedHistoryLot[11] || []).find((item) => Number(item[0]) === season);
    if (!row) return;
    setValue("histArea", row[1]); setValue("histTon", row[2]); setValue("histTch", row[3]);
    setValue("histRto", row[4]); setValue("histAge", row[5]); setValue("histCut", row[6]);
  }
  function historicalMetric(rows) {
    if (!rows.length) return { area: 0, ton: 0, tch: null, rto: null, edad: null, corte: null, suertes: 0, zafras: [] };
    const area = rows.reduce((sum, row) => sum + (finite(row.area) || 0), 0);
    const ton = rows.reduce((sum, row) => sum + (finite(row.ton) || 0), 0);
    const areaWeight = (field) => {
      let numerator = 0; let denominator = 0;
      rows.forEach((row) => { const a = finite(row.area); const v = finite(row[field]); if (a > 0 && v !== null) { numerator += a * v; denominator += a; } });
      return denominator ? round(numerator / denominator) : null;
    };
    return { area: round(area) || 0, ton: round(ton) || 0, tch: area ? round(ton / area) : null,
      rto: areaWeight("rto"), edad: areaWeight("edad"), corte: areaWeight("corte"), suertes: rows.length,
      variedad: dominant(rows, "variedad"), riego: dominant(rows, "riego"), zona: dominant(rows, "zona"), tenencia: dominant(rows, "tenencia"),
      grTenencia: "", zafras: [...new Set(rows.map((row) => row.zafra))].sort() };
  }
  function rebuildHistorical() {
    const app = window.APP_DATA;
    const allRows = [];
    historyLots().forEach((lot) => {
      if (text(lot[8]) === "16" || normal(lot[2]).includes("0maquila")) return;
      (lot[11] || []).forEach((row) => allRows.push({
        lotId: lot[0], code: text(lot[8]), name: text(lot[9]), suerte: text(lot[10]), zafra: Number(row[0]),
        area: finite(row[1]) || 0, ton: finite(row[2]) || 0, tch: finite(row[3]), rto: finite(row[4]), edad: finite(row[5]), corte: finite(row[6]),
        zona: text(lot[2]), variedad: text(lot[3]), riego: text(lot[4]), tenencia: text(lot[5]),
      }));
    });
    const latestSeason = Number(app.meta?.latestZafra || 2526);
    const last3 = app.meta?.last3Zafras || [2324, 2425, 2526];
    const priorEntities = new Map((app.entities || []).map((entity) => [text(entity.code), entity]));
    const grouped = new Map();
    allRows.forEach((row) => { if (!grouped.has(row.code)) grouped.set(row.code, []); grouped.get(row.code).push(row); });
    const entities = [...grouped].map(([code, rows]) => {
      const prior = priorEntities.get(code) || {};
      const latestRows = rows.filter((row) => row.zafra === latestSeason);
      const trend = [...new Set(rows.map((row) => row.zafra))].sort().map((zafra) => ({ zafra,
        label: String(zafra).replace(/^(\d{2})(\d{2})$/, "$1/$2"), ...historicalMetric(rows.filter((row) => row.zafra === zafra)) }));
      const latest = historicalMetric(latestRows);
      const hist = historicalMetric(rows);
      const last = historicalMetric(rows.filter((row) => last3.includes(row.zafra)));
      return { ...prior, code, name: rows[0]?.name || prior.name || "", latest, hist, last3: last, trend,
        zona: latest.zona || hist.zona, variedad: latest.variedad || hist.variedad, riego: latest.riego || hist.riego, tenencia: latest.tenencia || hist.tenencia,
        details: latestRows.map((row) => ({ suerte: row.suerte, hhhsss: row.lotId, codLote: row.lotId, variedad: row.variedad,
          riego: row.riego, area: row.area, ton: row.ton, tch: row.tch, rto: row.rto, edad: row.edad, corte: row.corte, zona: row.zona, alerta: "" })),
        search: normal(`${code} ${rows[0]?.name} ${latest.zona} ${latest.variedad} ${latest.riego}`) };
    }).sort((a, b) => a.name.localeCompare(b.name, "es"));
    const latestRows = allRows.filter((row) => row.zafra === latestSeason);
    app.entities = entities;
    app.options = entities.map((entity) => ({ code: entity.code, name: entity.name, label: `${entity.code} · ${entity.name}` }));
    app.global.latest = historicalMetric(latestRows);
    app.global.hist = historicalMetric(allRows);
    app.global.last3 = historicalMetric(allRows.filter((row) => last3.includes(row.zafra)));
    app.global.trend = [...new Set(allRows.map((row) => row.zafra))].sort().map((zafra) => ({ zafra,
      label: String(zafra).replace(/^(\d{2})(\d{2})$/, "$1/$2"), ...historicalMetric(allRows.filter((row) => row.zafra === zafra)) }));
    app.meta = { ...app.meta, manualChanges: true, generated: new Date().toISOString().slice(0, 10) };
    window.CASUR_ADMIN_HISTORICO = app;
  }
  function saveHistorySeason() {
    if (!selectedHistoryLot) { alert("Primero seleccione una suerte histórica."); return; }
    const season = Number($("histSeason")?.value);
    const row = (selectedHistoryLot[11] || []).find((item) => Number(item[0]) === season);
    const area = finite($("histArea")?.value); const ton = finite($("histTon")?.value);
    if (!row || !(area > 0) || ton === null || ton < 0) { alert("Área y toneladas históricas válidas son obligatorias."); return; }
    row[1] = round(area); row[2] = round(ton); row[3] = round(ton / area); row[4] = round(finite($("histRto")?.value));
    row[5] = round(finite($("histAge")?.value)); row[6] = round(finite($("histCut")?.value));
    rebuildHistorical();
    setValue("histTch", row[3]);
    addLog(`Histórico ${selectedHistoryLot[0]} · zafra ${season} actualizado.`);
    if (typeof window.restoreView === "function") window.restoreView();
  }

  function switchEditor(type) {
    const crono = type === "crono";
    $("casurCronoEditor").hidden = !crono;
    $("casurHistoryEditor").hidden = crono;
    document.querySelectorAll(".casur-admin-tab").forEach((button) => button.classList.toggle("is-active", button.dataset.editor === type));
  }

  function applyImportedExcel() {
    if (typeof window.masterApplyPendingData !== "function") { alert("Primero cargue y valide el Excel oficial."); return; }
    const data = window.masterApplyPendingData();
    if (!data) { alert("No hay una carga válida para aplicar o contiene errores críticos."); return; }
    applyCronoData(data, "Excel oficial aplicado a la vista y preparado para publicar.");
  }

  async function ensureJsZip() {
    if (window.JSZip) return window.JSZip;
    const node = $("casurEmbeddedJsZipB64");
    if (!node) throw new Error("No se encontró el componente ZIP integrado.");
    const binary = atob(text(node.textContent).replace(/\s+/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const url = URL.createObjectURL(new Blob([bytes], { type: "text/javascript" }));
    await new Promise((resolve, reject) => {
      const script = document.createElement("script"); script.src = url; script.onload = resolve; script.onerror = reject; document.head.append(script);
    });
    URL.revokeObjectURL(url);
    if (!window.JSZip) throw new Error("No se pudo iniciar el generador ZIP.");
    return window.JSZip;
  }
  function downloadBlob(name, blob) {
    const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = name;
    document.body.append(anchor); anchor.click(); setTimeout(() => { URL.revokeObjectURL(anchor.href); anchor.remove(); }, 1000);
  }
  async function downloadDataUpdate() {
    try {
      const version = text($("casurPublishVersion")?.value) || `${new Date().toISOString().slice(0, 10).replace(/-/g, ".")}-${String(Date.now()).slice(-4)}`;
      const cronologico = window.CASUR_ADMIN_DATA || window.CRONO_DATA;
      const historico = window.CASUR_ADMIN_HISTORICO || window.APP_DATA;
      cronologico.meta = { ...cronologico.meta, dataVersion: version, publishedAt: new Date().toISOString() };
      historico.meta = { ...historico.meta, dataVersion: version, publishedAt: new Date().toISOString() };
      const release = { version, publishedAt: new Date().toISOString(), source: cronologico.meta?.source || "Centro Maestro",
        sheet: "REPORTE", tchEst2627EffectiveDate: ESTIMATE_DATE, cronologicoRows: cronologico.global?.suertes || 0,
        historicoRows: historico.meta?.rows || 0 };
      const JSZip = await ensureJsZip();
      const zip = new JSZip();
      zip.file("data/cronologico.js", `window.CASUR_REMOTE_CRONO=${JSON.stringify(cronologico)};\n`);
      zip.file("data/cronologico.json", `${JSON.stringify(cronologico, null, 2)}\n`);
      zip.file("data/historico.js", `window.CASUR_REMOTE_HISTORICO=${JSON.stringify(historico)};\n`);
      zip.file("data/historico.json", `${JSON.stringify(historico)}\n`);
      zip.file("data/version.js", `window.CASUR_RELEASE=${JSON.stringify(release)};\n`);
      zip.file("data/version.json", `${JSON.stringify(release, null, 2)}\n`);
      zip.file("LEEME_ACTUALIZACION.txt", "ACTUALIZACIÓN DE DATOS CASUR\n\n1. Descomprima este ZIP.\n2. En GitHub abra la carpeta data del repositorio.\n3. Suba y reemplace los seis archivos de la carpeta data.\n4. Confirme el commit.\n5. Los dispositivos recibirán la nueva versión al abrir la app con internet.\n\nNo reemplace index.html para una actualización normal de datos.\n");
      downloadBlob(`CASUR_ACTUALIZACION_DATOS_${version.replace(/[^A-Za-z0-9.-]+/g, "_")}.zip`, await zip.generateAsync({ type: "blob" }));
      addLog(`Paquete GitHub ${version} generado.`);
    } catch (error) { console.error(error); alert(`No se pudo generar el paquete: ${error.message || error}`); }
  }

  /* [Fase 4.4.3] Comparador robusto de versiones de datos (NO lexicográfico).
     Soporta los esquemas vigentes: "2026.09.05-siagri.1055" (adaptador SIAGRI)
     y "2026.09.01-2627.1" (publicación de código). Compara primero por fecha
     AAAA.MM.DD y, si coincide, por el número final como desempate. Valida
     FECHA REAL (mes 1-12, día válido para ese mes, año en rango razonable) y
     secuencia como entero seguro no negativo: rechaza fechas imposibles.
     Formatos no reconocidos o fechas inválidas devuelven null (el llamador
     debe tratarlos como "no actualizar", nunca como "más nueva"). */
  function parseCasurDataVersion(v) {
    if (typeof v !== "string") return null;
    const m = v.match(/^(\d{4})\.(\d{2})\.(\d{2})-([a-zA-Z0-9]+)\.(\d+)$/);
    if (!m) return null;
    const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]), seq = Number(m[5]);
    if (year < 2020 || year > 2100) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    if (!Number.isSafeInteger(seq) || seq < 0) return null;
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
    return { date: year * 10000 + month * 100 + day, seq };
  }
  /* Devuelve 1 si a es más nueva que b, -1 si a es más antigua, 0 si son
     iguales (o equivalentes), y null si no se pueden interpretar/comparar. */
  function compareCasurDataVersions(a, b) {
    if (a === b) return 0;
    const pa = parseCasurDataVersion(a);
    const pb = parseCasurDataVersion(b);
    if (!pa || !pb) return null;
    if (pa.date !== pb.date) return pa.date > pb.date ? 1 : -1;
    if (pa.seq !== pb.seq) return pa.seq > pb.seq ? 1 : -1;
    return 0;
  }
  window.CASUR_COMPARE_DATA_VERSIONS = compareCasurDataVersions;

  let dataSyncInProgress = false;

  function updateSyncPill(message, cls) {
    const pill = $("casurSyncPill");
    if (!pill) return;
    pill.textContent = message;
    pill.className = "casur-sync-pill" + (cls ? " " + cls : "");
  }

  function moduleToast(message) {
    const el = document.getElementById("casurInstallToast");
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(moduleToast._t);
    moduleToast._t = setTimeout(() => { el.classList.remove("show"); setTimeout(() => (el.hidden = true), 220); }, 3200);
  }

  /* [Fase 4.4.3] Sincronización automática real de datos publicados.
     Desde el Hotfix 4.4.3 el propio Service Worker raíz resuelve una
     GENERACIÓN COMPLETA y coherente de los 6 archivos (ver sw.js:
     produccionDataGate/resolveGeneration) y nunca sirve una versión anterior
     a la última buena conocida. Por eso esta función ya NO vuelve a validar
     cronológico/histórico por su cuenta (evita duplicar esa lógica): solo
     detecta si el SW resolvió algo distinto a lo cargado en esta página y,
     si es así, recarga UNA sola vez este iframe para tomarlo — con guard
     real contra recargas repetidas y verificación de que lo cargado tras
     recargar coincide con lo esperado (nunca un toast de éxito falso). */
  async function checkForDataUpdate(force = false) {
    if (location.protocol === "file:") return;
    if (dataSyncInProgress) return;
    try {
      const response = await fetch(`data/version.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return;
      const resolved = await response.json(); // ya resuelto/protegido por el SW
      const local = window.CASUR_RELEASE || {};
      if (!resolved || !resolved.version) return;
      if (resolved.version === local.version) {
        if (!force) { updateSyncPill(`Datos compartidos · versión ${esc(local.version || "—")}`, ""); return; }
      } else {
        /* Segunda capa defensiva: el SW ya garantiza que "resolved" nunca es
           anterior a "local" cuando ambas provienen del mismo gate, pero se
           conserva la comprobación explícita para nunca sobrescribir con
           algo inferior o de formato irreconocible. */
        const cmp = compareCasurDataVersions(resolved.version, local.version);
        if (cmp === -1) { console.warn(`[CASUR] Versión resuelta (${resolved.version}) es ANTERIOR a la activa (${local.version}); se ignora.`); return; }
        if (cmp === null) { console.warn(`[CASUR] Formato de versión no reconocido (resuelta="${resolved.version}", activa="${local.version}"); se ignora.`); return; }
      }

      /* Guard efectivo contra recargas repetidas: si ya se intentó esta
         versión en esta sesión, no reintentar en bucle. */
      const attemptKey = `casurDataSynced:${resolved.version}`;
      if (sessionStorage.getItem(attemptKey) && !force) return;

      dataSyncInProgress = true;
      updateSyncPill("Sincronizando…", "is-syncing");
      sessionStorage.setItem(attemptKey, "1");
      sessionStorage.setItem("casurDataSyncExpected", resolved.version);
      location.reload();
    } catch (error) {
      updateSyncPill("Sincronización pendiente", "is-pending");
    } finally {
      dataSyncInProgress = false;
    }
  }

  function initAdmin() {
    const section = $("masterUpdateSection");
    if (!section) return;
    const unlocked = unlockValid();
    section.classList.toggle("is-locked", !unlocked);
    updateAdminLauncher(unlocked, unlocked && section.open);
    section.addEventListener("toggle", () => {
      if (section.open && !unlockValid()) { section.open = false; section.classList.add("is-locked"); updateAdminLauncher(false, false); requestAdminUnlock(); }
      else if (section.open) { touchUnlock(); updateAdminLauncher(true, true); }
      else updateAdminLauncher(unlockValid(), false);
    });
    refreshCronoEditorOptions(); refreshHistoryOptions();
    document.querySelectorAll(".casur-admin-tab").forEach((button) => button.addEventListener("click", () => switchEditor(button.dataset.editor)));
  }

  window.goMasterModule = openAdmin;
  window.casurLoadCronoEditor = loadCronoEditor;
  window.casurNewCronoEditor = newCronoEditor;
  window.casurSaveCronoEditor = saveCronoEditor;
  window.casurDeleteCronoEditor = deleteCronoEditor;
  window.casurLoadHistoryLot = loadHistoryLot;
  window.casurLoadHistorySeason = loadHistorySeason;
  window.casurSaveHistorySeason = saveHistorySeason;
  window.casurApplyImportedExcel = applyImportedExcel;
  window.casurDownloadDataUpdate = downloadDataUpdate;
  window.casurCheckForDataUpdate = () => checkForDataUpdate(true);
  /* [INTEGRACIÓN App Maestra] API para que el shell genere el paquete de datos
     directamente, sin que el usuario navegue manualmente al Centro Maestro de
     Producción. Reutiliza downloadDataUpdate() sin duplicar su lógica. */
  window.CASUR_GENERATE_GITHUB_DATA_PACKAGE = downloadDataUpdate;
  window.CASUR_BUILD_CRONO_DATA = buildCronoData;

  window.addEventListener("load", () => {
    releaseStrip(); installCronoObserver(); initAdmin(); ensureLockDialog();
    const ACTIVE_KEY = "casur_produccion_active_version";
    const current = (window.CASUR_RELEASE && window.CASUR_RELEASE.version) || null;
    const expected = sessionStorage.getItem("casurDataSyncExpected");
    if (expected) {
      sessionStorage.removeItem("casurDataSyncExpected");
      if (current === expected) {
        /* [Fase 4.4.3] Éxito confirmado: la versión REALMENTE cargada tras la
           recarga coincide con la esperada. Solo aquí se muestra el toast y
           se actualiza el marcador (nunca antes, para no mentir). */
        try { localStorage.setItem(ACTIVE_KEY, current); } catch (e) {}
        moduleToast(`✓ Maestro de Suertes actualizado · ${current}`);
        updateSyncPill(`Datos compartidos · versión ${esc(current)}`, "");
      } else {
        console.warn(`[CASUR] Se esperaba la versión ${expected} pero se cargó ${current || "—"}.`);
        updateSyncPill("Sincronización pendiente", "is-pending");
      }
    } else if (current) {
      /* Arranque normal (sin recarga por sync): sincronizar el marcador
         same-origin SOLO si no implica downgrade respecto al ya conocido. */
      try {
        const known = localStorage.getItem(ACTIVE_KEY);
        const cmp = known ? compareCasurDataVersions(current, known) : 1;
        if (!known || cmp === 1 || cmp === 0) localStorage.setItem(ACTIVE_KEY, current);
        /* cmp === -1 o null: NUNCA sobrescribir el marcador con algo inferior o irreconocible. */
      } catch (e) {}
    }
    checkForDataUpdate();
    window.addEventListener("online", () => checkForDataUpdate());
    window.addEventListener("focus", () => checkForDataUpdate());
    setInterval(() => checkForDataUpdate(), 5 * 60 * 1000);
  });
})();
