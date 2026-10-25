# Etapa B2 · consulta de Estimados y Plan de Cosecha

Base: PR #44 actualizado, `bb04f8f104bdbb421182975d0623c6c6379850ea`.
Rama: `codex/estimados-plan-consulta-b2`. Alcance autorizado el 25-oct-2026:
consulta y análisis; sin edición, activación de generaciones ni publicación.

## Uso

Dentro de Cronológico, debajo de la ficha, abrir **Estimados y plan de cosecha ·
Consulta**. Elegir generación, zafra, finca/productor, suerte y/o zona. Se conserva
el código de hacienda y el número de suerte; CodSuerte sigue siendo la identidad
técnica. Las tablas se desplazan horizontalmente y paginan cada 50 registros.

- **Estimados:** área operativa Molienda y Semilla, TCH, toneladas, cobertura,
  catálogo/activas/participantes, pendientes y condiciones por suerte. Se muestra
  la clase y destino originales separados del destino operativo confirmado.
- **Plan propuesto:** líneas, fracciones, fecha/tipo de corte, edad aportada y
  calculada, área y toneladas propuestas; no acredita cosecha ejecutada.
- **Comparación:** estimado/plan/diferencia para las mismas suertes con ambos
  datos válidos; detalle por suerte, finca/productor y zona. Expone falta de plan,
  estimado ausente y discrepancias de superficie o fracciones.

La fuente, fecha, generación y zafra consultadas permanecen visibles. Consultar
una versión archivada no la aplica ni altera el Cronológico en uso. Solo aparecen
campañas acreditadas en una generación: no se infieren ni mezclan otras zafras.
Sin generación operativa válida se presenta un estado explícito, sin cifras
fabricadas ni importación automática al perfil del usuario.

## Reglas y denominadores

`core/imports/operational-analysis.js` reutiliza `participation()` y `totals()`.
No duplica reglas de Molienda/Semilla. Las decisiones de 2003/1927 del PR #44
se respetan tanto en la generación actual como en la vista derivada de archivos.

Cada línea se vincula con CodSuerte dentro de la generación seleccionada. Su zafra
y SHA de fuente deben coincidir. IDs de línea ausentes/duplicados o procedencia
inconclusa se informan: no se suman silenciosamente y los totales completos
afectados se presentan N/D. Las identidades duplicadas bloquean el modelo.

Las fracciones se suman por identidad para comparar área y toneladas propuestas,
pero el inventario y el estimado se cuentan una sola vez por suerte. No se
normalizan fracciones ni se distribuye área de oficio.

- Área/toneladas de plan total: suma de líneas verificables del ámbito completo;
  puede incluir destinos distintos de Molienda. Falta de algún valor → N/D.
- Diferencia comparable: Σ(plan − estimado) solamente donde ambos valores existen
  para la misma suerte de Molienda. Se indica el número de suertes comparadas.
  Un plan parcial no se resta de un estimado global de otro ámbito.
- Diferencia de superficie por suerte: área propuesta − inventario original de
  esa identidad presente; ausencia de área no se convierte en cero.
- Cobertura de plan: área operativa de Molienda de identidades cuyas líneas
  concilian área con inventario (tolerancia existente 0,02 ha) y fracción 100%
  cuando fue aportada. En varias líneas es obligatorio acreditar las fracciones.
  Se divide por toda el área operativa de Molienda seleccionada. No es cobertura
  de cosecha ejecutada ni programación aprobada.

La edad calculada reutiliza la fórmula vigente del importador: días entre fecha
propuesta y fecha base / 30,4375. Si la línea no aporta base se usa únicamente la
base de plan de la misma identidad/generación, con procedencia visible. Una edad
aportada del inventario solo se vincula cuando coincide la fecha propuesta de
la línea. Otra fracción con otra fecha conserva edad aportada N/D; su edad se
calcula desde su propia propuesta y la base acreditada. No se cambia el origen,
no se redondea el cálculo y no se utilizan edades del Histórico ejecutado.

## Conciliación oficial de QA

