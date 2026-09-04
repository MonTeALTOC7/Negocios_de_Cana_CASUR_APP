# Auditoría de fuente TCH estimado 26/27

Fecha de auditoría: 24-ago-2026.

## Fuente utilizada

- Archivo: `PROD_EstimadosPn_Z26_27_v03_20260717_GA_CHATg(1).xlsx`
- Hoja válida: `Productores_V3`
- Encabezado: fila 3 del libro original
- Claves: `CodHacienda`, `Suerte` y `hac-sue` como referencia legado
- Campo incorporado: `TCH_Est_170726`
- Fecha interpretada de la fuente: 17-jul-2026

La hoja `Productores` no se utiliza porque su columna TCH está vacía. El archivo original no fue modificado.

## Resultados

- 262 filas de detalle analizadas.
- 262 vinculadas con el maestro de Productores.
- 245 con TCH estimado numérico.
- 17 con TCH vacío en la fuente: 5 de semilla y 12 de otros registros.
- 0 claves duplicadas.
- 0 claves desconocidas.
- 0 suertes del maestro de Productores sin correspondencia.

## Regla de vinculación

La clave operativa es `CodHacienda + Suerte normalizada`. Una suerte numérica de un dígito se completa con cero (`1` → `01`) antes de formar el identificador canónico. `hac-sue` se conserva únicamente como traza porque 144 identificadores legados no coinciden literalmente con el identificador canónico actual.

## Protección implementada

El actualizador 26/27 valida hoja, columnas, duplicados y claves desconocidas antes de habilitar la aplicación. Solo modifica el valor 26/27 y sus metadatos de fuente; no altera área, variedad, fechas, riego, tenencia ni históricos.
