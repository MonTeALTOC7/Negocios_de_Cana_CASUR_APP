# PR #45 · Presentación y análisis agronómico del Cronológico

Alcance: general, finca y suerte. Misma rama y preview, sin modificar motores,
snapshot aprobado, datos oficiales, SW, versiones ni exportadores.

## Presentación

- Suerte: tres filas de dos tarjetas: área/TCH pasado, variedad/edad actual,
  TCH estimado/fecha para cosecha. Se mantiene este orden también en móvil.
- Finca: mantiene edad y distancia ponderadas; estimado y cosecha consecutivos.
  No se sustituye la variedad dominante por una métrica individual.
- Se eliminan subtítulos de inventario/molienda/referencia, badges redundantes
  y contadores administrativos del título «Detalle por suerte».
- Estimado: valor, Último Aforo y fecha acreditada. Varias fechas de cosecha
  siguen siendo «Varias fechas», con detalle por suerte; no se promedian fechas.
- Fondo salvia #E4EAE9, acento #86A0AA, texto petróleo #1F4E5C y carbón #30393D.
  Contraste sobre el fondo: petróleo 7,49:1, carbón 9,70:1. Se retira la regla
  antigua que forzaba azul al estimado individual. No se cambian exportadores.

## Análisis general

Los cinco KPI generales mantienen sus fórmulas y valores. Debajo se agregan tres
paneles compactos, utilizando `CASUR_CRONO_PARTICIPATION.summary()` por grupo:

TCH estimado = toneladas autorizadas de molienda / área válida estimada.

No se promedian TCH por suerte. Semilla y otras superficies no elegibles quedan
fuera de ese cociente. Se mantienen los controles de SHA, zafra y generación;
una mezcla de generaciones no produce estimados aparentemente autorizados.
Cada grupo expone toneladas, área válida, área de molienda y cobertura en
`data-group-audit` y en la ayuda/nombre accesible, sin diagnósticos extensos.

La etapa se acredita con `provenance.cut.header`, admitido por los alias del
importador, y `raw` coincidente con `corte`: 1 = Plantilla, enteros >1 = Soca.
En el snapshot aprobado el campo es **NC, columna H (8)**, distinto de Edad y
del tipo de corte propuesto BQ. Valores ambiguos, no positivos, fraccionarios o
sin procedencia se mantienen como «Sin clasificar»; no se infiere desde la edad.
No se agregan intervalos de edad que dupliquen el análisis solicitado.

## Conciliación independiente · aforo 2026.10.25-aforo.1101

Se comparó cada grupo con una suma independiente por fila de área y toneladas,
utilizando la elegibilidad del motor vigente y sin modificar registros.

| Zona | TCH estimado |
|---|---:|
| 1-Sur | 71,55 |
| 2-Centro | 59,30 |
| 3-Norte | 59,87 |
| 5-Productores | 57,84 |

| Riego (categorías reales) | TCH estimado |
|---|---:|
| Gravedad | 60,16 |
| Goteo | 75,50 |
| Secano | 38,64 |
| Aspersion | 63,77 |
| Pivote | 67,37 |
| Ventana | 77,28 |
| Mini-Aspersion | 39,01 |

| Etapa | Área activa ha | Área válida molienda ha | Toneladas | TCH estimado |
|---|---:|---:|---:|---:|
| Plantilla | 2.030,30 | 1.643,05 | 123.466,71 | 75,14 |
| Soca | 7.544,36 | 7.472,60 | 439.721,26 | 58,84 |
| Total | 9.574,66 | 9.115,65 | 563.187,97 | 61,78 |

Cobertura del aforo sobre área de molienda: 100% en todos los grupos de zona,
riego y etapa. No hay área activa sin NC acreditado en esta generación; los
tests sí cubren ausencia/ambigüedad, que se presenta como «Sin clasificar».

Los cuatro paneles de área (zona, riego, tenencia y destino) usan exactamente
`participation(row).activeArea`, con una sola categoría por registro, todas las
categorías visibles y un TOTAL propio: **9.574,66 ha en cada panel**. Los blancos
son «Sin clasificar». No se truncan a ocho categorías ni se mezclan ámbitos.

Destino conserva el valor registrado (Molienda 9.118,59; Semilla AS 412,52;
Semilla 43,55 ha), incluidas las discrepancias originales. La participación
efectiva sigue respetando 2003 Semilla y 1927 Molienda (430,50 t); el panel no
reclasifica sus datos para hacerlos coincidir con otros agregados.

Finca 494: área 25,18 ha, TCH pasado 82,11, estimado 27,08; varias fechas.
99336: 8,91 ha, TCH pasado 67,15, estimado 65,00; aforo 12-oct-2026,
cosecha 24-dic-2026, Corte mecánico. Ocho zafras y 18 columnas preservadas.

## Pruebas y evidencias

- Producción: 22 controles + 205 tests; Shell/GEO: 71; TCH validate + 91.
- Estática, scripts inline, `node --check`, manifiesto runtime de 163 recursos,
  `git diff --check` y builder/verificador de preview.
- Regresiones sintéticas: denominadores desiguales, semilla, inactivas/ausentes,
  falta de estimado, generaciones mezcladas, NC ambiguo/no acreditado, más de
  ocho categorías y áreas sin clasificación; sin mutar los registros.
- Chromium aislado: general, finca 494 y suerte 99336 a 1440×900 y 390×844.
  Aserciones numéricas de tarjetas/gráficos/totales y de posiciones/colores.
- Las evidencias HTTPS del HEAD final, actualización desde 20bc0c5, preservación
  de almacenamiento, offline y descargas se publican en el mismo PR.

La simulación móvil no sustituye la aprobación visual en un teléfono físico.
La edad actual continúa cambiando con la fecha de consulta.
