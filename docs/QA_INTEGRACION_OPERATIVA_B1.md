# Etapa B1 · integración operativa del aforo

Continuación del PR #43 sobre la generación de Etapa A. El Excel original y la
auditoría detallada permanecen fuera del repositorio en `CASUR_ETAPA_A_QA`.
La aplicación de una generación sigue siendo local, explícita y reversible;
este PR no publica un dataset SIAGRI nuevo.

## Brechas cerradas sin cambiar la composición de las fichas

- El selector del Cronológico reconstruye las opciones al aplicar o recuperar
  una generación. Antes conservaba nombres y áreas de la vista anterior.
- Las tarjetas existentes distinguen área activa, área inventariada y molienda.
  El total de suertes continúa representando el catálogo consultable y muestra
  cuántas están activas o ausentes.
- TCH anterior es una referencia independiente del estimado. En los agregados
  visibles se pondera por el área activa vigente y se indica esa base; no se
  presenta como una nueva cosecha ejecutada.
- Los estimados usan únicamente participantes de Molienda, su área válida y la
  zafra de la fuente. Otra campaña no se rotula automáticamente como 26/27.
  Las toneladas del plan siguen siendo un escenario separado.
- La ficha y el mapa muestran la clase de la fuente junto al estado
  administrativo cuando difieren. `49404A` sigue clasificada `Sin Caña`, con
  cero hectáreas activas, y conserva su `Baja definitiva` previa sin reactivarse.
- La franja de versión diferencia inmediatamente la generación local aprobada
  de los datos compartidos publicados; no altera la versión oficial remota.

El detalle de conciliación y procedencia continúa en el Centro Maestro. No se
agregaron controles administrativos a las fichas normales ni se cambió la
estructura de tarjetas, mapas, filtros, tablas o exportadores.

## Control numérico

| Indicador | Antes (datos compartidos) | Generación local aprobada |
|---|---:|---:|
| Catálogo consultable | 1.053 | 1.053 |
| Inventariadas en fuente nueva | — | 1.046 |
| Ausentes conservadas | — | 7 |
| Área mostrada como activa (ha) | 10.030,65 | 9.574,66 |
| Área inventariada en fuente nueva (ha) | — | 9.672,13 |
| Área de molienda (ha) | — | 9.126,60 |
| Suertes activas / molienda / semilla | — | 995 / 949 / 46 |
| Toneladas estimadas de molienda (t) | — | 563.187,9696909501 |
| TCH estimado de molienda | — | 61,708409450501826 |
| Líneas de plan / identidades | — | 1.050 / 1.046 |

Los valores completos permanecen en `CRONO_DATA.operational.totals`; las tarjetas
redondean para lectura. El área de destino operativo puede diferir del área de
clasificación de zafra por la incidencia pendiente `2003` (destino Semilla,
clasificación Molienda, estimado cero). No se ajusta de oficio.

## Reproducción y límites

La prueba `tools/qa-operational-import.cjs` toma las rutas de los dos Excel como
argumentos, `CASUR_QA_OUT` fuera del repositorio y `CASUR_PREVIEW_URL`. Usa un
contexto nuevo de Chromium; verifica permisos, importación, conciliación,
selector, inicio, finca, suerte, zona, PDF/PNG, tableta, móvil, fallo atómico,
reapertura offline, rollback, detección por contenido y hashes de fuentes.
Los archivos oficiales no se copian al repositorio ni al perfil real.

La ejecución final aprobó los diez grupos de QA. Las evidencias locales están
en `C:\Users\ctije\Videos\CASUR_ETAPA_A_QA\b1-verified2`:
`results.json`, `reconciliation-applied.json`, capturas `b1-home-1440.png`,
`b1-farm-390.png`, `b1-farm-768.png`, `b1-zone-1440.png`,
`inactive-49404A.png`, `offline-mobile.png`, `rollback-mobile.png`,
`b1-cronologico-993.png` y `b1-cronologico-993.pdf`. El PDF final se
renderizó e inspeccionó en `pdf-render/page-1.png` y `page-2.png`: ambas
páginas contienen información, sin filas partidas ni recortes visibles.
`page-exceptions.json` quedó vacío. El QA móvil usa Chromium emulado;
la comprobación física en un teléfono sigue pendiente.

Comandos de regresión: `npm test` en Producción (22 controles, 159 pruebas),
`node --test tests/*.test.mjs` en la raíz (63), `npm run validate` y `npm test`
en TCH (91 cada uno), `node --check` de JS/MJS/CJS afectados,
`node tools/runtime-assets.mjs`, `node tools/sync-versions.mjs` y
`git diff --check`. Los PDF/PNG cronológicos se descargan en el perfil aislado;
el Histórico `APP_DATA` se compara byte a byte antes/después y offline.

Python GEO sigue bloqueado por ausencia de `geopandas` en el entorno local;
las geometrías no se modificaron. No hay prueba física de un dispositivo móvil
ni aprobación para aplicar los datos al perfil de producción.
