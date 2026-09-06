# PROJECT STATUS — Control y Seguimiento de Insumos CASUR

## Estado: ✅ Versión 1.0 funcional

## Trabajo completado
- [x] Inspección de archivos Excel (SIAGRI y Maestro)
- [x] Análisis de estructura de datos (ANALISIS_DATOS.md)
- [x] Definición de reglas de negocio (REGLAS_NEGOCIO.md)
- [x] Modelo de datos: eventos + productos (2 tablas lógicas)
- [x] Pipeline de procesamiento Python
- [x] Normalización de suertes, haciendas, unidades
- [x] Motor de estados (EJECUTADA, RESERVADA, SUSPENDIDA, INCONSISTENTE, SIN CLASIFICAR)
- [x] Agrupación de eventos por Documento+Hacienda+Suerte+Labor
- [x] Regla de mezclas: área NO se suma ni divide entre productos
- [x] Exclusión permanente de Sucuya (código 16)
- [x] Corrección de fechas con error de tipeo (0206 → 2026)
- [x] PWA completa (HTML+CSS+JS single-file)
- [x] Módulo Inicio Ejecutivo con KPIs
- [x] Módulo Explorador Operativo con filtros y expansión de mezclas
- [x] Módulo Productos con agregación por producto
- [x] Módulo Productores con fichas
- [x] Módulo Administración con validaciones
- [x] Selector de alcance (Productores / Todo CASUR / Zona)
- [x] Service Worker con cache-first/network-first
- [x] Manifest PWA instalable
- [x] IndexedDB para modo offline
- [x] Exportación CSV/Excel
- [x] Exportación WhatsApp
- [x] Gráficos de barras (área por labor, productos, productores, estados)
- [x] Barra de progreso de ejecución
- [x] Indicadores de pendientes por antigüedad
- [x] Banner de instalación (Android + iOS)
- [x] Diseño responsive desde 360px
- [x] Colores corporativos CASUR extraídos de app de referencia
- [x] Marca CT discreta
- [x] JSON de datos generados a partir del archivo real
- [x] Script de procesamiento reutilizable
- [x] 25 pruebas ejecutadas, 0 fallidas
- [x] README en español
- [x] .nojekyll para GitHub Pages
- [x] 404.html para SPA routing

## Decisiones adoptadas
1. Hoja REPORTE (9,877 filas, todas las zonas) como fuente principal
2. Hoja REPORTE(2) descartada (solo Productores, datos ya en REPORTE)
3. Hoja TD descartada (tabla dinámica resumen)
4. event_id = secuencial E000001..E00NNNN (interno)
5. Clave de agrupación = Documento + Hacienda + Suerte + Labor
6. Maestro deduplicado: hoja Productores tiene prioridad sobre REPORTE
7. Fechas 0206 → corregidas a 2026 (+1820 años)
8. Unidad de medida siempre HA en este reporte
9. Contraseña admin: 151021 (misma que app de riego)
10. Single-file HTML sin dependencias externas
11. Colores: navy #092f4d, blue #0b76b7, cyan #38bde5, green #6aa744

## Pruebas ejecutadas: 25/25 ✅
- T01: Reserva con 1 producto ✅
- T02: Evento con 4+ productos, área correcta ✅
- T03: Eventos distintos misma suerte mismo día ✅
- T04: Todos los eventos tienen documento ✅
- T05: Existen eventos ejecutados ✅
- T06: Existen reservas pendientes ✅
- T07: Existen reservas suspendidas ✅
- T08: Alertas de fechas contradictorias ✅
- T09: Suertes alfanuméricas preservadas ✅
- T10: Detección de suertes sin maestro ✅
- T11: Detección de área mayor al maestro ✅
- T12: No duplicación al recargar ✅
- T14: Exclusión de Sucuya ✅
- T15: Unidades de medida ✅
- T19: Datos < 10MB ✅
- T20: Hash de versión ✅
- CRÍTICA: Área mezcla multi-producto ✅

## Errores encontrados y resueltos
1. Fechas con año 0206 → corregidas
2. fecha_corte mostraba "206-07-30" → filtrado solo fechas válidas (2020+)

## Archivos principales
| Archivo | Descripción |
|---------|-------------|
| index.html | PWA completa |
| 404.html | Redirect SPA |
| sw.js | Service Worker |
| manifest.webmanifest | Manifest PWA |
| data/bootstrap.json | Datos (4.3 MB) |
| data/metadata.json | Metadatos |
| scripts/procesar_siagri.py | Script de procesamiento |
| logo-casur.png | Logo CASUR |
| icons/ | Iconos PWA |

## Datos procesados
- 8,879 filas válidas → 3,350 eventos + 8,879 detalle productos
- 1,053 suertes en Maestro (deduplicadas)
- 0 filas Sucuya excluidas (no hay en reporte)
- Zona 5: 226 eventos, 24 productores
- Estados: EJECUTADA 3,111, RESERVADA 215, SUSPENDIDA 24

## Limitaciones reales
1. No hay procesamiento client-side del Excel (requiere script Python)
2. No implementada publicación automática Supabase (preparada la estructura)
3. Exportación es CSV (no XLSX nativo, requeriría SheetJS)
4. Sin gráficos de tendencia temporal (requeriría más datos históricos)
5. Sin módulo de Reservas/Mezclas dedicado con fichas individuales (datos disponibles en Explorador)
6. Sin PDF ejecutivo (requeriría jsPDF o similar)
7. Sin detección de actualizaciones incrementales en client-side

## Siguiente paso
Entregar ZIP para GitHub Pages.
