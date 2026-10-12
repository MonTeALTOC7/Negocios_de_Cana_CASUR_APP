# Arquitectura geográfica CASUR · GEO-1

## Propósito y límites

La App Maestra consume una referencia geométrica de solo lectura para dar contexto operativo a
las fichas de finca y suerte. No sustituye el Maestro de Suertes, los datos SIAGRI ni CASUR
GeoStudio. GeoStudio continúa siendo el SIG especializado; la App Maestra publica solamente la
geometría mínima necesaria para consulta.

GEO-1 no incorpora puntos P01–Pxx, point-in-polygon, precisión GPS, interpolación ni cambios a
IndexedDB TCH. El visor y el motor compartidos quedan preparados para que GEO-2 los reutilice.

## Flujo publicado

```text
Shape oficial EPSG:4326
  → tools/geo/build-casur-geometry.py
  → reparación make_valid sobre copia derivada
  → agrupación por CodSuerte normalizado
  → GeoJSON mínimo por zona + manifest/lotIndex
  → GitHub Pages
  → Service Worker raíz / caché geográfica automática
  → shared/geo (datos + visor)
  → Maestro de Suertes VF54.8
  → futuro consumidor TCH (GEO-2)
```

## Fuente e identidad

- Fuente única: `Maestro_26_27_2472026_QGIS_SHP.zip`.
- SHA-256 fuente: `02636373feb1d3ab79ee0d83e028018c60e7798a5b09eec761297fd522d12170`.
- CRS publicado: EPSG:4326 / WGS84.
- Llave oficial: `String(CodSuerte).trim().toUpperCase()` = `lotId`/`hacSue` de la App.
- `Codfinca` y `Suerte` del Shape son auditables durante el build, pero nunca reconstruyen la
  identidad ni determinan las suertes de una finca en runtime.

La pertenencia a finca se obtiene de los lotes reales del Maestro (`DATA.lotCompact`) y solo
después se solicitan sus `lotId` al motor geográfico.

## Pipeline de build

El pipeline usa dependencias exclusivas de administración (`geopandas`, `shapely`, `pyogrio`).
No forman parte del runtime ni requieren intervención de los usuarios finales.

Las geometrías inválidas se reparan con `shapely.make_valid()` sobre la copia derivada. Si el
resultado es una `GeometryCollection`, se conservan únicamente componentes Polygon/MultiPolygon.
Los fragmentos físicos no se disuelven: se ordenan de forma determinística y se publican como una
geometría lógica MultiPolygon por suerte. Las coordenadas se redondean a seis decimales, sin
simplificación ni eliminación de vértices.

La validez se comprueba y repara por geometría física antes de agrupar. Una validación OGC del
`MultiPolygon` lógico completo puede señalar contactos o solapes entre fragmentos que se conservan
intencionalmente, y el redondeo puede hacer coincidir vértices muy próximos. No se aplica un
`make_valid`, `dissolve` ni `unary_union` final al agregado, porque alteraría la cantidad y forma de
los fragmentos reales; el visor consume esos componentes de referencia sin usarlos para cálculos
agronómicos.

GEO-2 debe ejecutar predicates GPS por componentes poligonales o mediante una
representación espacial validada; no debe asumir que el MultiPolygon agregado es OGC-valid.

El resultado no contiene atributos agronómicos. Cada Feature incluye únicamente `lotId`,
`fragmentCount`, `bbox` y `geometry`. Ejecutar el build dos veces con la misma fuente, código y
`dataVersion` debe producir los mismos bytes y SHA-256.

## Dataset web

`shared/geo/data/manifest.json` declara esquema, versión, fuente, SHA, conteos, bounds, zonas,
hashes de salida y el índice `lotId → zona`. Los archivos por zona son:

- `zona-1-sur.geojson`
- `zona-2-centro.geojson`
- `zona-3-norte.geojson`
- `zona-5-productores.geojson`

El índice no contiene coordenadas. Permite que una ficha de suerte cargue solo su zona. El motor
mantiene una caché en memoria por zona; solicitudes posteriores reutilizan el GeoJSON ya parseado.

## Runtime compartido

`shared/geo/geo-data.js` ofrece normalización, manifest, disponibilidad, carga individual o por
lotes y estado observable. `shared/geo/geo-map.js` monta Leaflet dentro de cualquier contenedor y
expone `setLot`, `setLots`, `fitToData` y `destroy`.

