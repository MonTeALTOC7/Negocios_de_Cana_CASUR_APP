import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = path.join(root, "index.html");
let html = await fs.readFile(indexPath, "utf8");
const marker = '<script id="casurEmbeddedPwaAssets"';
const start = html.indexOf(marker);
const contentStart = html.indexOf(">", start) + 1;
const end = html.indexOf("</script>", contentStart);
if (start < 0 || end < 0) throw new Error("No se encontró casurEmbeddedPwaAssets.");
const embedded = JSON.parse(html.slice(contentStart, end));
const files = ["sw.js", "README_GITHUB.md", "VERSION.txt", "manifest.webmanifest"];
for (const file of files) embedded[file] = (await fs.readFile(path.join(root, file))).toString("base64");
html = `${html.slice(0, contentStart)}${JSON.stringify(embedded)}${html.slice(end)}`;
await fs.writeFile(indexPath, html);
console.log(`Recursos integrados actualizados: ${files.join(", ")}`);
