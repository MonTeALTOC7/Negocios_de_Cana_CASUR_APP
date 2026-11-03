# UX 04 — Incremento A: Resumen y Cronológico General

Contrato aprobado en el comentario #6502875232 del PR 48. Candidata para evaluación visual, no aprobación de producto ni merge.

## Alcance

Resumen mantiene los cuatro KPI originales y composición molienda/semilla; sustituye el explorador duplicado por un hallazgo de la zona con mayor área activa, calculado mediante CASUR_CRONO_PARTICIPATION, con acceso al análisis por zona. No inventa alertas ni cambia datos.

General emplea objetivos Distribución, Estimados de la zafra efectiva y Consultar fincas. Las siete variables usan una sola superficie activa; seleccionar una categoría profundiza conservando el ámbito, con migas, Volver y Limpiar ámbito. El porcentaje se calcula sobre área activa del ámbito mostrado. Los estimados reúnen área válida, toneladas, TCH ponderado, cobertura de molienda y suertes, con los mismos valores agrupados por variable y denominadores de la fuente. Categorías únicas no reciben barras de 100 %.

La escobita limpia únicamente el texto. En consulta individual, enfocar selecciona el texto sin cerrar la ficha; en múltiple, agregar una suerte limpia el texto, conserva selección, foco y el flujo de búsqueda. Limpiar selección sigue siendo una acción independiente.

Finca, Suerte, Histórico, Zonas y Análisis no se rediseñan. Se conservan gráfico TCH/KATM, GIS, informes y PWA. Los adaptadores de presentación y el manifiesto runtime son los únicos cambios de aplicación.

## Comprobaciones

`tools/qa-maestro-ux04.cjs`: siete dimensiones, porcentajes/agrupaciones, conciliación de toneladas, Zona → Variedad y Variedad → Zona → Riego, retorno, 99330 + 99336 + 1927 y escobita a 360, 390, 768, 1280 y 1536 px; capturas por objetivo y variable. La prueba individual confirma que limpiar la consulta no cierra 99336. `tools/qa-maestro-ficha-p0.cjs` verifica los seis KPI, TCH/KATM, GIS simultáneo en escritorio, tabla y PDF/PNG. `tools/qa-maestro-ux.cjs` cubre comparación con main, multifinca, exportaciones y PWA/contexto. Integridad y guardias del contexto verificadas.

## Comparación y límites

El diseño anterior usaba tres desplegables; ahora muestra objetivos y variables compactos. Los chips de variables y la franja de totales admiten desplazamiento horizontal controlado en teléfono, sin desbordamiento de página. Las capturas móviles son emulación Chromium. El mapa usa geometría real y mosaicos de proveedor externo. Las pruebas no sustituyen la aprobación visual. El incremento B y C no forman parte de esta candidata.

Preview exclusivamente desde SHA completo en el proyecto existente, con adaptación del Service Worker solo en el artefacto y hashes externos. Sin modificación de main, merge ni producción.