Leaflet 1.9.4 se distribuye localmente bajo BSD-2-Clause en `shared/vendor/leaflet/`. Los mapas
base son Esri World Imagery, OpenStreetMap y `Sin mapa base`. Los tiles son externos y nunca se
precachean masivamente; sin conexión el fondo neutro, polígonos, etiquetas y controles locales
siguen disponibles.

## Service Worker y offline

Existe un único Service Worker raíz. Los assets del motor/visor y Leaflet se precachean en el
shell. El manifest y las cuatro zonas se preparan automáticamente en
`casur_master_geo_2026-07-24-maestro-26-27`, identificada por `GEO_DATA_VERSION`,
independientemente de `APP_VERSION`. Una actualización del shell reutiliza los cinco recursos
existentes sin descargarlos de nuevo. GEO usa cache-first para la generación publicada.

El warm espera todos los intentos y verifica los cinco recursos antes de devolver `complete`.
Si falta alguno devuelve `incomplete` con la lista de faltantes; un fallo de Cache Storage devuelve
`error`. No impide instalar el shell: `WARM_GEO` reintenta al abrir o recuperar conectividad,
descargando solo los faltantes. Las llamadas concurrentes comparten una preparación y el mensaje
responde `GEO_WARM_RESULT` al puerto o cliente solicitante. La tolerancia del precache del shell
permanece independiente.

`casur_master_geo_meta` conserva un puntero `active` a la última generación completa. Cada nueva
versión descarga sus cinco archivos en su propia caché de staging; `activate` preserva generaciones
GEO anteriores. Solo después de verificar 5/5 se escribe el puntero activo y se podan las demás
generaciones. Mientras una nueva versión esté incompleta, fetch resuelve exclusivamente la caché
activa anterior. No consulta otra generación ni la red para completar un recurso aislado, evitando
mezclas entre manifest y zonas. Si falta el puntero, una migración defensiva solo puede activar una
caché que contenga los cinco recursos.

La geometría tiene caché y estrategia propias. No se mezcla con `DATA_CACHE`, las generaciones
SIAGRI ni `PROD_LKG_CACHE`; la estrategia LKG de Producción permanece intacta.

## Integración en Maestro

- Finca: `Mapa de finca` resuelve sus suertes desde el Maestro, carga solo zonas necesarias y
  presenta `X de Y suertes con polígono`.
- Suerte: `Ver polígono` abre el `lotId` exacto, muestra el área oficial de la App y el conteo de
  fragmentos geográficos. Nunca usa `Area_Ha` del Shape como dato agronómico.
- Sin geometría: informa de forma discreta, sin aproximar ni seleccionar un vecino.

El mapa vive en modal amplio desde 720 px y sheet/full-screen móvil. Está excluido de impresión y
exportación y no modifica periodo, KPI, drilldown ni `renderEntity`.

## Actualización administrativa

El procedimiento y dependencias se detallan en `tools/geo/README.md`. El ZIP/SHP fuente nunca se
commitea; solo se versionan los derivados mínimos y auditables. Toda actualización debe repetir
auditoría, crosswalk, build doble, hashes, pruebas automáticas y QA online/offline.
La versión `manifest.dataVersion` y `GEO_DATA_VERSION` en `sw.js` deben actualizarse juntas;
una prueba automática exige que coincidan.

## Diagnóstico MutationObserver de cierre GEO-1

Se compararon en Google Chrome 154 headless, con Service Workers bloqueados y perfiles aislados,
la base `668618b712ba3dc8cd66ce196ac97738694bc1b9` y el HEAD GEO-1. Ambos recorridos ejecutaron App,
Producción, Histórico, finca 759 y suerte 75907; HEAD además abrió y cerró el mapa (la base aún no
contiene GEO-1). Se capturaron `console.error`, `pageerror` y CDP `Runtime.exceptionThrown`.

Los tres canales quedaron vacíos en ambos casos: no hubo excepción, stack, URL, archivo, línea ni
columna. La llamada inline a `MutationObserver.observe(document.body, ...)` es idéntica entre base
y HEAD. El mensaje observado previamente solo en el navegador instrumentado de QA no es
reproducible en Chrome limpio y no se atribuye al código GEO-1; por ello no se ocultó ni se alteró
ningún observador.
