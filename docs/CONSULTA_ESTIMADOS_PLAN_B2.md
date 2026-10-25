# B2 · aforo integrado en el Cronológico existente

PR #45 · `codex/estimados-plan-consulta-b2`, base #44 `bb04f8f`.
Esta corrección sustituye la consulta independiente Estimados/Plan.
No autoriza Plan 600K/601K, nuevas fases, merge ni publicación productiva.

## Diagnóstico y fuente verificable

La captura original de 993 / Pansaco / Suerte 36 / CodSuerte 99336
correspondía a `2026.09.06-siagri.1415`, sin generación operativa aplicada:
8,91 ha, TCH anterior 67,15, edad 9,72 meses al 25-oct-2026, 7,37 km
y estimado nulo. No era un fallo de ponderación. La consulta separada no
compartía una generación aplicada porque no existía ninguna en ese origen.

La extracción `Estimados_para_APP_Z2627.xlsx` fue auditada con SHA-256
`82cd45c03b8c80ddda6ebc6078289df4f63b6a380403da6f103f2a52fa30e069`.
Su hoja en aquella auditoría se llamaba `Estimados_2627`; la instrucción
actual la denomina `Cronologico`. Se documenta la diferencia, sin asumir que
el nombre acredita contenido. El archivo de extracción ya no existe en su
ruta anterior y no se lo recreó ni se falsificó su hash.

El usuario indicó en la sesión anterior utilizar `Cronologico` de
`AforosZ2026_27_v05151026_OP.xlsx`. Se mantiene esa autorización para
inventario/aforo; la última corrección excluye expresamente BP/BQ del plan.
Este es el original disponible utilizado en el QA aislado:

- Ruta: `C:/Users/ctije/OneDrive - CASUR/Respaldo/ctijerino/Documents/AforosZ2026_27_v05151026_OP.xlsx`.
- SHA anterior auditado: `716d374c63aa0e990f18cbabee9f391eee3d54d50fd8395488a8357e5bbcbbae`.
- SHA actual exacto: `849e3bac1fa0ff6abd49c690f25ab0910b18282674ddea833283c79d6d46fc04`.
- Comparación de los 1.046 registros con los valores preservados de la
  extracción original: **78.450 celdas, cero diferencias**.
- La igualdad de valores no implica igualdad binaria ni acredita qué programa
  guardó el libro. La causa concreta del nuevo hash no está determinada.
- Evidencia: `source-correspondence.json` en la salida QA; no se cambió el Excel.

Fila 1020: AD `actTCH` = 65; E `Area Ha` = 8,91; AE = 579,15 t.
O `F. Ult. Cte` = serial 46024 = 2026-01-02. La extracción auditada usa
`actTCH_2627` para el mismo campo y valores. BP/BQ siguen como información
original de plan, pero nunca alimentan tarjetas ni tablas operativas nuevas.
No se usa 67,15 como sustituto del estimado ni se suman toneladas propuestas.

## Cambio funcional mínimo

Se conservan las seis tarjetas y su diseño: área, TCH anterior, estimado,
edad, distancia y fecha. La sexta sustituye a Variedad; variedad permanece
en los datos, gráficos y detalle por suerte, también en la ficha individual.

Fecha: solo una fecha prevista explícita, con fuente autorizada y campo
independiente del plan, puede preceder al último corte real. Sin ambos,
N/D. La siembra, edad y fecha base no se convierten en cosecha.
Para 99336 se muestra **Último corte · 02/01/2026**, con subtexto
**Último corte real acreditado**. El modelo conserva tipo, fuente, zafra y
procedencia de columna/fila. No se promedian fechas entre suertes.

El aforo exige hash exacto, zafra 26/27, fuente coherente y generación
identificada; no se permite mezclar generaciones. Los estados individuales
son disponible, cero explícito, faltante en fuente y aforo no cargado/aplicado.
No hay importación ni aplicación automática en el perfil del usuario.

Finca, zonas y selección múltiple reutilizan participación de #44 y la misma
área válida: Molienda con estimado positivo autorizado. Cero/faltante conserva
área activa y estado pendiente, sin diluir TCH; Semilla queda fuera de molienda.
La tabla individual conserva el cero explícito sin convertirlo en producción.

Se elimina el panel independiente, su módulo de UI, filtros, pestañas,
estilos, listeners y QA antiguo que exigía la interfaz rechazada.
Centro Maestro conserva importación, conciliación, aprobación, archivo y
recuperación. El modelo puro de análisis y lector readonly de archivo quedan
por compatibilidad, sin consumidores operativos en el Cronológico.
Se conserva en el HTML el selector acotado `overflow:clip` que protege la
ficha de paneo accidental; la tabla mantiene desplazamiento independiente.

## SHA y decisiones operativas

