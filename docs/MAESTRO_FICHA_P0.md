# P0 — recuperación de ficha premium 99336

Contrato: auditoría GitHub #6488851140. Base visual: 6ed66cde5afbc84387c4387f43a8b480e7bcfa94. Corrige únicamente la regresión de ficha introducida en 28b39cd; no revierte General/Finca.

## Corrección

Escritorio: se recupera `.maestro-ficha-board` con información técnica exclusiva a la izquierda, gráfico TCH/KATM al centro y geometría GIS real a la derecha, simultáneamente. Seis KPI originales en una franja completa. Planificación y toneladas se integran en el panel informativo, sin reemplazar el gráfico. Informe conserva los handlers PDF/PNG originales.

Móvil 390/360: gráfico inicial, mapa e información a un toque, navegación con flechas, seis indicadores en franja desplazable horizontal. No se carga una pestaña de cuatro textos como vista principal. El mapa se reajusta al abrirlo. Las tablas permanecen en diálogo.

Se mantienen modelo histórico oficial, selector TCH/KATM, períodos y tooltips. El gráfico cronológico original y su tabla permanecen una sola vez dentro del reporte y disponibles a los exportadores; los componentes de presentación están excluidos del documento exportado. No se cambian cálculos, datos, GIS, PWA, fuentes ni motores. El CSS residual que ocultaba cuatro KPI fue retirado.

## Comparación visual

Capturas 1536/390 contra la evidencia de 6ed66cd: vuelve la composición de tres columnas, con más ancho para el gráfico y menos campos duplicados en información. Se conserva el banner agrícola y la paleta. Cambios deliberados: Informe único en lugar de tres botones, controles TCH/KATM y período dentro del gráfico, cinco zafras iniciales con acceso a todas las diez del modelo histórico. El exportador mantiene el gráfico cronológico original de ocho zafras. La edad actual puede diferir entre capturas de días distintos por el cálculo original dependiente de fecha.

Móvil no copia tres columnas ilegibles: mantiene el gráfico como panel inicial y acceso directo al mapa. Los seis KPI se recorren horizontalmente. La calidad visual debe evaluarse con el comparador; CI no representa aprobación estética.

## Evidencia y pruebas

`tools/qa-maestro-ficha-p0.cjs`: composición simultánea, seis KPI, DOM original de gráfico/tabla sin IDs duplicados dentro de ficha, TCH/KATM y tooltip 92.23, geometría real, teclado, PDF/PNG y ausencia de errores JS en 1536/390/360.

`tools/qa-maestro-mobile-first.cjs`: se conserva el recorrido General/Finca y cascadas/multiselección; se adapta exclusivamente la navegación de la ficha a paneles simultáneos en escritorio. Las pruebas de valores/modelos siguen iguales.

`tools/qa-maestro-ux.cjs`: regresión contra main inmutable, exportadores individuales/finca/histórico, selección, contexto, offline y almacenamiento sin mutaciones. Integridad de datasets, guardias de contexto y manifiesto runtime verificados.

Evidencia externa: `C:/Users/ctije/AppData/Local/CASUR/QA/ficha-p0/`. Preview desde SHA exacto en el proyecto existente; adaptación SW únicamente en artefacto. Sin merge, main ni producción. Móvil emulado; mosaicos sujetos al proveedor, geometrías oficiales conservadas.
