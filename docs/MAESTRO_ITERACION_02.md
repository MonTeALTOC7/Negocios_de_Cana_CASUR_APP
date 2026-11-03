# CASUR UX Premium — Iteración 02

Base: `70013a281e59413e93dcf55e50a1cbf02b2403fe`, PR Draft #48, rama existente. Referencias leídas íntegramente y cinco imágenes examinadas antes de editar. Cambios limitados a adaptadores de presentación, un logo secundario optimizado, manifiesto y QA.

## Entrega visual

Resumen: banner agrícola local, cuatro KPI prioritarios con SVG coherentes y definiciones en popovers accesibles, franja molienda/semilla/catálogo/cobertura, composición apilada y tablero con subpestañas. El tablero usa exclusivamente `CASUR_CRONO_PARTICIPATION.agronomicGroups`; síntesis de área por zona (anillo), riego, destino (columnas), variedades, tenencia y etapa del cultivo. Rendimientos provienen de `estimateTch` del mismo agregador. Directorio/búsqueda y selección múltiple abren sus funciones originales.

Se conserva **intacto** `shared/assets/brand/casur-logo.png`. El logo secundario suministrado se copia sin transformación desde su WebP de 512×512 (39,738 bytes), con alt y dimensiones; se integra en la cabecera blanca y se compacta en móvil. Acceso técnico original trasladado al lateral, con su guardia y evento existentes.

Ficha: ocho tooltips con zafra/TCH/área/toneladas/KATM/edad desde `trendFromLot(lotByCode(...))`. No se recalcula ni reemplaza la serie original. Focus, hover, clic/tap, Escape, posicionamiento limitado al viewport; portal fuera del contenedor recortado. Promedio/máximo/mínimo/último proceden de los ocho puntos visibles. KPI, tabla de 18 columnas, mapa inline y exportadores originales permanecen.

Cabecera interior: `position:relative`, sin sticky ni superposición. Shell padre intacto. Pruebas geométricas de no intersección a scroll 0/300/800 en 1536/1440/1280/390/360 para Resumen y ficha.

## Conciliación numérica

- Área activa 9,574.66 ha = molienda 9,115.65 + semilla 459.01.
- 995 activas = 948 molienda + 47 semilla; catálogo 1,053.
- Toneladas autorizadas 563,187.97 / área válida 9,115.65 = 61.78 TCH redondeado.
- TCH anterior 64.08 leído de `CRONO_DATA.global.tch`, exactamente el campo canónico del Cronológico General Z25/26.
- Pendiente de molienda 0 ha; semilla nunca se clasifica como pendiente de aforo.
- Fuente, zafra y denominadores se refrescan juntos. Fixture personal aislada: subconjunto Pansaco reconstruido con `CASUR_BUILD_CRONO_DATA`, valores del DOM contrastados con su motor y restauración en `finally`, sin escritura a storage. Esto valida la presentación ante cambio de generación; no afirma una importación personal end-to-end nueva.
- **Destino registrado** (campo `destino`) no equivale a participación operativa. El gráfico puede mostrar Molienda 9,118.59 ha aunque la franja operativa indique 9,115.65 ha; se conserva el agrupador canónico y se explica en el panel, sin igualar cifras artificialmente.

## QA reproducible

`tools/qa-maestro-iteration02.cjs DIRECTORIO [URL]`: cifras oficiales y personales, reconciliación de agregados, cuatro popovers, 24 combinaciones de vista/paleta/ancho, 60 checks de scroll, ocho tooltips comprobados contra registros originales, errores JS y métricas básicas de recursos/DOM. Anchos: 1536/1440/1280/768/390/360. Evidencia en `C:/Users/ctije/AppData/Local/CASUR/QA/resumen-premium-02/`.

Regresión existente `qa-maestro-ux.cjs` adaptada solo al nuevo cuarto KPI y puerto configurable `CASUR_QA_PORT`: conserva casos 494/2003/1927/99336, multifinca 25+993, PDF ejecutivo/completo/PNG, mapas, PWA offline, recuperación y ausencia de mutación IndexedDB. Suites estáticas: 95 Shell/GEO, 212 Producción, 92 TCH aprobadas; integridad y política de versiones aprobadas. No se desactivaron guardas.

Performance básico: logo optimizado 39 KB; se reutiliza la fotografía local ya cacheada; nuevo asset registrado en manifiesto SHA. No se declara puntuación Lighthouse ni prueba en teléfono físico. El entorno móvil es emulado.

## Fidelidad y diferencias honestas

- Se respetan lateral petróleo, banner agrícola, cuatro KPI, superficies claras, acentos dorado/azul/verde, subpestañas y densidad del tablero. Los valores ilustrativos del PNG se reemplazan por resultados oficiales.
- La fotografía disponible es la caña original del repositorio, **no** el panorama aéreo de la ilustración; no se recortó ni insertó la captura como fondo. Esta diferencia visual permanece.
- La cabecera incluye el shell externo y versiones reales; ocupa más alto que el concepto sin shell. Ya no tapa contenido al desplazar.
- Seis KPI en ficha, frente a cinco ilustrados. Se conserva Variedad por contrato funcional.
- Se muestran tenencia y etapa del cultivo en lugar de inventar una tendencia agregada o clasificación gerencial inexistente en la referencia. La consulta histórica original sigue accesible.
- GIS real conserva polígonos oficiales; no se modifica su geometría para imitar el croquis conceptual. Tiles externas dependen de disponibilidad; fallback original conservado.
- No se extiende esta iteración con nuevas funciones a vistas secundarias antes de la evaluación del Resumen y la ficha.

Preview: mismo proyecto `casur-maestro-ux-review`, rama del PR, SHA exacto y hashes externos. Adaptación Cloudflare del SW solo en artefacto, nunca en `sw.js` del repositorio. Sin merge ni cambios a main/producción.
