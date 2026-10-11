# ARCHITECTURE

PWA estática:
- `index.html`: shell y navegación.
- `css/casur.css`: UI mobile-first.
- `js/app.js`: estado, rutas, interacción y flujo de biometría.
- `js/tch-engine.js`: fórmulas agronómicas.
- `js/master.js`: normalización, búsqueda, importación del maestro y actualizador validado del TCH 26/27.
- `js/storage.js`: IndexedDB.
- `js/biometry-draft.js`: esquema, copia segura y persistencia del borrador de captura.
- `js/excel.js`: XLSX real.
- `js/result-image.js`: PNG ejecutivo.
- `js/visit-evidence.js`: optimización Blob, rotulado PNG externo, descarga/compartir, Excel y ZIP masivo.
- `data/suertes.json`: Maestro General v2.4.
- `data/productores.json`: compatibilidad Zona 5.
- `sw.js`: caché PWA.
- `tests/`: validación automática.

No existe backend obligatorio.

IndexedDB v3 conserva `visits`. Las nuevas fotografías se guardan como Blob JPEG optimizado; Base64 legado sigue compatible. El PNG se genera bajo demanda para no duplicar almacenamiento.

El borrador de biometría comparte IndexedDB v3 sin migraciones y usa solamente el store
`settings`. `app.js` marca cambios significativos, agrupa escrituras durante 500 ms y fuerza un
último guardado en `visibilitychange`/`pagehide`; la recuperación ocurre después de cargar Maestro,
biometrías y configuración, manteniendo Inicio como ruta inicial.
