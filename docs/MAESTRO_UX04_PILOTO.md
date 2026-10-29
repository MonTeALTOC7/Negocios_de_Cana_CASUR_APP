# UX04 — piloto de navegación por niveles

Contrato: comentario #6506456798 en PR 48. Piloto limitado a General → Distribución → Riego → Gravedad → Por zona → 3-Norte → Fincas. Se entrega para revisión visual; no significa aprobación ni extensión a otros módulos.

La lista de categorías ocupa un ancho acotado y desaparece al elegir una. El detalle usa una sola subvista activa: Por zona, Fincas u Otras variables. El título y las migas muestran filtros activos; Volver restaura el nivel anterior. Las zonas se calculan dentro del ámbito Gravedad y sus porcentajes usan las hectáreas de dicho ámbito. El directorio usa únicamente las filas que cumplen Gravedad y 3-Norte, deduplicadas por código de finca; cada área corresponde a ese filtro. No hay barras anchas, panel paralelo ni scroll interior.

Valores de la generación de QA: Gravedad 5.822,48 ha, 60,81 % del área activa CASUR; Gravedad + 3-Norte 1.649,68 ha y 10 fincas. Proceden del motor existente y pueden variar con la fuente operativa. Las cifras de la zona usan como denominador Gravedad (5.822,48 ha), mientras el encabezado expresa el porcentaje del total CASUR.

El adaptador de General reutiliza el mecanismo de ámbitos existente; Finca, Suerte, Histórico, Zonas y Análisis no se rediseñan. Los motores, datos, GIS, exportadores, selección y PWA permanecen intactos. La ficha premium 99336 conserva gráfico TCH/KATM y GIS simultáneos en PC.

`tools/qa-maestro-ux04-piloto.cjs` ejecuta el recorrido real y captura cada paso a 390 y 1536 px. Verifica áreas originales, conteo de fincas únicas, un panel activo, ausencia de barras, retorno, ámbito y errores JS. `tools/qa-maestro-ficha-p0.cjs` verifica la ficha, mapa y PDF/PNG. `tools/qa-maestro-ux.cjs` comprueba funciones previas, Histórico multifinca, selección, contexto, offline e IndexedDB. Integridad y guardias verificadas.

La preview usa el proyecto Cloudflare existente, SHA completo y adaptación SW exclusivamente en artefacto. Móvil probado en Chromium emulado; los mosaicos dependen de proveedor externo. El diseño previo `be3f40f` no se considera aprobado. No merge, cambios a main ni producción.
