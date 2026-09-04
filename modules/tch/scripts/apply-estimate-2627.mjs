import fs from "node:fs";

const [, , sourcePath] = process.argv;
if (!sourcePath) throw new Error("Indicá el JSON auditado de Productores_V3.");

const matrix = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const [headers, ...sourceRows] = matrix;
const column = Object.fromEntries(headers.map((header, index) => [header, index]));
const normalizedLot = (value) => /^\d$/.test(String(value ?? "")) ? String(value).padStart(2, "0") : String(value ?? "").trim();
const source = new Map(sourceRows.map((row) => [
  `${String(row[column.CodHacienda] ?? "").trim()}${normalizedLot(row[column.Suerte])}`,
  { estimate: row[column.TCH_Est_170726] !== null && row[column.TCH_Est_170726] !== "" && Number.isFinite(Number(row[column.TCH_Est_170726]))
    ? Number(row[column.TCH_Est_170726]) : null },
]));

for (const relative of ["data/suertes.json", "data/productores.json"]) {
  const rows = JSON.parse(fs.readFileSync(relative, "utf8"));
  let matched = 0;
  let valued = 0;
  rows.forEach((row) => {
    const key = `${String(row.codigoHacienda ?? "").trim()}${normalizedLot(row.suerte)}`;
    const found = source.get(key);
    if (!found) {
      row.tchEstimado2627 = null;
      row.tchEstimado2627Fecha = "";
      row.tchEstimado2627Fuente = "";
      return;
    }
    matched += 1;
    if (found.estimate !== null) valued += 1;
    row.tchEstimado2627 = found.estimate;
    row.tchEstimado2627Fecha = "2026-07-17";
    row.tchEstimado2627Fuente = "PROD_EstimadosPn_Z26_27_v03_20260717_GA_CHATg(1).xlsx · Productores_V3 · TCH_Est_170726";
  });
  fs.writeFileSync(relative, `${JSON.stringify(rows, null, 2)}\n`);
  console.log(`${relative}: ${rows.length} filas · ${matched} vinculadas · ${valued} con TCH`);
}
