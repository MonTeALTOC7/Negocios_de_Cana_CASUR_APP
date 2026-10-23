# Histórico gerencial V2.7

Base: PR #35, `11ffdfaa10bc5c835ab205ac612757e7d61efc4a`.
Rama hija: `codex/historico-gerencial-v2-7`. Sin merge ni despliegue.

## Cambios focales

- Producción histórica / Histórico del período seleccionado: contadores de zafras
  observadas y solicitadas, singular, discontinuidades y falta de registros explícitos.
- Área histórica / Área del período, TCH, KATM y TAH: solo etiquetas; motor intacto.
- Fincas del informe: franja horizontal, nombre destacado, código secundario,
  alcance íntegro y acento del color de cada finca, también después de limpiar el PDF.
- Gráficos completos: misma función ponderadora, con todas las zafras del ámbito,
  no las del filtro. Serie y referencia invariantes al cambiar únicamente el período.
  El valor de referencia se presenta una sola vez en la cabecera: evita cubrir puntos
  y conserva el algoritmo aprobado de colocación de valores. Leyenda TCH/KATM por zafra.
- Mapa: inventario cargado del Cronológico mediante `CASUR_PRODUCTION_GEO.currentLotIds`.
  Selección analítica, inventario, geometrías, destacados, contexto e históricos fuera
  del inventario permanecen separados. Un clic cartográfico solo identifica; no selecciona
  para el cálculo. La caché incluye inventario y metadata, además de la selección.
- Opción `contextualFeature` del visor: gris, relleno mínimo, halo tenue y etiquetas
  secundarias después de las principales, solo si caben dentro. Por defecto no cambia
  el comportamiento de los demás visores. No modifica coordenadas ni geometrías.
- Leyenda funcional y atribución separadas. Faltantes actuales se avisan; códigos
  y discrepancias históricas quedan en detalle técnico, no en el pie del PDF.

## Fuente temporal y cobertura real

Cronológico oficial cargado: `dataVersion=2026.09.06-siagri.1415`,
`publishedAt=2026-09-06T20:16:06.485Z`. No contiene una zafra explícita acreditada.
Se muestra **referencia cargada · publicación 2026-09-06**, sin inferirla del reloj
ni del Histórico. No se atribuye vigencia a una zafra no documentada.

Caso A: Dolores 9/9 suertes del inventario con geometría, todas destacadas;
Peirano 11/11, 01/04/04A destacadas y otras 8 contextuales.
25608–25613 están fuera del inventario actual; siguen en el universo histórico,
pero no son faltantes de la cartografía actual. Si no hay inventario, no se
sustituye silenciosamente por todos los lotes históricos.

## Conciliación (motor sin cambios)

| Caso / ámbito | Área media | TCH | KATM | TAH | Km vigente |
|---|---:|---:|---:|---:|---:|
| A histórico, 10 zafras | 204.26 | 61.20 | 108.63 | 6.65 | 36.10 |
| A período, 5 zafras | 187.41 | 53.57 | 105.66 | 5.66 | 36.10 |
| B período, 3 zafras | 188.84 | 48.92 | 108.56 | 5.310840138 aprox. | 36.10 |

## Reproducción

```powershell
npm test --prefix modules/produccion
npm run validate --prefix modules/tch
node --test tests/*.test.mjs
node --check shared/geo/geo-map.js
node --check modules/produccion/tools/qa-v27.cjs
node --check modules/produccion/tools/qa-gerencial-v2.cjs
git diff --check
```

QA de navegador: configurar `NODE_PATH` con Playwright/Sharp externos,
`CASUR_CHROME_EXECUTABLE`, `CASUR_PREVIEW_URL` y `CASUR_QA_OUT` fuera del repositorio.
Ejecutar `qa-v27.cjs`, `qa-gerencial-v2.cjs` (CASUR_QA_CASES=A,B) y
`qa-multifinca-recovery.cjs`. No escriben datasets oficiales.

Resultados: Producción 22 controles + 134 tests; TCH estática + 91 tests;
Shell/GEO 52 tests. Sintaxis inline incluida en los 22 controles.
QA 1440x900 y 390x844: KPI, referencias completas, períodos 1/3/5/10,
personalizado no contiguo y dos solicitudes sin registros, interacción contextual,
sin desbordamiento horizontal ni errores de página. Gaps y geometrías sin
mutación también cubiertos por pruebas unitarias.

PDF A y B en ambos tamaños: ejecutivo 3 páginas, completo 6. A color y escala de
grises; páginas completas, gráficos y tablas sin cortes, filas sin pérdidas ni
duplicación. El anexo Dolores ocupa dos hojas según el paginador heredado;
no se comprimió contenido ni se alteró el planificador para reducir esa cantidad.
Regresión: fichas finca/suerte, PNG/PDF individuales, Cronológico, zonas, shell y
recarga offline precargada con descarga de PDF.
Offline focal: 20 geometrías conservadas, Dolores 9 destacadas, Peirano 3
destacadas + 8 contextuales, TCH 53.57. Fallos simulados de Imagery y Transportation
rechazan la captura incompleta; sin red se descargó PDF sin fondo solo después
de aceptar la confirmación. Comparación captura/raster a 1400x1000 y 1100x800.

## Evidencias y límites

`C:/Users/ctije/Videos/CASUR_V27_QA/`: final (PDF/PNG y JSON numéricos),
focal-final (pantalla/contadores/cobertura), regresion, logs y hojas de contacto.
Impresión física pendiente del usuario. Las etiquetas secundarias pueden omitirse
a escalas pequeñas; el polígono sigue siendo interactivo y el enfoque por finca
permite identificarlo. Mosaicos de terceros dependen de red/caché; la exportación
sin fondo requiere aceptación expresa, como en V2.6.

Limitación heredada, fuera de este alcance: el PNG cartográfico **individual** de
Cronológico presenta una desalineación ya reproducida en la base anterior y
documentada en V2.6. El capturador híbrido multifinca no usa ese rasterizador legado.
No se declara corregida ni aprobada visualmente aquella exportación individual.

Sin cambios en el motor, datos oficiales, fórmulas, versiones, Service Worker,
IndexedDB, TCH, Maestro ni main. Sin dependencias nuevas.
