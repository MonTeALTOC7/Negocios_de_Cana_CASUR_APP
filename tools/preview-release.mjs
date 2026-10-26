// Hosting-only derivation. Production sw.js and its version remain unchanged.
export function previewReleaseId(appVersion, head) {
  if (!/^\d+\.\d+\.\d+$/.test(appVersion) || !/^[a-f0-9]{40}$/.test(head)) throw Error('Invalid preview release identity');
  return `${appVersion}-preview.${head}`;
}

export function derivePreviewWorker(source, {appVersion, head}) {
  const release = previewReleaseId(appVersion, head);
  const replace = (before, after) => {
    if (source.split(before).length !== 2) throw Error('Preview SW contract changed: ' + before);
    source = source.replace(before, after);
  };
  replace(`const APP_VERSION = '${appVersion}';`, `const APP_VERSION = '${appVersion}';\nconst PREVIEW_RELEASE_ID = '${release}';\nconst PREVIEW_HEAD = '${head}';`);
  replace("const SHELL_CACHE = MASTER_PREFIX + 'shell_v' + APP_VERSION;", "const SHELL_CACHE = MASTER_PREFIX + 'shell_v' + PREVIEW_RELEASE_ID;");
  replace("if (manifest.appVersion !== APP_VERSION || !manifest.assets || !Object.keys(manifest.assets).length)",
    "if (manifest.appVersion !== APP_VERSION || manifest.previewReleaseId !== PREVIEW_RELEASE_ID || !manifest.assets || !Object.keys(manifest.assets).length)");
  replace("new Response(APP_VERSION));", "new Response(PREVIEW_RELEASE_ID));");
  replace("if (!manifestResponse || !(await cache.match(new URL('./__release_ready__', self.registration.scope)))) return false;",
    "const readyResponse = await cache.match(new URL('./__release_ready__', self.registration.scope));\n  if (!manifestResponse || !readyResponse || await readyResponse.text() !== PREVIEW_RELEASE_ID) return false;");
  replace("return manifest.appVersion === APP_VERSION && (await Promise.all(",
    "return manifest.appVersion === APP_VERSION && manifest.previewReleaseId === PREVIEW_RELEASE_ID && (await Promise.all(");
  replace("return {ok:true, version:APP_VERSION};", "return {ok:true, version:PREVIEW_RELEASE_ID};");
  replace("postMessage({version:APP_VERSION, ready:await releaseReady(), previous});",
    "postMessage({version:PREVIEW_RELEASE_ID, appVersion:APP_VERSION, head:PREVIEW_HEAD, shellCache:SHELL_CACHE, ready:await releaseReady(), previous});");
  // This diagnostic URL must not fall back to the app shell on navigation.
  // Network-first when online; its last response belongs to this code cache.
  replace("  // 2) Navegaciones: network-first con fallback al index CORRECTO.",
    "  if (url.pathname === new URL('./__preview.json', self.registration.scope).pathname) {\n    event.respondWith(networkFirst(req, SHELL_CACHE));\n    return;\n  }\n\n  // 2) Navegaciones: network-first con fallback al index CORRECTO.");
  return source;
}
