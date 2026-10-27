# PR #45 · KPI generales del Cronológico

Alcance: exclusivamente la vista general sin finca/suerte seleccionada. Se
conservan los seis KPI individuales, tablas, Histórico y exportaciones.

Orden: Área activa; TCH zafra pasada 25/26; TCH estimado de la zafra efectiva;
Ton. estimadas de esa zafra; Edad ponderada actual. Sin subtítulos secundarios.

## Procedencia y denominadores

- Toneladas: `CASUR_CRONO_PARTICIPATION.summary(rows).estimateTons`, ya validado
  por procedencia, zafra, generación y participación en molienda. No se usa el
  TCH global redondeado, semilla ni toneladas del plan.
- Edad: se pasa la función `ageMonths()` de la ficha individual al helper de
  presentación `currentAgeSummary()`. Se reutilizan sus fechas base, fecha local
  actual y duración mensual (30,4375 días), sin introducir una edad histórica o
  proyectada. No se modifica el cálculo individual.
- Ponderación: Σ(área activa × edad actual válida) / Σ(área activa con edad válida).
  El motor existente decide el área activa; incluye semilla activa y excluye
  ausentes/inactivos. Solo áreas positivas. Una renovación sin fecha de siembra
  es un estado, no una observación de edad cero: queda sin edad válida.
- Se conservan numerador sin redondear, área activa total, área válida, número de
  suertes y cobertura en `data-crono-current-age`. El área y la cobertura también
  están en `title` y en el nombre accesible de la tarjeta enfocable.
- Política conservadora de representatividad: solo se presenta la media global
  con cobertura completa del área activa (tolerancia numérica de 1e-7 ha).
  Si es parcial, se muestra N/D y se explica «Cobertura de edad incompleta» en
  la ayuda; nunca se imputan edades ni se oculta una media parcial como total.

## Conciliación · 26-oct-2026

Generación `2026.10.25-aforo.1101`, sin modificar el snapshot recuperado:

| Indicador | Resultado |
|---|---:|
| Área activa | 9.574,66 ha |
| TCH zafra pasada 25/26 | 64,08 |
| TCH estimado 26/27 | 61,78 |
| Toneladas estimadas de molienda | 563.187,97 t |
| Numerador de edad | 76.013,8194661191 ha·mes |
| Área con edad válida / activa | 9.574,66 / 9.574,66 ha |
| Suertes con edad válida / activas | 995 / 995 |
| Cobertura | 100% |
| Edad ponderada sin redondear | 7,9390620101516856 meses |
| Edad presentada | 7,94 meses |

La edad cambia con la fecha de consulta, igual que en la ficha individual.
Se mantienen 2003 Semilla activa fuera de molienda y 1927 Molienda, 430,50 t.

## Verificación

- `npm test --prefix modules/produccion`: 22 controles + 201 tests.
- `node --test tests/*.test.mjs`: 71 tests Shell/GEO.
- `npm run validate --prefix modules/tch`: estática + 91 tests.
- `node --check modules/produccion/js/casur-enhancements.js`.
- `node tools/runtime-assets.mjs`; `node tools/sync-versions.mjs`.
- `git diff --check` y build/verificador de preview (163 recursos).
- Chromium aislado 1440×900 / 390×844: títulos, valores, cobertura, sin overflow,
  ficha 99336 (seis KPI, ocho zafras originales y 18 columnas).

El manifiesto de hashes se renueva para los dos recursos modificados. No cambia
APP_VERSION ni el mecanismo por HEAD ya implementado para el SW de preview.
No cambian motores, datos, IndexedDB, cachés de usuario ni versiones oficiales.
Las evidencias de publicación y de la actualización HTTPS desde d900775 se
adjuntan al mismo PR; la prueba usa una copia de un perfil Chromium de QA.
