# UX13 · Etapa A — Cronológico General/Finca y Estimados Z26/27

Issue: #61 · Base: `main` V1.6.1 `71d5e0b8e3c4565de8e66e291fc54be7425c3918` · Rama: `claude/ux13-cronologico-finca-estimados`
Versiones: App 1.6.2 (PATCH, solo manifiesto offline derivado) · Producción V1.8.3 (PATCH de presentación).

## Alcance

Solo presentación y orquestación en `modules/produccion/js/maestro-ux.js` y `modules/produccion/css/maestro-ux.css`.
Sin cambios en `casur-enhancements.js` (motor de participación), `historical-engine.js`, `data/*`, `shared/geo/data/`,
generadores PDF/PNG ni algoritmos del Service Worker. `index.html` del módulo solo cambia en `VERSION` y los activos
embebidos derivados por `tools/sync-versions.mjs`.

La Etapa B (Histórico de finca y suerte, ítems 9–15 del Issue) **no** se toca.

## Cambios por componente (ítems 1–8 del Issue)

| Ítem | Antes (V1.6.1) | Después |
|---|---|---|
| 1. Navegación | General con pestañas; finca con rama separada de párrafos `context-row` y barra de 6 botones con scroll horizontal | Un único renderer (`contextualExplorer`) para General y finca: pestañas **Distribución · Estimados Z26/27 · Suertes/Consultar fincas**, «Agrupar por» integrado (chips en PC, select en móvil). Mapa/Histórico/Exportar como acciones compactas en la banda |
| 2. Distribución finca | Filas de párrafo con barra y % | Tabla Categoría · Área (ha) · Participación (%) con TOTAL y nº de suertes por categoría; fila abre sus suertes (Volver regresa a la misma vista) |
| 3. Estimados finca | `ha válidas · t · TCH · % cobertura` por fila y texto «Área válida de molienda · toneladas autorizadas…» | Tabla Grupo · Área con estimado (ha) · Toneladas estimadas (t) · TCH estimado; en móvil Grupo + TCH con área/t debajo. TOTAL desde `summary()` del ámbito (nunca suma de TCH) |
| 4. Destino/semilla | Semilla `0.00 ha · N/D · N/D` | Semilla: área activa real y nº de suertes; toneladas/TCH «No aplica» (`data-status="na"`). Molienda sin estimado: «Pendiente» o «x ha sin estimado» |
| 5. Composición | «Detalle complementario» + botón «Composición y metodología» con fórmulas | «Composición de la finca»: barra proporcional Molienda/Semilla con ha, suertes y %, suertes sin área activa y distancia ponderada. Fórmulas solo en «¿Qué incluye el estimado?» (popover) |
| 6. Orden N.º de cortes | `sort(b.area-a.area)` → «Cortes 7+» antes que «Plantilla» | Orden fijo Plantilla → 2.º corte → Cortes 3–4 → 5–6 → 7+ (adicionales por número; «Sin clasificar» al final) en General y finca, Distribución y Estimados. Categorías siguen viniendo de `cropStage()` |
| 7. Buscador | Prioridad arriba solo con `:has([data-context="general"])`; en finca quedaba al final en PC | `#cronoQ` arriba en todas las vistas y anchos (orden explícito del grid). El SELECT `#cronoProducerSelect` se conserva como control interno oculto; «Selección múltiple» intacta |
| 8. Exportar | Botón «Informe» + botón «Informe» duplicado en la barra de finca | Un único «Exportar» (popover con PDF e imagen PNG originales) |

## Paridad de datos (motor oficial, generación `2026.10.25-aforo.1101`)

| Ámbito | Antes | Después |
|---|---|---|
| Finca 993 Pansaco · área activa | 368.44 ha | 368.44 ha |
| 993 · Molienda / Semilla | 359.30 ha (40) / 9.14 ha (2) | 359.30 ha · 40 suertes / 9.14 ha · 2 suertes |
| 993 · Estimado molienda | 359.30 ha · 17,452.08 t · 48.57 TCH | idéntico |
| 993 · Plantilla / 2.º / 3–4 / 5–6 / 7+ (TCH) | 75.00 / 55.00 / 36.66 / 51.31 / 48.16 (orden por área) | idénticos, en orden agronómico |
| Finca 10 El Salitre (captura 4) | Molienda 334.94 ha · 21,336.35 t · 63.70; Semilla AS `0.00 · N/D` | Molienda idéntica; Semilla AS 49.78 ha · 5 suertes · «No aplica» |
| General · estimado | 9,115.65 ha · 563,187.97 t · 61.78 TCH | idéntico; semilla 459.01 ha · 47 suertes informada aparte |

## QA

- `tools/qa-maestro-ux13-a.cjs`: 100/100 en 360, 390, 768, 1280 y 1536 px (pestañas, buscador arriba en General/finca/suerte/volver/recarga,
  sin scroll horizontal, orden agronómico, TOTAL = motor, Destino/Semilla, drill y Volver, Exportar PNG y PDF reales, mapa GIS, Suertes,
  selección múltiple, histórico, captura 4, sin errores de página).
- Suites: `npm test --prefix modules/produccion` 212/212 · `node --test tests/*.test.mjs` 160/160 · `check-release-policy`, `sync-versions`,
  `runtime-assets`, `production-integrity`, `check-context-hotfix` y validación TCH en verde.
- Smoke PWA: SW registrado, shell v1.6.2 y módulo listo dentro del iframe.

## Hallazgo preexistente (no corregido en la Etapa A)

Si se escribe en `#cronoQ` durante los ~300 ms posteriores a abrir una finca, el montaje asíncrono del informe cierra la lista de
sugerencias. Ocurre igual en V1.6.1; volver a escribir la reabre. Se deja documentado para no ampliar el alcance.
