# UX 05 — candidata para revisión móvil

Distribución y Estimados son vistas separadas; las siete agrupaciones de Estimados y Top 10 se ordenan por TCH ponderado descendente con N/D al final. Distribución ordena área. La ficha premium, GIS, exportadores, selección y PWA no se rediseñan.

## Verificación

- Auditoría operativa: 1.053 registros, 948 molienda utilizable, 47 semilla y 58 inactivos/excluidos; 9.115,65 ha válidas de molienda, 563.187,97 t, 61,78 TCH. Las siete agrupaciones concilian área y toneladas.
- Sintéticos: negativo, no numérico y ausente producen TCH N/D y no participan en área/toneladas. Cero conserva estado `zero`, pero el motor oficial lo excluye de área utilizable en el caso controlado; no se altera esa regla. No confundir cero con ausencia.
- CGMEX10-26: suerte 1502, 3,44 ha activas de semilla, cero área elegible de molienda, TCH agregado N/D. Semilla AS: 412,52 ha activas, cero área elegible de molienda, TCH agregado N/D.
- Rankings UI: siete dimensiones con N/D al final y orden descendente; Top 10 sin fincas duplicadas. TCH = toneladas autorizadas / área válida, cobertura = área válida / molienda elegible.
- Capturas reales y navegación en 360/390/430/768/1280/1536; hojas de contacto 360/390. Pruebas anteriores: ficha premium 99336, GIS, PDF/PNG, Histórico multifinca y PWA/contexto/IndexedDB. Manifiesto runtime y datos oficiales verificados.

## Matriz

| Control | Estado |
|---|---|
| Cálculos, valores ausentes, orden y rankings | CUMPLIDO |
| Móvil y preview para evaluación | CUMPLIDO para pruebas Chromium emulado; evaluación visual humana pendiente |
| Ficha, GIS, exportaciones e Histórico | CUMPLIDO en regresiones locales previas |
| Identificación de grupos que requieren investigación | PARCIAL: no existe umbral autorizado; se muestran brecha, área y cobertura sin inventar criterios ni causas |
| Aprobación visual por usuario | PENDIENTE |

Solo preview pública del proyecto existente; adaptación del SW limitada al artefacto externo. Sin merge, main ni producción.
