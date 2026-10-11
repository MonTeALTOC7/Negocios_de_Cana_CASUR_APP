export const MODULE_CHECKPOINT_PROTOCOL_VERSION = 1;
export const MODULE_CHECKPOINT_TIMEOUT_MS = 2000;

export async function runModuleCheckpoint(bridge, { reason = "navigation", timeoutMs = MODULE_CHECKPOINT_TIMEOUT_MS } = {}) {
  if (
    !bridge
    || bridge.protocolVersion !== MODULE_CHECKPOINT_PROTOCOL_VERSION
    || typeof bridge.checkpoint !== "function"
  ) {
    return { ok: true, status: "unsupported" };
  }

  let timeoutId;
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => bridge.checkpoint({ reason })),
      new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve({ ok: false, status: "timeout" }), timeoutMs);
      }),
    ]);
    return result?.ok === true
      ? result
      : { ok: false, status: result?.status || "error" };
  } catch {
    return { ok: false, status: "error" };
  } finally {
    clearTimeout(timeoutId);
  }
}
