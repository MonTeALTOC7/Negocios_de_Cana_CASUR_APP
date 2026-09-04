const WIDTH = 1080;
const HEIGHT = 1460;

function number(value, digits = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return new Intl.NumberFormat("es-NI", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(parsed);
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateShort(value) {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return year && month && day ? `${String(day).padStart(2, "0")}-${months[month - 1]}-${year}` : String(value);
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fillRound(ctx, x, y, width, height, radius, fill, shadow = null) {
  ctx.save();
  if (shadow) {
    ctx.shadowColor = shadow.color;
    ctx.shadowBlur = shadow.blur;
    ctx.shadowOffsetY = shadow.y;
  }
  roundedRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

function fitText(ctx, text, maxWidth, startSize, weight = 800) {
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  } while (size >= 17);
  return size;
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  let line = "";
  let row = 0;
  for (let index = 0; index < words.length; index += 1) {
    const test = line ? `${line} ${words[index]}` : words[index];
    if (ctx.measureText(test).width <= maxWidth || !line) {
      line = test;
      continue;
    }
    ctx.fillText(line, x, y + row * lineHeight);
    row += 1;
    if (row >= maxLines - 1) {
      const tail = words.slice(index).join(" ");
      let finalLine = tail;
      while (finalLine.length > 4 && ctx.measureText(`${finalLine}…`).width > maxWidth) finalLine = finalLine.slice(0, -1).trim();
      ctx.fillText(`${finalLine}…`, x, y + row * lineHeight);
      return row + 1;
    }
    line = words[index];
  }
  if (line) ctx.fillText(line, x, y + row * lineHeight);
  return row + 1;
}

function drawLabel(ctx, label, value, x, y, width, accent = "#0b7f3a") {
  fillRound(ctx, x, y, width, 102, 22, "rgba(255,255,255,.97)", { color: "rgba(3,45,25,.12)", blur: 16, y: 7 });
  fillRound(ctx, x + 17, y + 16, 8, 70, 4, accent);
  ctx.fillStyle = "#65766c";
  ctx.font = "800 16px Arial, sans-serif";
  ctx.fillText(label.toUpperCase(), x + 42, y + 38);
  fitText(ctx, value, width - 58, 27, 900);
  ctx.fillStyle = "#0d2f1d";
  ctx.fillText(value, x + 42, y + 76);
}

function drawRuler(ctx, x, y, height) {
  fillRound(ctx, x, y, 40, height, 15, "#f4c542");
  ctx.save();
  ctx.strokeStyle = "#775700";
  ctx.lineWidth = 3;
  for (let index = 17; index < height - 8; index += 20) {
    ctx.beginPath();
    ctx.moveTo(x + 7, y + index);
    ctx.lineTo(x + (index % 40 === 17 ? 28 : 21), y + index);
    ctx.stroke();
  }
  ctx.restore();
}

function comparisonPct(value, reference) {
  return Number(reference) > 0 && Number(value) ? ((Number(value) - Number(reference)) / Number(reference)) * 100 : null;
}

function deltaText(value) {
  if (!Number.isFinite(value)) return "Sin ref.";
  return `${Math.abs(value) < .05 ? "" : value > 0 ? "+" : ""}${number(Math.abs(value) < .05 ? 0 : value, 1)}%`;
}

function comparisonGap(value, reference) {
  return Number(reference) > 0 && Number(value) ? Number(value) - Number(reference) : null;
}

function comparisonTone(deltaPct) {
  if (!Number.isFinite(deltaPct)) return { fill: "#eef2ef", text: "#64736c" };
  if (deltaPct >= 0) return { fill: "#e7f6ec", text: "#08723a" };
  return { fill: "#ffeded", text: "#a61b1b" };
}

function executiveStatus(projected, historical, latest, estimate) {
  const references = [historical, latest, estimate].map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);
  if (!references.length) return { label: "Sin referencias", fill: "#eef2ef", text: "#64736c" };
  const above = references.filter((reference) => Number(projected) >= reference).length;
  if (above === references.length) return { label: "Sobre referencias", fill: "#e7f6ec", text: "#08723a" };
  if (above === 0) return { label: "Debajo de referencias", fill: "#ffeded", text: "#a61b1b" };
  return { label: "Comportamiento mixto", fill: "#fff4df", text: "#9a6200" };
}

function executiveInsight(projected, historical, latest, estimate) {
  const hasHistorical = Number(historical) > 0;
  const hasLatest = Number(latest) > 0;
  const hasEstimate = Number(estimate) > 0;
  if (!hasHistorical && !hasLatest && !hasEstimate) return "Sin referencias comparables para lectura ejecutiva.";

  const messages = [];
  if (hasHistorical) {
    const diff = comparisonGap(projected, historical);
    const pct = comparisonPct(projected, historical);
    messages.push(`vs histórico ${diff >= 0 ? "+" : ""}${number(diff, 1)} TCH (${deltaText(pct)})`);
  }
  if (hasLatest) {
    const diff = comparisonGap(projected, latest);
    const pct = comparisonPct(projected, latest);
    messages.push(`vs 25/26 ${diff >= 0 ? "+" : ""}${number(diff, 1)} TCH (${deltaText(pct)})`);
  }
  if (hasEstimate) {
    const diff = comparisonGap(projected, estimate);
    const pct = comparisonPct(projected, estimate);
    messages.push(`vs estimado 26/27 ${diff >= 0 ? "+" : ""}${number(diff, 1)} TCH (${deltaText(pct)})`);
  }
  return `Brecha ejecutiva: ${messages.join(" · ")}`;
}

function drawComparison(ctx, summary, lot) {
  const projected = Number(summary.projected) || 0;
  const historical = Number(lot.historicalTch) || 0;
  const latest = Number(lot.latestSeasonTch) || 0;
  const estimate = Number(lot.estimatedTch2627) || 0;
  const vsHistorical = comparisonPct(projected, historical);
  const vsLatest = comparisonPct(projected, latest);
  const gapHistorical = comparisonGap(projected, historical);
  const gapLatest = comparisonGap(projected, latest);
  const status = executiveStatus(projected, historical, latest, estimate);
  const rows = [
    { label: "Proyección actual", value: projected, color: "#087da1", chipText: "RESULTADO CLAVE", chipFill: "#e7f2fb", chipTextColor: "#005b8a" },
    { label: "Último TCH zafra 25/26", value: latest, color: "#c28b00", delta: vsLatest, gap: gapLatest },
    { label: "Estimado oficial zafra 26/27", value: estimate, color: "#7e4ab1", delta: comparisonPct(projected, estimate), gap: comparisonGap(projected, estimate) },
    { label: "Histórico promedio", value: historical, color: "#0b7f3a", delta: vsHistorical, gap: gapHistorical },
  ];
  const max = Math.max(1, ...rows.map((row) => Number(row.value) || 0));

  fillRound(ctx, 42, 942, 996, 242, 28, "#ffffff", { color: "rgba(3,54,30,.12)", blur: 21, y: 8 });
  ctx.fillStyle = "#0d2f1d";
  ctx.font = "900 20px Arial, sans-serif";
  ctx.fillText("Comparativo ejecutivo de productividad", 68, 978);
  ctx.fillStyle = "#5f7268";
  ctx.font = "700 13px Arial, sans-serif";
  ctx.fillText("Posición del lote frente a zafra previa, estimado 26/27 e histórico.", 68, 997);

  fillRound(ctx, 788, 954, 214, 32, 16, status.fill);
  ctx.fillStyle = status.text;
  ctx.font = "900 13px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(status.label, 895, 975);
  ctx.textAlign = "left";

  rows.forEach((row, index) => {
    const y = 1010 + index * 34;
    ctx.fillStyle = row.color;
    fillRound(ctx, 68, y + 3, 9, 18, 5, row.color);
    ctx.fillStyle = "#52685b";
    ctx.font = "800 14px Arial, sans-serif";
    ctx.fillText(row.label, 88, y + 17);

    fillRound(ctx, 300, y + 2, 350, 18, 9, "#edf3ef");
    fillRound(ctx, 300, y + 2, Math.max(5, (Number(row.value) || 0) / max * 350), 18, 9, row.color);

    fillRound(ctx, 670, y - 3, 120, 28, 14, "#f6f8f7");
    ctx.fillStyle = "#0d2f1d";
    ctx.font = "900 16px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${number(row.value, 1)} TCH`, 730, y + 16);

    const tone = comparisonTone(row.delta);
    const chipText = row.chipText || (Number.isFinite(row.delta) && Number.isFinite(row.gap)
      ? `${row.gap >= 0 ? "+" : ""}${number(row.gap, 1)} TCH · ${deltaText(row.delta)}`
      : "Sin referencia");
    fillRound(ctx, 812, y - 3, 190, 28, 14, row.chipFill || tone.fill);
    ctx.fillStyle = row.chipTextColor || tone.text;
    ctx.font = "900 11px Arial, sans-serif";
    ctx.fillText(chipText, 907, y + 15);
    ctx.textAlign = "left";
  });

  fillRound(ctx, 68, 1148, 934, 24, 10, "#f2f7f3");
  ctx.fillStyle = "#466357";
  ctx.font = "800 11px Arial, sans-serif";
  fitText(ctx, executiveInsight(projected, historical, latest, estimate), 900, 11, 800);
  ctx.fillText(executiveInsight(projected, historical, latest, estimate), 82, 1164);
}

async function loadImage(source) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

export async function createResultImageBlob({ lot, biometry, summary, logoUrl = "./assets/logo_casur.png", caneUrl = "./assets/cana-azucar-real.png" }) {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  const [logo, cane] = await Promise.all([loadImage(logoUrl), loadImage(caneUrl)]);

  const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, "#edf7f0");
  background.addColorStop(.58, "#f9fcfa");
  background.addColorStop(1, "#dceee4");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const hero = ctx.createLinearGradient(30, 25, 1040, 280);
  hero.addColorStop(0, "#063d24");
  hero.addColorStop(.56, "#0b7f3a");
  hero.addColorStop(1, "#087da1");
  fillRound(ctx, 30, 28, 1020, 270, 42, hero, { color: "rgba(4,55,31,.28)", blur: 34, y: 16 });
  ctx.save();
  roundedRect(ctx, 30, 28, 1020, 270, 42);
  ctx.clip();
  ctx.globalAlpha = .16;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(1012, 292, 185, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = .92;
  if (cane) {
    ctx.shadowColor = "rgba(0,0,0,.30)";
    ctx.shadowBlur = 18;
    ctx.drawImage(cane, 705, -6, 365, 548);
  }
  ctx.restore();

  fillRound(ctx, 60, 55, 226, 92, 24, "#ffffff", { color: "rgba(0,0,0,.18)", blur: 16, y: 7 });
  if (logo) ctx.drawImage(logo, 77, 68, 192, 65);
  ctx.fillStyle = "#d9f4e3";
  ctx.font = "900 18px Arial, sans-serif";
  ctx.fillText("NEGOCIOS DE CAÑA · CASUR", 60, 184);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 41px Arial, sans-serif";
  ctx.fillText("Resultado de biometría TCH", 60, 232);
  ctx.font = "700 20px Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,.86)";
  ctx.fillText("Medición de caña de azúcar · estimación volumétrica", 60, 265);

  fillRound(ctx, 42, 322, 996, 132, 28, "#ffffff", { color: "rgba(3,54,30,.13)", blur: 22, y: 9 });
  ctx.fillStyle = "#0b7f3a";
  ctx.font = "900 17px Arial, sans-serif";
  ctx.fillText("SUERTE EVALUADA", 70, 359);
  const title = `${lot.producer} · Suerte ${lot.lot}`;
  fitText(ctx, title, 720, 39, 900);
  ctx.fillStyle = "#0d2f1d";
  ctx.fillText(title, 70, 405);
  ctx.fillStyle = "#66776d";
  ctx.font = "700 18px Arial, sans-serif";
  ctx.fillText(`Código ${lot.id}  ·  ${number(lot.area, 2)} ha  ·  ${lot.variety || "Sin variedad"}`, 70, 435);
  fillRound(ctx, 846, 350, 160, 74, 22, "#e8f4ff");
  ctx.fillStyle = "#005baa";
  ctx.font = "900 15px Arial, sans-serif";
  ctx.fillText("FECHA", 878, 378);
  ctx.font = "900 20px Arial, sans-serif";
  ctx.fillText(dateShort(biometry.date), 858, 408);

  fillRound(ctx, 42, 478, 484, 205, 32, "#075e2d", { color: "rgba(3,54,30,.22)", blur: 24, y: 11 });
  ctx.fillStyle = "#ccebd7";
  ctx.font = "900 19px Arial, sans-serif";
  ctx.fillText("TCH BIOMÉTRICO ACTUAL", 76, 521);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 87px Arial, sans-serif";
  ctx.fillText(number(summary.mean, 1), 74, 623);
  ctx.font = "900 25px Arial, sans-serif";
  ctx.fillStyle = "#f4c542";
  ctx.fillText("TONELADAS DE CAÑA / HA", 77, 657);

  const projectedGradient = ctx.createLinearGradient(552, 478, 1038, 683);
  projectedGradient.addColorStop(0, "#087da1");
  projectedGradient.addColorStop(1, "#005baa");
  fillRound(ctx, 552, 478, 486, 205, 32, projectedGradient, { color: "rgba(0,68,120,.22)", blur: 24, y: 11 });
  ctx.fillStyle = "#dff6ff";
  ctx.font = "900 19px Arial, sans-serif";
  ctx.fillText("TCH PROYECTADO A COSECHA", 586, 521);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 87px Arial, sans-serif";
  ctx.fillText(number(summary.projected, 1), 584, 623);
  ctx.font = "900 25px Arial, sans-serif";
  ctx.fillStyle = "#f4c542";
  ctx.fillText(`${number(summary.tons, 0)} t PROYECTADAS`, 587, 657);

  drawLabel(ctx, "Edad actual", `${number(summary.age.months, 2)} meses`, 42, 710, 314, "#0b7f3a");
  drawLabel(ctx, "Edad referencia", `${number(biometry.targetAgeMonths, 1)} meses`, 383, 710, 314, "#005baa");
  drawLabel(ctx, "Ajuste técnico", `−${number(biometry.adjustmentPct, 0)}%`, 724, 710, 314, "#c28b00");
  drawLabel(ctx, "Puntos válidos", `${summary.count} muestras`, 42, 825, 314, "#0b7f3a");
  drawLabel(ctx, "Coeficiente de variación", `CV ${number(summary.cv, 1)}%`, 383, 825, 314, "#7e4ab1");
  drawLabel(ctx, "Tramo común", `${number(biometry.sampleLengthM, 1)} m`, 724, 825, 314, "#005baa");

  drawComparison(ctx, summary, lot);

  fillRound(ctx, 42, 1228, 996, 94, 25, "#ffffff", { color: "rgba(3,54,30,.10)", blur: 18, y: 7 });
  drawRuler(ctx, 65, 1241, 68);
  ctx.fillStyle = "#0d2f1d";
  ctx.font = "900 19px Arial, sans-serif";
  ctx.fillText("Lectura técnica del muestreo", 122, 1257);
  ctx.font = "700 16px Arial, sans-serif";
  ctx.fillStyle = "#52685b";
  ctx.fillText(`Rango ${number(summary.min, 1)}–${number(summary.max, 1)} TCH · CV ${number(summary.cv, 1)}% · Surco ${number(biometry.rowSpacingM, 2)} m · Calidad ${summary.quality}`, 122, 1287);
  ctx.fillStyle = "#0b7f3a";
  ctx.font = "900 15px Arial, sans-serif";
  ctx.fillText("Las referencias orientan el análisis y no modifican el TCH biométrico.", 122, 1310);

  ctx.fillStyle = "#496457";
  ctx.font = "700 16px Arial, sans-serif";
  ctx.fillText(`Técnico: ${biometry.technician || "Sin registrar"}`, 48, 1395);
  ctx.textAlign = "right";
  ctx.fillText("Estimador TCH CASUR v2.7.2 · PNG generado en el teléfono", 1032, 1395);
  ctx.textAlign = "left";
  ctx.fillStyle = "#0b7f3a";
  ctx.fillRect(42, 1419, 620, 9);
  ctx.fillStyle = "#005baa";
  ctx.fillRect(662, 1419, 250, 9);
  ctx.fillStyle = "#f4c542";
  ctx.fillRect(912, 1419, 126, 9);

  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen.")), "image/png", 1));
}
