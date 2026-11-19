# PR #57 — ajuste focalizado de tres isotipos

Contrato: comentario 6968740588. Revisión anterior: 6b56f0f6fa40c913a7998e13fb5b5932256021a1.

- Maestro: parcelas delimitadas, caminos/surcos y caña; se retiran barras/flecha estadísticas.
- TCH: caña nodal, regla y dial de medición; se retira cámara/reloj.
- Riego: aspersión sobre surcos y cultivo; se retira la gota dominante.

Se conservan los fondos, gradientes, paletas y contornos de las fuentes SVG originales. Los tres PNG consumidos por `MODULE_LOGOS` se rasterizan a 512×512 RGBA con sharp, manteniendo transparencia exterior. Se inspeccionan a 22/44 px. Insumos, Inventario y Labores permanecen idénticos; sus SHA están fijados en las pruebas. No se modifican CSS, app.js, componentes inline, rutas, permisos, motores ni datos oficiales.

App sigue en 1.5.7 y los módulos conservan sus versiones. Se regeneran los seis hashes de SVG/PNG afectados, el releaseId y su constante compilada en SW; no se modifica la lógica del SW. Así los PNG nuevos pertenecen al núcleo verificado y están disponibles offline con la actualización segura existente.

## Validación reproducible

- `node --test tests/shell-module-icons.test.mjs`: existencia/consumidores, tamaño PNG, RGBA, pertenencia a core, SHA-256 y tres iconos protegidos.
- `node --test tests/*.test.mjs`: 131 PASS.
- `npm test --prefix modules/produccion`: 212 PASS.
- `npm run validate --prefix modules/tch`: 92 PASS.
- `node tools/runtime-assets.mjs`, `node tools/sync-versions.mjs`, `node tools/production-integrity.mjs` y política de versiones contra main de referencia: PASS.
- `node tools/qa-shell-module-icons.cjs DIRECTORIO [URL]`: Chromium aislado a 1536/390, tarjetas, sidebar expandido/contraído, selector, Centro Maestro, caché core con hashes actuales y recarga offline. Con URL comprueba opcionalmente `CASUR_QA_EXPECTED_SHA`.
- `node tools/qa-module-icon-update.cjs DIRECTORIO`: revisión anterior → candidata en un mismo origen, misma App 1.5.7, aviso/instalación coordinada, PNG nuevos offline y conservación de marcadores sintéticos en localStorage e IndexedDB.

Las capturas y resultados se entregan fuera del runtime. Android se emula en Chromium; no se afirma una prueba en dispositivo físico. La preview es exclusivamente de revisión y el PR permanece Draft, sin merge ni publicación productiva.
