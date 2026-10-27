# PR #45 · Jerarquía agronómica, ranking y KPI de finca

Base 81d6122. Mismo PR y rama, sin cambios al aforo, fuentes, motores, datos,
SW, actualizaciones, exportadores, otros módulos o versiones.

## Criterio y presentación

- `agronomicGroups()` calcula y ordena por área para superficies. El helper de
  presentación `orderAgronomicGroups(groups, 'estimateTch')` ordena los gráficos
  de rendimiento por TCH descendente **después** del cálculo. N/D al final;
  empate por etiqueta en español. No muta los grupos ni las filas originales.
- Los cinco KPI generales: área, TCH Z anterior, edad actual ponderada,
  TCH estimado, toneladas estimadas. Las tarjetas conservan sus fórmulas.
- Primero se muestran los cuatro paneles de superficies, en cuadrícula de dos
  columnas (una en móvil), sin estirar alturas. Después, bajo un encabezado
  discreto, los tres paneles de TCH estimado, en orden descendente.
- Superficies verdes; referencia histórica marfil/pizarra; edad/distancia
  neutras; estimado petróleo/niebla salvia; toneladas marfil/acento salvia y
  valor petróleo. Las etiquetas también distinguen el significado.
- Finca: área, TCH anterior, edad, distancia, TCH estimado y toneladas estimadas.
  El helper de toneladas reutiliza `summary(rows).estimateTons` del ámbito exacto
  e incorpora la cobertura en ayuda y metadatos auditables, sin subtítulo extra.
- Suerte: se conservan cosecha, tipo propuesto y Último Aforo. Seis tarjetas,
  tres filas de dos, ocho zafras y 18 columnas. No se modifica su fecha por toneladas.
- No cambia el significado de los pies de área; siguen sin la palabra TOTAL.

## Número de corte

Se conserva la validación semántica de `provenance.cut.header`, sus alias y
`raw` coincidente con el entero positivo `corte`. NC está en H en este snapshot;
no se impone posición fija. No se infiere desde edad, fecha o BQ.

1 = Plantilla; 2 = 2.º corte; 3–4; 5–6; 7+. Valores ausentes/ambiguos o sin
procedencia acreditada = Sin clasificar. Los rangos son disjuntos y exhaustivos
para el universo activo, con una única asignación por registro.

Cada cociente reutiliza toneladas autorizadas de molienda / área válida del
estimado. No incluye semilla en el denominador ni promedia TCH por suerte.
Los grupos sin denominador válido conservan N/D.

## Auditoría · generación 2026.10.25-aforo.1101

Conciliación independiente por registro, comparada contra los helpers. Conteo
de suertes incluye **activas** del rango; el área válida excluye semilla y toda
superficie fuera de molienda. Cobertura = área válida / área elegible de molienda.

| Rango (orden por TCH) | Suertes activas | Área activa ha | Área válida molienda ha | Toneladas | TCH | Cobertura |
|---|---:|---:|---:|---:|---:|---:|
| Plantilla (NC 1) | 215 | 2.030,30 | 1.643,05 | 123.466,71 | 75,14 | 100% |
| 2.º corte (NC 2) | 163 | 1.625,79 | 1.588,92 | 107.212,19 | 67,47 | 100% |
| Cortes 3–4 | 179 | 1.910,69 | 1.888,38 | 113.138,09 | 59,91 | 100% |
| Cortes 5–6 | 148 | 1.449,72 | 1.449,72 | 85.584,14 | 59,03 | 100% |
| Cortes 7+ | 290 | 2.558,16 | 2.545,58 | 133.786,84 | 52,56 | 100% |
| Total | 995 | 9.574,66 | 9.115,65 | 563.187,97 | 61,78 | 100% |

Sin clasificar: no hay suertes activas sin NC acreditado en este snapshot;
no se dibuja una categoría ficticia vacía. La regresión cubre dicho caso.

Ranking zonas: 1-Sur 71,55; 3-Norte 59,87; 2-Centro 59,30;
5-Productores 57,84. Ranking riego: Ventana 77,28; Goteo 75,50; Pivote 67,37;
Aspersion 63,77; Gravedad 60,16; Mini-Aspersion 39,01; Secano 38,64.
Los números son resultados auditados, no constantes introducidas en los gráficos.

Finca 494: 25,18 ha; TCH anterior 82,11; estimado 27,08. Toneladas:
3,17×25 + 11,55×25 + 1,82×30 + 1,40×30 + 7,24×30 = **681,80 t**.
49404A permanece Sin Caña/Baja definitiva, 0 ha, fuera de molienda. No se usa
25,18×27,08 redondeado ni el plan. Cobertura 100% de sus 25,18 ha de molienda.
Su propuesta de cosecha permanece en el registro y en la ficha individual.

Global: 64,08 TCH anterior y edad actual 7,94 meses al 26-oct-2026, cobertura
100% de 9.574,66 ha. 99336: 8,91 ha, 67,15 pasado, 65,00 estimado,
aforo 12-oct-2026; cosecha 24-dic-2026, Corte mecánico. Todo intacto.

## Pruebas y riesgos

- Producción 22 controles + 208; Shell/GEO 71; TCH validate + 91.
- Regresión: ranking opuesto al área, desempate, N/D, sin mutación; cada límite
  de rango, NC no acreditado/ambiguo, ausencia de estimado, generaciones mixtas,
  partición exhaustiva y sumas sin duplicidades; toneladas del ámbito de finca.
- QA local 1440×900, 1280×800 y 390×844: orden de KPI y bloques, rankings
  numéricos, cobertura, cinco rangos, colores semánticos, no overflow/recortes.
- Scripts inline, node --check, manifiesto runtime de 163 recursos y diff --check.
- QA HTTPS, PWA desde el HEAD anterior, PDF/PNG, reapertura, offline y selección
  múltiple se adjuntan al mismo PR con evidencias del HEAD final.

No se imputan valores faltantes; una agrupación sin fuente autorizada muestra
N/D. El conteo de activas no se confunde con las 948 suertes de molienda válida.
Edad depende del día; móvil se valida mediante Chromium emulado, sujeto a
aprobación visual del usuario en teléfono físico.
