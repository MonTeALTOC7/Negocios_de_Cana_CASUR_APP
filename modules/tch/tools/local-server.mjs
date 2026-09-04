import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4173;
const HOST = "127.0.0.1";
const types = {
  ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8",
  ".json":"application/json; charset=utf-8", ".webmanifest":"application/manifest+json; charset=utf-8",
  ".png":"image/png", ".svg":"image/svg+xml", ".txt":"text/plain; charset=utf-8",
};

http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, `http://${HOST}:${PORT}`).pathname);
  let file = path.join(ROOT, pathname === "/" ? "index.html" : pathname.replace(/^\/+/, ""));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end("Forbidden"); return; }
  fs.stat(file, (err, stat) => {
    if (!err && stat.isDirectory()) file = path.join(file, "index.html");
    fs.readFile(file, (readErr, data) => {
      if (readErr) {
        fs.readFile(path.join(ROOT, "index.html"), (fallbackErr, fallback) => {
          if (fallbackErr) { res.writeHead(404); res.end("Not found"); return; }
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
          res.end(fallback);
        });
        return;
      }
      res.writeHead(200, { "Content-Type": types[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(data);
    });
  });
}).listen(PORT, HOST, () => {
  console.log(`Estimador TCH CASUR v2.7.2 disponible en http://${HOST}:${PORT}/`);
});
