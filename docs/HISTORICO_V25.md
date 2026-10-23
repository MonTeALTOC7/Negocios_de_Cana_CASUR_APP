# Histórico V2.5 - mapa de selección multifinca

Base PR #33: 17c56b6595a48fa95add5a241c2638ddae88d517. Rama hija codex/historico-mapa-multifinca.

El modelo deriva exclusivamente de getHistoricoDualSummary().selection, con lotIds normalizados del motor histórico, nombres, modo, color, polígonos y faltantes por finca. No consulta el Cronológico para ampliar la selección. getLotGeometries reutiliza manifest y caché por zona; la caché de selección comparte solicitudes concurrentes y elimina fallos para permitir reintento. El mapa se conserva al cambiar solamente período, se destruye al desmontar y descarta respuestas de montajes anteriores.

La app reutiliza createCasurMap, con featureStyle optativo y compatible con los consumidores actuales. Controles de zoom, fondos, enfoque por finca y vista general; selección cartográfica solo de consulta, sin editar la selección analítica. Mapa contraíble y cobertura detallada. Fondo neutro inicial evita depender de mosaicos externos; el selector ofrece los fondos originales.

PDF ejecutivo/completo: obtiene geometrías antes de renderizar, agrega bloques atómicos por finca después de los comparativos y antes de los anexos. Usa proyección esférica Mercator y escala común X/Y en cada panel, con encuadres independientes, sin barra de escala ni atribución de mosaicos. Conserva todos los anillos y fragmentos; fill-rule evenodd representa huecos. Etiquetas desde anchors oficiales con supresión de solapes. No calcula áreas agronómicas. Fallo GEO produce aviso, sin bloquear PDF. No se duplican mapas en anexos. No hay nuevos archivos runtime, versiones ni cambios SW.

## Evidencias y resultados

Carpeta C:/Users/ctije/Videos/CASUR_V25_QA. `definitivo` contiene PDF y PNG finales; `final` conserva diagnóstico anterior sin etiquetas. `qa-map.json`, `offline.json`, `mapa-offline.png` y logs documentan verificaciones.

Caso A: 18 seleccionadas, 12 con polígono (66.67%). Dolores 9/15; faltan 25608, 25609, 25610, 25611, 25612 y 25613. Peirano exactamente 98301/98304/98304A, 3/3. No se sustituyen por vecinas. Caso B: 17 seleccionadas, 11 con polígono (64.71%); Dolores 9/15, Peirano 98301/98302 2/2.

Conciliación A: histórico 204.26/61.20/108.63/6.65; período 187.41/53.57/105.66/5.66 y 36.10 km. B conserva 188.84/48.92/108.56 y TAH aproximado 5.310840138. Mapas no modifican ninguna cifra.

Producción: 22 controles + 130 tests. TCH validate: 91 tests. Shell/GEO: 49 tests, incluido estilo optativo y defaults anteriores. Pruebas sintéticas: selección exacta, caché, faltantes, reintento tras fallo, MultiPolygon y huecos sin mutación.

QA navegador: 1440x900 y 390x844; selección parcial, cambio rápido, cambio de período, una/tres/cinco fincas y personalizado. La primera pasada densa detectó botón largo en móvil; se corrigió con flex-wrap y salto del texto. PDF A ejecutivo 3 páginas y completo 6: una hoja adicional justificada para los dos paneles, sin reducir gráficos. Todas las páginas finales A revisadas a color y grises, sin mapas vacíos o cortados. Paginador anterior sin cambios.

qa-multifinca-recovery.cjs confirma exportaciones individuales PDF/PNG, suerte, multifinca, Cronológico, shell y descarga PDF offline. Prueba adicional con Service Worker real confirma recarga offline tras precarga y mapa 12/18 visible. Fallo de carga GEO en contexto nuevo muestra aviso y conserva KPI.

## Límites

La cartografía histórica publicada es parcial: seis suertes de Dolores no tienen polígono, indicadas explícitamente. Anchors/fragmentos oficiales pueden reflejar solapes de origen, que se conservan. Etiquetas permanentes limitadas en PDF por espacio; la app identifica por interacción. Sin prueba física de móvil/impresora. Los fondos externos requieren red; polígonos y PDF no la requieren tras precarga. Las pruebas no certifican todas las combinaciones posibles del catálogo.
