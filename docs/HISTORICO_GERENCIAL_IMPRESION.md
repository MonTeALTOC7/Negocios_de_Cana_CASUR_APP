# Histórico gerencial: cierre de impresión V2.2

Base: PR #29, `56a4c246c895dec04d889eb1bdf893f12f361097`.
Rama hija: `codex/historico-gerencial-impresion`. Sin merge ni despliegue.

## Alcance

- PDF ejecutivo y completo: tarjetas blancas, texto oscuro, acentos verdes y diferenciación del período con borde lateral y fondo casi blanco.
- Compactación moderada del espaciado, conservando tamaño numérico y unidades debajo.
- Selección analizada en líneas explícitas de nombre, código y alcance; reutiliza la lógica existente de suertes.
- La aplicación conserva sus tarjetas verdes. No cambia el motor, selección, fórmulas, datos, versiones, Service Worker ni planificador de páginas.

## Verificación realizada

Fecha de evidencias: 22 de octubre de 2026.

| Comando | Resultado |
| --- | --- |
| `npm test --prefix modules/produccion` | 22 controles y 122/122 tests |
| `npm run validate --prefix modules/tch` | Validación y 91/91 tests |
| `node --test tests/*.test.mjs` | 48/48 Shell/GEO |
| `node --check modules/produccion/tools/qa-gerencial-v2.cjs` | Aprobado |
| `node --check modules/produccion/tests/managerial-presentation.test.mjs` | Aprobado |
| `git diff --check` | Sin errores |

QA reproducible: `node modules/produccion/tools/qa-gerencial-v2.cjs`, con `CASUR_PREVIEW_URL` apuntando al preview y `CASUR_QA_OUT` a una carpeta nueva de evidencias. Requiere Playwright, sharp y Poppler disponibles en el entorno. No sobrescribir los PDF finales al repetirlo.
Regresión: `node modules/produccion/tools/qa-multifinca-recovery.cjs`.

Caso A: Dolores completa y Rancho Peirano 98301, 98304, 98304A, zafras 21/22 a 25/26. Histórico CASUR: área 204.26, TCH 61.20, KATM 108.63, TAH 6.65. Período: 187.41, 53.57, 105.66, 5.66; distancia 36.10 km. Ejecutivo de 2 páginas y completo de 5. Caso B: 188.84 ha/zafra, 48.92 TCH, 108.56 KATM y 36.10 km.

Se descargaron 12 PDF y revisaron las 37 páginas renderizadas, con pruebas de escritorio 1440x900 y móvil 390x844. Sin errores de consola, desbordamiento horizontal ni etiquetas encimadas. El control de paginación acredita cero filas faltantes/duplicadas. Los KPI de exportación tienen fondo blanco y contraste numérico superior a 15:1. Se inspeccionaron también las siete páginas definitivas del caso A simuladas en grises.

Regresiones aprobadas: PDF/PNG individual de finca, PDF de suerte, PDF/PNG multifinca, Cronológico, zonas, shell con un iframe y recarga offline con recursos precargados, incluida descarga PDF.

Evidencias locales: `C:\Users\ctije\Videos\CASUR_Gerencial_Impresion_QA\`. Los resultados detallados y conciliaciones están en `final/qa-results.json`; logs en `logs/`; exportaciones anteriores conservadas en `regresion/`.

## Límites

La escala de grises es una simulación digital. La impresora física de CASUR y teléfonos físicos no fueron probados. Los gráficos mantienen la codificación y colores previamente aprobados; no se rediseñaron. La prueba offline requiere precarga previa, no promete un primer acceso sin conexión.