La generación de prueba aislada conserva 1.053 identidades, 1.046 presentes,
995 activas; 47 Semilla / 459,01 ha y 948 Molienda / 9.115,65 ha. Estimado:
563.187,9696909501 t / 9.115,65 ha = 61,7825354957 TCH, cobertura 100%.

Plan total: **1.050 líneas / 1.046 identidades**, 9.672,13 ha propuestas y
601.000,00 t de escenario. Para las **948 suertes de Molienda** comparables:
599.829,70 t de plan frente a 563.187,9696909501 t estimadas;
diferencia **36.641,73030905 t**. No se mezclan las 1.170,30 t propuestas
en otros destinos con el estimado de Molienda.

99207: dos líneas, una identidad; áreas 12,61823529411734 y 1,0117647058826607 ha
= 13,63 ha; toneladas 1.072,55 y 86,00 = 1.158,55 t propuestas, frente a
1.090,40 t de estimado. La superficie del inventario permanece 13,63 ha.
El aporte de edad de la primera línea conserva la precisión original; la segunda
no hereda esa edad porque cambia la fecha propuesta. Ambas edades calculadas
usan la misma base acreditada y sus fechas individuales.

San Lucas (20): 14 activas, 10 Molienda / 66,68 ha y 4 Semilla / 34,55 ha;
5.684,80 t estimadas, 5.965,40 t de plan comparable, diferencia 280,60 t.
San Fernando (19): 33 Molienda / 253,48 ha, 21.357,35 t estimadas y
22.178,03 t propuestas comparables; diferencia 820,68 t. Se conserva 1927.
Se conciliaron las 100 entidades de finca/productor y las cuatro zonas.

## Integridad y QA

La única ampliación de persistencia es un lector de generaciones archivadas con
transacción readonly sobre `datasets` de la DB existente. No hay nueva base,
migración, limpieza, cambio de schema ni método de escritura en la consulta.
El QA instrumenta `IDBObjectStore.put` y confirma cero escrituras al consultar,
filtrar y comparar; verifica que `CRONO_DATA` no cambia al elegir un archivo.

La consulta está fuera de los nodos exportados y marcada no-print/export-excluded.
Se descargan y revisan los PNG/PDF cronológicos existentes. Las funciones y datos
históricos, SW, GEO, GPS y TCH permanecen intactos.

Se reprodujo un paneo interno de 15 px en la tarjeta cronológica después de
exportar/cambiar viewport: su `overflow:hidden` admitía scroll programático.
Un único selector acotado usa `overflow:clip`; conserva el diseño y el scroll
independiente de la tabla. Chromium verifica que la tarjeta no se desplaza.
Las capturas se sincronizan sin transiciones de scroll intermedias.

Los dos archivos nuevos de runtime se agregan al manifiesto SHA-256 existente
(164 recursos). No cambia la estrategia SW ni las versiones de la liberación
pendiente. Offline se prueba desde una página nueva tras precarga y cierre.

Pruebas: Producción 22 controles + 186 tests; Shell/GEO JavaScript 63; TCH
validate/test 91 cada uno; Chromium con los 11 grupos del Cronológico más
consulta B2, offline B2 y generación archivada: 14 grupos. Hay casos sintéticos
para faltantes, duplicados, otra zafra/fuente, fracciones, áreas discordantes,
comparación parcial, preservación y origen de edad.

Salida controlada: `%LOCALAPPDATA%/CASUR/QA/work/B2/current`, mediante
`tools/run-operational-qa.ps1 -Stage B2` con las rutas de los dos Excel originales.
`results.json`, conciliaciones y capturas permiten revisar la ejecución final;
los diagnósticos previos se conservan aparte, sin eliminar ni sobrescribir A/B1.

## Pendientes y límites

Diez contradicciones de origen siguen sin decisión operativa; no se resuelven.
No se acredita Python GEO local (falta geopandas) ni dispositivo físico. Las
pruebas móviles son Chromium emulado. No se aplican datasets al perfil real ni
se publican Excel o datos nuevos. La nueva consulta no añade exportadores B2:
se preservan las exportaciones cronológicas/históricas existentes.

No se implementaron edición, aprobación de escenarios, programación efectiva,
ejecución de cosecha ni otras fases. Requieren autorización posterior.
