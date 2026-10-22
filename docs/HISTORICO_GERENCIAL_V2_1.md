# Histórico gerencial V2.1 - presentación

Base: PR #28, `0b2c8b4c308c424f2caefe9aba39f3442434a4ae`.
Rama hija: `codex/historico-gerencial-v2-1`. Sin merge ni despliegue.

## Alcance

Presentación del consolidado multifinca y PDF ejecutivo/completo. No cambia
`historical-engine.js`, datos, selección, fórmulas, gráficos históricos,
escalas de barras, planificador PDF, fichas individuales ni otros módulos.

- Histórico CASUR y Histórico del período seleccionado reutilizan el modelo dual.
- Área histórica / Área del período conservan media por zafra y acumulado.
- Número separado de unidad, acento verde, distancia compacta con procedencia
  accesible y cobertura parcial visible cuando corresponde.
- Selección: se abrevia solo prefijo de finca exacto, numérico, seguido por dos
  dígitos y sufijo alfabético opcional. Ceros/sufijos se conservan como cadenas.
  Cualquier estructura no reconocida mantiene el identificador completo.
- El rango completo usa extremos reales; si hay discontinuidad informa cuántas
  zafras se observaron. El período enumera las zafras seleccionadas.
- Los anexos comparten las tarjetas; distancia queda fuera. Edad, CodSuerte y
  trazabilidad permanecen en tablas. Cada finca inicia en página nueva.
- TAH sigue siendo azúcar equivalente derivada: suma de toneladas por KATM/1000
  dividida por área válida compatible; no se promedian cocientes.

## Validación del 22 de octubre de 2026

Comandos desde la raíz:

```powershell
npm test --prefix modules/produccion
npm run validate --prefix modules/tch
node --test tests/*.test.mjs
node --check modules/produccion/tools/qa-gerencial-v2.cjs
node --check modules/produccion/tests/managerial-presentation.test.mjs
git diff --check
```

Producción: 22 controles y 120/120 tests. TCH: validación y 91/91.
Shell/GEO: 48/48. Los scripts inline se compilan dentro de la validación estática.

QA Chromium aislado a 1440x900 y 390x844:

```powershell
# Playwright y Sharp externos; no agregar dependencias al proyecto.
$env:CASUR_QA_OUT='C:/Users/ctije/Videos/CASUR_Gerencial_V21_QA/definitivo'
$env:CASUR_PREVIEW_URL='http://127.0.0.1:4282/'
node modules/produccion/tools/qa-gerencial-v2.cjs
node modules/produccion/tools/qa-pdf-evidence.cjs
# Usar otra carpeta de salida para las regresiones individuales/offline.
node modules/produccion/tools/qa-multifinca-recovery.cjs
```

Casos A/B, una/tres/cinco fincas y personalizado 19/20 + 25/26:
12 PDF reales, 37 páginas renderizadas y revisadas. A y B mantienen 2 páginas
ejecutivas y 5 completas en ambos tamaños. Sin filas faltantes/duplicadas,
desbordamiento de página o colisiones entre etiquetas de barras.
Se retiró un encabezado redundante del bloque KPI de anexos y se compactaron
sus márgenes para conservar la paginación anterior; el planificador no cambió.

| Caso | Área media | TCH | KATM | TAH | Km vigente |
|---|---:|---:|---:|---:|---:|
| A, histórico CASUR | 204.26 | 61.20 | 108.63 | 6.65 | 36.10 |
| A, últimas 5 | 187.41 | 53.57 | 105.66 | 5.66 | 36.10 |
| B, últimas 3 | 188.84 | 48.92 | 108.56 | 5.310840138... | 36.10 |

Se verifica igualdad numérica pantalla/PDF, inmutabilidad del histórico ante
cambios de período, selección parcial, N/D, selección abreviada, unidades debajo
del número y cuatro KPI sin distancia en cada anexo.
Regresiones individuales PNG/PDF, Cronológico y análisis por zona aprobadas.
Shell móvil con un iframe: recarga offline tras precarga y descarga PDF aprobadas.

## Evidencias y límites

Carpeta: `C:/Users/ctije/Videos/CASUR_Gerencial_V21_QA`.
`definitivo/` contiene los PDF/PNG aprobados y conciliaciones JSON.
`final/` es la iteración inicial de diagnóstico, NO la entrega final.
`regresion/` contiene exportaciones individuales y evidencia offline.
El ZIP final incluye manifiesto SHA-256 y antes/después de V2/V2.1.

QA móvil emulado en Chromium, no dispositivo físico ni Safari. La prueba offline
requiere caché previamente cargada; no acredita primer acceso sin red. El preview
es local y aislado por origen/puerto, no un despliegue. Los saltos de anexos y
gráficos atómicos pueden dejar espacio inferior; no se añade ninguna página
respecto a V2 ni se recorta contenido para rellenarlo.
