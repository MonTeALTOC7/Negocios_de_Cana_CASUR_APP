# Maestro Premium — primer incremento de alta fidelidad

Referencia: `REFERENCIA_VISUAL_MAESTRO_PREMIUM_APROBADA.png`, paquete autorizado el 28 de octubre de 2026. Base del incremento: `fbc4ae0706741fcbc4b89f6ab65b7985a811719a`. Rama existente y PR Draft #48; sin cambios a main, producción o GeoStudio.

## Implementación

Ficha real 99336: lateral único de 204 px, drawer móvil con Escape/foco y navegación por teclado, banner con fotografía de caña ya incluida en el repositorio y atributos de las celdas oficiales, seis KPI originales, paneles Ficha y gráfico / Histórico en tabla / Mapa. La búsqueda queda visible. El gráfico original y sus eventos se conservan; el mapa inline usa `CASUR_GEO_DATA.getLotGeometry` y `createCasurMap` sin cambiar el motor GIS. La instancia se conserva entre subpestañas y se destruye al cambiar de entidad. PDF/PNG y mapa ampliado siguen usando los controles originales.

La ficha agronómica y los indicadores complementarios leen las celdas que ya genera el módulo: no recalculan resultados ni introducen valores ilustrativos. La tabla histórica adicional presenta las ocho parejas zafra/TCH del gráfico original. La tabla operativa original permanece íntegra, con sus 18 columnas y exportadores.

Exploración: General → Consultar fincas → Pansaco → búsqueda 99336 → Volver a Pansaco. El directorio filtra nombres, códigos y zonas reales sin alterar la selección múltiple. Cronológico General separa los cuatro paneles originales de área y los tres de rendimiento en subpestañas reales. Resumen, Histórico, Zonas y Análisis comparten el lateral y la paleta, manteniendo sus contenidos y permisos propios. Este checkpoint prioriza la ficha y la exploración; no afirma que cada vista secundaria tenga una composición final aprobada.

## Comparación directa con la referencia

| Componente | Implementación y diferencia deliberada |
| --- | --- |
| Lateral | 204 px, petróleo, activo verde/acento dorado, fotografía original al pie; no herramientas decorativas. |
| Encabezado | Se conserva el shell externo (50 px adicionales respecto de la ilustración). En móvil el título del shell evita duplicarlo dentro del iframe. Versiones/origen reales. |
| Búsqueda | Control original siempre visible y selector real de finca. No se dibujan filtros de riego/zona que no tengan comportamiento implementado. |
| Banner | Título, fotografía original y atributos reales; PDF, imagen y mapa funcionales. Fotografía distinta de la ilustración. |
| KPI | Seis campos conservados, incluida Variedad. La referencia ilustra cinco tarjetas; se prioriza el contrato real. |
| Subpestañas | Paneles reales, controles de teclado, estado conservado al cambiar de vista. No son enlaces de desplazamiento. |
| Ficha | Tres columnas 31/41/28 en escritorio, dos en tableta amplia y una en teléfono. |
| Gráfico | SVG original, ocho zafras y modelos intactos. No se sustituyen sus trazos ni se inventan comparadores. |
| Mapa | Geometría real de 99336 y visor GIS existente; la forma difiere de la ilustración. Imágenes satelitales dependen del proveedor; funciona el respaldo original sin mapa base. |
| Indicadores | Toneladas, estados y observación procedentes de la tabla original. Sin edición decorativa. |

Datos reales prevalecen sobre el PNG: textura **Pesado**, destino **Molienda**, estado maestro **Molienda · Estimado utilizable**, edad dinámica **9.82 meses** en la fecha del ensayo. Área **8.91 ha**, TCH anterior **67.15**, estimado **65.00**, toneladas **579.15**, cosecha **24-dic-2026** y variedad **CP 72-2086** comprobados.

## Matriz de conservación y QA

| Capacidad | Evidencia |
| --- | --- |
| Datos y motores | Test byte a byte contra main: documento original, motor histórico, enriquecimiento, datasets e integridad sin modificaciones. |
| KPI, gráfico, tabla de 99336 | Comparación antes/después: seis KPI, ocho zafras, 18 columnas idénticos. |
| PDF y PNG | Descargas reales de suerte, finca, selección cronológica y multifinca histórico (ejecutivo/completo/PNG). PDF 99336 y finca 993 idénticos en SHA-256 a main durante el ensayo. |
| Casos agronómicos | 494 conserva sus fechas; 2003 fuera de molienda; 1927 mantiene 430.50 t. |
| Histórico multifinca | 25 + 993 = 64 suertes; selección parcial, períodos y cobertura equivalentes a main. |
| Mapas | Geometría original, mapa ampliado y nuevo panel inline; sin polígonos ficticios. |
| Responsive | Ficha en 1536/1440/1280/768/390/360, ambas paletas; cinco vistas y multiselección sin desbordamiento. |
| PWA/contexto | Recarga, otra ventana, offline, IndexedDB sin cambios y cero errores JS en regresión completa. |
| Pruebas estáticas | Shell/GEO: 95; Producción: 212; TCH: 92. Todos pasan. Integridad, versiones y guardas de recuperación pasan. |

Pruebas reproducibles: iniciar `tools/serve-maestro-preview.mjs` en 4381 y la base `origin/main` en 4380; ejecutar `tools/qa-maestro-ux.cjs DIRECTORIO` y `tools/qa-maestro-fidelity.cjs DIRECTORIO [URL]` con Playwright disponible. La entrada anterior `qa-maestro-composition.cjs` delega en la suite de fidelidad, que conserva comparaciones de KPI/SVG/selección y añade paneles/GIS/drawer.

Evidencia local: `C:/Users/ctije/AppData/Local/CASUR/QA/fidelidad-premium-inicio/`. `regression-reviewed/summary.json`: 14 grupos PASS; capturas, PDF y PNG en el mismo directorio. Las capturas de fidelidad distinguen ancho y paleta; pruebas móviles son emuladas, no aprobación en dispositivo físico.

## Publicación de revisión

Solo proyecto existente `casur-maestro-ux-review`, rama del PR, entorno Preview. Artefacto externo desde SHA completo, hashes SHA-256 y `__preview.json`. Se reutiliza exclusivamente en ese artefacto la adaptación de respuestas redirigidas ya validada para Cloudflare; `sw.js` del repositorio permanece intacto. No hay reescrituras HTTP 200 ni nuevas plataformas.
