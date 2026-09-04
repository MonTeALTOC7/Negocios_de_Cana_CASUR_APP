# ARCHITECTURE

PWA estática:
- `index.html`: shell y navegación.
- `css/casur.css`: UI mobile-first.
- `js/app.js`: estado, rutas, interacción y flujo de biometría.
- `js/tch-engine.js`: fórmulas agronómicas.
- `js/master.js`: normalización, búsqueda, importación del maestro y actualizador validado del TCH 26/27.
- `js/storage.js`: IndexedDB.
- `js/excel.js`: XLSX real.
- `js/result-image.js`: PNG ejecutivo.
- `js/visit-evidence.js`: optimización Blob, rotulado PNG externo, descarga/compartir, Excel y ZIP masivo.
- `data/suertes.json`: Maestro General v2.4.
- `data/productores.json`: compatibilidad Zona 5.
- `sw.js`: caché PWA.
- `tests/`: validación automática.

No existe backend obligatorio.

IndexedDB v3 conserva `visits`. Las nuevas fotografías se guardan como Blob JPEG optimizado; Base64 legado sigue compatible. El PNG se genera bajo demanda para no duplicar almacenamiento.