El nuevo SHA se agrega explícitamente a la lista cerrada de snapshots,
tras la correspondencia documentada. No se acepta cualquier hash, nombre,
prefijo o coincidencia parcial. No se modifica el guard central del motor.
Cada decisión requiere además identidad, zafra, generación y valores esperados
de área, clasificación, destino y TCH. Las pruebas verifican los tres SHA
exactos, rechazo de SHA alterado y rechazo si cambia el área esperada.

Solo hay dos decisiones: 2003 Semilla activa / 10,95 ha, fuera de molienda;
1927 Molienda activa / 6,15 ha × 70 = 430,50 t, conservando destino original
Semilla. Ninguna reclasificación nueva. Diez contradicciones siguen pendientes.

## Conciliación real del QA corregido

- Catálogo 1.053, inventariadas 1.046, activas 995.
- Inventario 9.672,13 ha; área activa 9.574,66 ha.
- Semilla 47 / 459,01 ha; Molienda 948 / 9.115,65 ha.
- 563.187,9696909501 t / 9.115,65 ha = 61,7825354957 TCH.
- Pansaco: 49 catálogo, 42 activas, 2 Semilla / 9,14 ha,
  40 Molienda / 359,30 ha, 17.452,08 t, TCH 48,57 mostrado.
- 99336: 8,91 × 65 = 579,15 t; tarjeta y tabla coherentes.
- Selección 99336 + 1927 + 2003: 1.009,65 t / 15,06 ha válidas
  = 67,0418326693 TCH; 10,95 ha de Semilla excluidas del denominador.
- Las 100 fincas concilian con una suma independiente desde las filas.

## QA y evidencias

Salida final controlada: `%LOCALAPPDATA%/CASUR/QA/work/Aforo/current`.
Los intentos y QA con alcance BP/BQ obsoleto se conservaron en `diagnostics`;
no cuentan como aprobación de esta corrección. No se borran evidencias A/B1/B2.
Antes original: `AforoAntes/current`. Datos compartidos: `AforoCompartidos/current`.

Chromium, 9 grupos aprobados: shared sin aforo; importación protegida y elección
sin aplicar; aprobación explícita; seis tarjetas y exclusión BP/BQ; finca y
múltiple; conciliación de todas las fincas y cero escrituras IDB durante
consulta/exportación; reapertura de página offline; rollback offline;
sin excepciones ni errores de consola y SHA del original intacto.

Capturas reales 1440×900, 768×1024 y 390×844, sin overflow horizontal.
PDF/PNG descargados de suerte, finca y múltiple. PDF de suerte: 1 página;
finca: 2; múltiple: 1. Todas las páginas renderizadas y revisadas.
Suerte/finca completas, sin filas cortadas ni páginas residuales.
**Limitación heredada:** el PDF/PNG múltiple presenta contraste insuficiente
en el KPI de área (texto claro sobre fondo claro). El builder y sus estilos
no se modificaron; no se acredita ese detalle visual como aprobado ni se
rediseña el exportador, fuera del alcance. Sus cálculos y descarga sí pasan.

Regresiones: Producción 22 controles + 193 tests; Shell/GEO JS 63;
TCH validate/test 91 cada uno. Sintaxis JS e inline, versiones, manifiesto
SHA-256 de runtime y `git diff --check` verificados. Se conserva App 1.4.0 /
Producción V1.6.0 de la liberación pendiente; no se aumentan versiones.

## Reproducción en preview aislado

Abrir el preview local entregado y buscar 99336 en Cronológico. Sin una
importación aprobada de ese origen se verá N/D, aforo no cargado/aplicado,
y último corte real. No se transfiere el perfil de QA al navegador del usuario.

Para probar aforo: desbloquear Centro Maestro por el procedimiento normal,
elegir el original indicado, esquema `Cronologico`, sin líneas adicionales
de plan; zafra 26/27 y una versión de datos nueva. Conciliar y revisar; solo
con aprobación expresa aplicar en un perfil de prueba. Volver a la ficha
99336: 65 TCH, 579,15 t en tabla y último corte 02/01/2026.
La opción de recuperar generación anterior restaura shared y N/D explícito.

QA repetible en contexto desechable (detiene si hay evidencias sin archivar):

```powershell
$env:NODE_PATH='C:/Users/ctije/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
$env:CASUR_CHROME_EXECUTABLE='C:/Users/ctije/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'
./tools/run-operational-qa.ps1 -Stage Aforo -ExtractFile 'RUTA/AforosZ2026_27_v05151026_OP.xlsx' -PreviewUrl 'http://127.0.0.1:4313/'
```

Sin cambios a datasets oficiales, Histórico ejecutado, GEO, GPS, TCH,
fórmulas de edad, schema IndexedDB, SW o lógica de exportadores.
Solo se renuevan hashes de archivos runtime modificados/eliminados.
No se acredita teléfono físico ni suite Python GEO (geopandas no disponible).
No hay merge, despliegue ni cambios a main o al perfil real del usuario.
