# UX04 A — exploración compacta por fincas

Contrato correctivo: comentario #6504165277. Primera fase General y Resumen, pendiente de evaluación visual; Finca, Histórico, Zonas y Análisis se reservan para los incrementos siguientes.

## Cambios

General reemplaza barras y filas extendidas por categorías compactas y un panel de detalle. Categorías muestran área y porcentaje del ámbito, con cantidad de fincas únicas por código canónico. Al entrar, el desglose por zona y las fincas reales pertenecen al mismo ámbito. El directorio permite buscar, cargar más y abrir la ficha; el filtro y el ámbito se conservan al volver y al cambiar objetivo. La hectárea mostrada por finca corresponde exclusivamente a las suertes que coinciden con los filtros, no al área total de esa finca. Los conteos por categoría no son aditivos.

Estimados muestra área válida, toneladas y TCH ponderado juntos por categoría y finca; la cobertura se muestra por finca. Los cálculos proceden del motor de participación existente. Resumen enlaza directamente a la zona de su hallazgo calculado. El patrón está encapsulado en helpers de presentación para su aplicación posterior; no se alteran motores ni datos.

Móvil presenta categorías y detalle en secuencia; la franja de KPI es desplazable y el directorio muestra cuatro fincas con carga adicional. Las categorías tienen un contenedor acotado para evitar listas extensas. La búsqueda múltiple, la ficha premium TCH/KATM + GIS, PDF/PNG y PWA permanecen intactos.

## QA

`tools/qa-maestro-ux04-compact.cjs`: siete dimensiones, ausencia de barras, fincas únicas, conciliación del área filtrada, cruces por zona, directorio y Estimados a 360/390/768/1280/1536. Prueba adicional Pansaco: filtro Gravedad, área de ámbito contra fuente, métricas estimadas, apertura y retorno con filtro retenido. `tools/qa-maestro-ficha-p0.cjs`: ficha 99336, gráfico, GIS, seis KPI, tabla, PDF/PNG. `tools/qa-maestro-ux.cjs`: regresión con main inmutable, multifinca, exportaciones, contexto/PWA/IndexedDB. Integridad de datos y guardias verificadas.

La comparación previa/posterior muestra que desaparecen las barras de General. Los mosaicos externos dependen del proveedor; móvil probado en Chromium emulado. Las capturas y CI no equivalen a aprobación visual. Finca/desglose y sus estimados continúan con la presentación anterior hasta aprobación del patrón; por ello no se declaran corregidos en esta fase.

Preview únicamente desde SHA completo en el proyecto Cloudflare existente, con adaptación SW y hashes únicamente en artefacto. Sin merge, main ni producción.
