import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runModuleCheckpoint } from "../core/navigation/module-checkpoint.js";

const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../shared/styles/app.css", import.meta.url), "utf8");

function sourceBetween(start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
}

test("el selector usa exclusivamente registry.homeModules", () => {
  const renderer = sourceBetween("const renderSwitcherModules", "const openSwitcher");
  assert.match(renderer, /registry\.homeModules\(\)\.forEach/);
  assert.doesNotMatch(renderer, /registry\.all\(|BASE_MODULES|Administrador SIAGRI|Conciliación/);
});

test("el módulo actual queda marcado y muestra su check", () => {
  assert.match(source, /target\.moduleId === id/);
  assert.match(source, /aria-current="page"/);
  assert.match(source, /current \? '✓' : '›'/);
});

test("homeModules excluye módulos privados, ocultos y deshabilitados", () => {
  const registry = readFileSync(new URL("../core/module-registry/registry.js", import.meta.url), "utf8");
  assert.match(registry, /m\.visible && m\.enabled && m\.privacy === 'public'/);
});

test("otro módulo navega directamente sin pasar por Home", () => {
  const handler = sourceBetween("switcher.addEventListener('click'", "host.addEventListener('keydown'");
  assert.match(handler, /navigateFromActiveModule\('\/modulo\/' \+ targetId, 'module-switch'\)/);
  assert.doesNotMatch(handler, /router\.home\(\)/);
});

test("seleccionar el módulo actual cierra sin recargar el iframe", () => {
  const handler = sourceBetween("switcher.addEventListener('click'", "host.addEventListener('keydown'");
  assert.match(handler, /if \(targetId === id\) \{ closeSwitcher\(\); return; \}/);
  assert.doesNotMatch(handler, /f\.src = f\.src/);
});

test("Volver conserva Home y Recargar actúa solo sobre mFrame", () => {
  assert.match(source, /navigateFromActiveModule\('\/', 'back-home'\)/);
  assert.match(source, /reloadActiveModule\(\)/);
  assert.match(source, /if \(frame\) frame\.src = frame\.src/);
});

test("Escape cierra y devuelve el foco al selector", () => {
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /trigger\.focus\(\)/);
  assert.match(source, /aria-expanded', 'false'/);
});

test("el selector mantiene un único iframe", () => {
  const viewModule = sourceBetween("function viewModule(id)", "async function viewCentroMaestro");
  assert.equal((viewModule.match(/<iframe/g) || []).length, 1);
  assert.doesNotMatch(viewModule, /createElement\(['"]iframe/);
});

test("móvil usa bottom sheet y escritorio un popover anclado", () => {
  assert.match(css, /\.module-switcher__panel[^{]*\{[^}]*bottom: 0/);
  assert.match(css, /@media \(min-width: 720px\)[^]*\.module-switcher__panel[^{]*\{[^}]*top: calc\(52px/);
  assert.match(css, /var\(--safe-bottom\)/);
});

test("un módulo sin bridge continúa de inmediato", async () => {
  assert.deepEqual(await runModuleCheckpoint(undefined), { ok: true, status: "unsupported" });
});

test("acepta respuestas noop y saved del bridge v1", async () => {
  const reasons = [];
  const noop = await runModuleCheckpoint({
    protocolVersion: 1,
    async checkpoint({ reason }) { reasons.push(reason); return { ok: true, status: "noop" }; },
  }, { reason: "back-home" });
  const saved = await runModuleCheckpoint({
    protocolVersion: 1,
    async checkpoint() { return { ok: true, status: "saved", updatedAt: "T2" }; },
  });
  assert.equal(noop.status, "noop");
  assert.equal(saved.status, "saved");
  assert.deepEqual(reasons, ["back-home"]);
});

test("normaliza error devuelto y excepción como fallo", async () => {
  const rejected = await runModuleCheckpoint({
    protocolVersion: 1,
    async checkpoint() { return { ok: false, status: "error" }; },
  });
  const thrown = await runModuleCheckpoint({
    protocolVersion: 1,
    async checkpoint() { throw new Error("IDB"); },
  });
  assert.deepEqual(rejected, { ok: false, status: "error" });
  assert.deepEqual(thrown, { ok: false, status: "error" });
});

test("un fallo conserva hash e iframe y activa el aviso de cancelación", async () => {
  const shell = { hash: "#/modulo/tch", frame: { id: "mFrame" }, toast: "" };
  const result = await runModuleCheckpoint({
    protocolVersion: 1,
    async checkpoint() { return { ok: false, status: "error" }; },
  });
  if (result.ok) {
    shell.hash = "#/modulo/produccion";
    shell.frame = null;
  } else {
    shell.toast = "No se pudo proteger el trabajo pendiente. El cambio de módulo fue cancelado.";
  }
  assert.equal(shell.hash, "#/modulo/tch");
  assert.deepEqual(shell.frame, { id: "mFrame" });
  assert.equal(shell.toast, "No se pudo proteger el trabajo pendiente. El cambio de módulo fue cancelado.");
});

test("cancela un checkpoint que excede el timeout", async () => {
  const result = await runModuleCheckpoint({
    protocolVersion: 1,
    checkpoint() { return new Promise(() => {}); },
  }, { timeoutMs: 5 });
  assert.deepEqual(result, { ok: false, status: "timeout" });
});

test("selector, Volver y Recargar esperan el checkpoint antes de actuar", () => {
  const navigate = sourceBetween("async function navigateFromActiveModule", "async function reloadActiveModule");
  const reload = sourceBetween("async function reloadActiveModule", "/* Mini-logos");
  assert.match(navigate, /await checkpointActiveModule\(reason\)[^]*router\.go\(path\)/);
  assert.match(reload, /await checkpointActiveModule\(reason\)[^]*frame\.src = frame\.src/);
  assert.match(source, /if \(moduleNavigationPending\) return false/);
  assert.match(source, /No se pudo proteger el trabajo pendiente\. El cambio de módulo fue cancelado\./);
});
