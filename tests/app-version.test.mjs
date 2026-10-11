import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const versions = readFileSync(new URL("../core/versions/versions.js", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function captured(source, pattern, label) {
  const value = source.match(pattern)?.[1];
  assert.ok(value, `no se encontró ${label}`);
  return value;
}

test("la versión 1.1.0 coincide en la fuente canónica, el SW y el fallback HTML", () => {
  const canonical = captured(versions, /export const APP_VERSION = ['"]([^'"]+)['"];/, "APP_VERSION canónica");
  const sw = captured(serviceWorker, /const APP_VERSION = ['"]([^'"]+)['"];/, "APP_VERSION del Service Worker");
  const fallback = captured(index, /id="appVersion">v([^<]+)</, "versión fallback de index.html");
  assert.equal(canonical, "1.1.0");
  assert.deepEqual([canonical, sw, fallback], ["1.1.0", "1.1.0", "1.1.0"]);
});

test("el checkpoint de navegación forma parte del precache del shell", () => {
  const assets = captured(serviceWorker, /const SHELL_ASSETS = \[([\s\S]*?)\n\];/, "SHELL_ASSETS");
  assert.match(assets, /['"]\.\/core\/navigation\/module-checkpoint\.js['"]/);
});
