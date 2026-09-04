# Formato oficial del cronológico maestro

Fuente de referencia validada: `Cronologico_Maestro_CASUR_2026-08-24.xlsx`, hoja `REPORTE`.

## Columnas reconocidas

La v2.7.2 no depende de una posición fija. Normaliza mayúsculas, tildes, guiones, puntos y guiones bajos; además busca la fila de encabezado dentro de las primeras 20 filas.

Encabezados oficiales:

`Hac-Sue`, `Cod`, `Hacienda`, `Suerte`, `Area`, `Variedad`, `Edad`, `TCH_Z2526`,
`TCH_Estimado_Z2627`, `Ton_Estimadas_Z2627`, `#_de_Corte`, `Surco`, `Textura`,
`F. Ult. Cte`, `F. Siembra`, `Km`, `Tch.Inic`, `Tch.Act`, `Destino`, `Tenencia`,
`Tipo_de_Riego`, `#_de_Riegos`, `ERP`, `ZONA`, `Estado`, `Observación`.

Son obligatorias las columnas equivalentes a Código, Hacienda, Suerte y Área. La app prefiere `REPORTE`; si no existe, inspecciona las demás hojas y usa la primera tabla válida.

## Reglas

- Clave canónica: `Cod + Suerte normalizada`.
- La suerte numérica de un dígito se completa con cero a la izquierda.
- Se rechazan duplicados y filas sin código, hacienda, suerte o área positiva.
- Zona 0 y Sucuya permanecen excluidas.
- `Arriendo`, `Compra Venta` y `Propio` se normalizan respectivamente a `CA`, `CV` y `PR`.
- Si el Excel contiene explícitamente `TCH_Estimado_Z2627`, sus vacíos siguen vacíos y no se restauran estimados antiguos.
- La fecha del archivo cronológico no se considera fecha del estimado. Si la columna no incorpora una fecha, se conserva la trazabilidad anterior cuando el valor no cambió.
- Valores de `Edad` con formato de fecha no se interpretan como meses; la edad operativa se calcula con las fechas base.

## Base integrada v2.7.2

- 1,053 suertes únicas.
- 10,030.65 ha.
- 262 suertes de Zona 5 Productores.
- 245 valores numéricos de TCH ESTIMADO Z26/27.
- Seis estados cronológicos oficiales.
- Sin Sucuya ni Zona 0.

El script reproducible `scripts/rebuild-master-from-official.mjs` genera `data/suertes.json` y `data/productores.json` desde el Excel aprobado.
