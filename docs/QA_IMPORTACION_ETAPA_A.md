# QA Etapa A · importación del Maestro

Fecha local: 24-oct-2026. Base: `74231a1e4cbc7ff4e0207017e104d036d9c8f02e`.
Rama: `codex/maestro-importacion-etapa-a`.

## Resultados

- Producción: `npm test --prefix modules/produccion`: 22 controles + 159/159 tests
  (23 nuevos de contrato, detección, identidad, estados, fechas, fracciones y totales).
- Shell/GEO: `node --test tests/*.test.mjs`: 63/63.
- TCH: `npm run validate --prefix modules/tch` y `npm test --prefix modules/tch`:
  aprobados, 91/91. No se modificó ningún archivo TCH.
- Versiones, política por ámbito y manifiesto de 162 recursos locales: aprobados.
- `node --check` en JS/MJS/CJS modificados/nuevos y `git diff --check`: aprobados.
- Python GEO: intento de `python -m unittest discover -s tools/geo/tests -v`
  bloqueado en importación por `ModuleNotFoundError: No module named 'geopandas'`.
  No se instalaron dependencias ni se modificó el pipeline. No se acredita 5/5 Python.
  La geometría y sus hashes se comprueban en las suites JavaScript, aprobadas.

## Chromium real

`tools/qa-operational-import.cjs`, origen local aislado, contexto nuevo, desktop
1440×900 y móvil 390×844. Solo el perfil de QA recibe el marcador de desbloqueo
para probar administración; antes se acredita rechazo con el panel bloqueado.
No se usan ni borran biometrías, cachés o IndexedDB del perfil del usuario.

Ocho grupos:

1. Permisos: importar bloqueado antes de leer/aplicar; baseline intacto.
2. Libro completo: detección por contenido, elección explícita de inventario,
   plan opcional de 1.050 líneas, preview sin mutación y sin aplicar sin aprobación.
3. Aplicación aprobada: 1.046 inventariadas / 1.053 catálogo / 995 activas / 7 ausentes.
   9.672,13 ha inventario; 9.574,66 activas; 9.126,60 molienda; 563.187,9696909501 t;
   TCH 61,708409450501826. 49404A y 2003 conservan los atributos conciliados.
4. Fallo de almacenamiento simulado después de preparar el respaldo: aborta
   toda la transacción; no hay mezcla de generaciones.
5. Cierre y reapertura completamente offline tras precarga: generación, plan e
   Histórico íntegros. Rollback recupera el Cronológico inicial de 10.030,65 ha.
6. Duplicado sintético: rechazo sin cambiar vista ni dataset persistido.
7. Extracción con hoja renombrada, columnas invertidas y encabezados equivalentes,
   cargada por la entrada de Excel anterior: mismas cifras y aprobación atómica.
8. SHA-256 de los dos Excel originales sin cambios; ninguna excepción JavaScript.

Se compara `JSON.stringify(APP_DATA)` antes, después, offline y tras rollback:
idéntico. No se ejecuta una importación histórica ni se imputan valores.

Evidencias en `C:\Users\ctije\Videos\CASUR_ETAPA_A_QA\checkpoint-final\`:
PNG `preview-desktop`, `applied-desktop`, `offline-mobile`, `rollback-mobile`,
`preview-mobile-renamed`, `quality-desktop`, `inactive-49404A`; JSON `results`, `reconciliation-applied`,
`source-sha256`, `page-exceptions`. Logs en la carpeta superior.
La auditoría/matriz originales no se recalcularon ni sobrescribieron.

Reproducción con Playwright externo en NODE_PATH, Chromium en
CASUR_CHROME_EXECUTABLE y CASUR_QA_OUT fuera del repositorio:
`node tools/qa-operational-import.cjs RUTA_EXTRACCION RUTA_LIBRO_COMPLETO`.
`CASUR_PREVIEW_URL` permite elegir el servidor de QA. No se publican los fixtures
derivados de los Excel reales; quedan exclusivamente en ese directorio local.

## Regresión de exportaciones y navegación

`modules/produccion/tools/qa-multifinca-recovery.cjs`: descargas reales de PDF y PNG
individuales, Cronológico, multifinca, dos fincas completas y PDF offline dentro
del shell; desktop/móvil sin desbordamiento. Consola de excepciones vacía.
Concilia caso B: 188,84 ha/zafra, 48,92 TCH y 108,56 KATM. Los exportadores no
incorporan el panel de importación, marcado no-print/export-excluded.
Resultados y archivos en `CASUR_ETAPA_A_QA\exports\`.

## Límites y revisión pendiente

- No hay prueba física Android/iOS ni instalación/despliegue de producción.
- Los avisos por AE1, edades, destino/clase y cobertura no son correcciones del
  archivo original. El usuario debe revisarlos antes de aprobar datos reales.
- El formato histórico ancho y el importador masivo histórico permanecen fuera de
  esta migración; el histórico largo se reconoce como referencia y no se aplica.
- La UI ampliada de Estimados/plan es Etapa B. Aquí se guardan contrato y procedencia,
  incluidas campañas futuras sin etiquetarlas como 26/27.
- Las generaciones se conservan en IDB y pueden aumentar el almacenamiento local;
  un fallo de cuota aborta, no limpia bases ni sustituye parcialmente el actual.
- Esta validación aplica datos reales únicamente dentro de un contexto de QA
  desechable. No modifica datasets oficiales, el perfil del usuario ni main.
