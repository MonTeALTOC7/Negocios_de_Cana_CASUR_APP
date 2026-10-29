# Maestro CASUR — corrección contextual Mobile-First

Contrato: comentario GitHub #6487667775 del PR Draft #48. Sustituye la distribución visual de las iteraciones anteriores; no constituye aprobación estética del usuario.

## Implementación

- General y Pansaco: un explorador activo, objetivos Área / Estimados / Consultar fincas o suertes, siete dimensiones, selección secundaria, ámbito visible, Volver y Limpiar. Cascadas Variedad → Zona → Riego y Riego → Zona, sin perder filtros al cambiar objetivo. No se dibujan barras de categoría única.
- Estimados: área válida, toneladas, TCH ponderado y cobertura juntos por grupo. Fuentes y denominadores en diálogo. Directorios filtrables con carga progresiva. Pansaco conserva catálogo completo de 49 suertes, 42 activas.
- Suerte: datos básicos únicos, dos indicadores principales y expansión de secundarios; Producción, Histórico, Ubicación y Detalle técnico. Tabla original de 18 columnas en diálogo, mapa GIS original en pestaña.
- Histórico TCH/KATM: proyección del modelo oficial CASUR_HISTORICAL_ENGINE, selección de 3/5/todas las zafras, valores ausentes N/D y segmentos interrumpidos. 99336 tiene diez zafras históricas (16/17–25/26); el gráfico cronológico original de ocho zafras permanece disponible para los exportadores. No se altera la selección del Histórico multifinca. KATM 25/26: 92.23.
- Informe: un único menú con los botones y handlers originales. PDF/PNG conservados. Análisis ampliados y tablas en diálogos con Escape y retorno de foco; controles táctiles de 44 px.
- Identidad CASUR, marca secundaria, fotografía agrícola, búsqueda y selección múltiple conservadas. No se agregan datos, motores ni almacenamiento personal.

## Comprobaciones

Prueba contextual reproducible: `tools/qa-maestro-mobile-first.cjs DIRECTORIO [URL_MODULO]`. 198 comprobaciones en 360/390/768/1280/1440/1536 px: dimensiones, objetivos, cascadas, navegación real General → Pansaco → 99336 → Finca → Zona, todas las subpestañas, modelos oficiales TCH/KATM, ausencia de desbordamiento y selección 99330 + 99336 + 1927 con buscador persistente.

Regresión contra main inmutable: `tools/qa-maestro-ux.cjs`, 14 grupos aprobados: valores originales, tablas, mapas, PDF/PNG individual y finca, exportación histórica ejecutiva/completa/PNG, selección multifinca, PWA y contexto después de recarga/offline, IndexedDB sin mutación y cero errores JS. Las pruebas antiguas de distribución por tarjetas quedan sustituidas por la prueba contextual; las aserciones numéricas originales se conservan.

Shell/GEO 95, Producción 212 y TCH 92: 399 pruebas aprobadas. Integridad de seis datasets oficiales, manifiesto runtime, guardias de contexto y política de versiones comprobados. General: 9574.66 ha activas, 563187.97 t, 61.78 TCH. Pansaco: 368.44 ha activas, 359.30 ha válidas, 17452.08 t, 48.57 TCH. Los nuevos componentes llaman a summary/agronomicGroups/cropStage, sin fórmulas paralelas.

## Diferencias visuales deliberadas y límites

Las referencias premium guían marca, colores, fotografía y superficies. El nuevo contrato reemplaza su distribución de tarjetas por exploración contextual. En móvil se priorizan selectores, resultados compactos y pestañas; en escritorio el panel ocupa el ancho disponible. El mapa no se duplica junto a cada gráfico y los detalles largos se abren por demanda. Los mapas de finca muestran la geometría completa de la finca, identificada como tal; los filtros de análisis no recortan geometrías oficiales.

No se afirma coincidencia píxel a píxel ni aprobación visual. Verificación móvil en Chromium emulado, no dispositivo físico. Mosaicos externos dependen del proveedor; se mantienen geometrías y fallback. Las tablas técnicas conservan desplazamiento horizontal dentro del diálogo.

## Preview y trazabilidad

Exclusivamente el proyecto existente casur-maestro-ux-review, rama de preview, sin merge ni main ni producción. Artefacto externo desde SHA completo con manifiesto de hashes. Adaptación de respuesta redirigida del SW exclusivamente en artefacto; SW fuente, integridad y guardias intactos. SHA, URL HTTPS y pruebas públicas acompañan la evidencia externa para evitar un commit autorreferencial.

Evidencia: C:/Users/ctije/AppData/Local/CASUR/QA/mobile-first/. Capturas completas por dimensión, objetivo, subpestaña y diálogos; comparación portable con referencias premium y resultados previos.
