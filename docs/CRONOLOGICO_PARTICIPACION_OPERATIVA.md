# Cronológico · participación operativa y cobertura de estimados

Base: PR #43, `3e510035cc4017b175758c9b967f447935351228`.
Rama hija: `codex/cronologico-participacion-operativa`. A/B1 se conserva.
No publica datos ni resuelve clasificaciones administrativas.

## Diagnóstico y decisión aplicada

B1 conservaba correctamente el catálogo y distinguía áreas, pero incluía un
estimado de molienda cero en el denominador ponderado, bloqueaba un inventario
con molienda pendiente de TCH y mostraba el total del catálogo como indicador
principal de suertes. El formateador cronológico convertía además un agregado
ausente en 0,00. Las cantidades de catálogo, actividad y molienda son distintas.

`participation()` centraliza las reglas en el contrato de importación existente.
Fue necesario tocar ese contrato para admitir estimados pendientes con advertencia
y hacer coincidir conciliación, vista, reapertura offline y agregación. No cambia
la identidad, clasificación, destino, área de origen, TCH anterior ni forecast
original. Cero no equivale a vacío ni a inactividad.

| Universo | Regla |
|---|---|
| Catálogo | Todas las identidades, incluidas ausentes y bajas |
| Inventario | Área de origen de las identidades presentes |
| Activa | Molienda/Semilla, área positiva, presente, sin baja definitiva |
| Molienda clasificada | Activa y clasificación Molienda |
| Estimado utilizable | Molienda clasificada y TCH estimado positivo |
| Pendiente | Área de molienda con TCH cero, ausente o inválido; estados distintos |
| TCH estimado | Σ(área × TCH utilizable) / Σ(área con estimado utilizable) |

La contradicción clasificación/destino se señala por separado. Un estimado positivo
de una suerte clasificada Molienda conserva su participación provisional; no se
resuelve el destino de oficio ni se descarta una tonelada de origen por hipótesis.
CASUR debe confirmar esas identidades antes de aprobar una generación real.
Un universo sin estimación utilizable muestra N/D, conservando área pendiente.
No se hereda TCH anterior ni se suman líneas fraccionadas al inventario.

## Auditoría de los dos Excel originales

Lectura con el mismo normalizador de hojas que usa la app y cálculo independiente
por identidad. Las fuentes coinciden en las 1.046 identidades del inventario.
El archivo completo aporta además 1.050 líneas de plan / 1.046 identidades.
Los originales y su auditoría previa no se modifican.

| Clasificación de fuente | Suertes | Área inventariada ha |
|---|---:|---:|
| Molienda | 949 | 9.126,60 |
| Semilla | 46 | 448,06 |
| Investigación | 2 | 3,08 |
| Sin Caña | 34 | 0,00 |
| Baja rentabilidad | 15 | 94,39 |
| Total presente | 1.046 | 9.672,13 |

Hay 40 identidades presentes con área cero, 96 con TCH estimado cero y ninguna
sin TCH. De los ceros, solo uno está clasificado Molienda: 2003.
Se detectan 12 identidades con contradicción reconocible clase/destino, contadas
una vez cada una. Dos están clasificadas Molienda (1927 y 2003), una Semilla
(901) y nueve Baja rentabilidad. No se reclasifica ninguna.

Fuera de molienda: 104 identidades del catálogo, incluidas 46 de Semilla y las
7 ausentes; área inventariada presente 545,53 ha. Fuera del área activa: 58
identidades (51 presentes + 7 ausentes), con 97,47 ha inventariadas presentes.

## Conciliación B1 → corrección

| Indicador | B1 | Corrección |
|---|---:|---:|
| Catálogo / inventario | 1.053 / 1.046 | 1.053 / 1.046 |
| Activas / Semilla / Molienda | 995 / 46 / 949 | 995 / 46 / 949 |
| Área inventariada / activa ha | 9.672,13 / 9.574,66 | Sin cambio |
| Área clasificada Molienda ha | 9.126,60 | 9.126,60 |
| Suertes con estimado utilizable | 949 (incluía cero) | 948 |
| Denominador de estimado ha | 9.126,60 | 9.115,65 |
| Área pendiente de estimación ha | 0,00 | 10,95 |
| Toneladas de molienda t | 563.187,9696909501 | Sin cambio |
| TCH estimado | 61,7084094505 | 61,7825354957 |
| Cobertura de área de molienda | 100% | 99,8800210374% |

El TCH anterior mostrado con área activa sigue siendo referencia, no cosecha nueva.
Solo San Lucas (20) cambia de ponderado estimado: 5.684,80 t / 77,63 ha =
73,2294216154 antes; ahora / 66,68 ha = 85,2549490102. Sus 14 identidades siguen
activas, 11 clasificadas Molienda, 10 con estimación utilizable y 3 Semilla.
La zona Sur y el consolidado reflejan el mismo retiro de 10,95 ha del denominador.
El archivo local de conciliación contiene las 100 fincas y todas las zonas.

Incidencias pendientes de CASUR:

- 2003: Molienda / destino Semilla / TCH 0; 10,95 ha activas y clasificadas
  Molienda, pendientes de estimado. No se convierte a Semilla, Sin Caña ni baja.
- 1927: Molienda / destino Semilla / TCH 70; conserva 6,15 ha y 430,50 t en el
  estimado provisional, con advertencia. Excluirla requeriría decisión de CASUR:
  sería otro escenario, no el aplicado aquí.
- 901 y nueve suertes de finca 63: contradicciones conservadas para revisión.
- 49404A: Sin Caña + Baja definitiva, área activa cero, sin reactivación.
- Las siete ausentes y las cuatro identidades fraccionadas se conservan.

## Presentación y compatibilidad

El indicador principal cuenta suertes activas y mantiene el catálogo como contexto.
Las fichas conservan todas sus filas y explican la no participación discretamente.
El estimado informa su cobertura y área pendiente. Las tablas por zona identifican
el contador como suertes activas. No se aplica un filtro global al catálogo.

Las generaciones B1 guardadas se derivan al abrir sin reescribir su snapshot IDB,
versión, fecha de publicación ni baseline. Rollback conserva las generaciones
anteriores. El Histórico ejecutado permanece independiente.

La inspección detectó una fila cortada al paginar el PNG cronológico en PDF.
Se reutilizan los puntos de salto seguros del exportador existente para finalizar
páginas en límites de fila del Cronológico. PNG e informes históricos mantienen
sus builders. El resumen de contadores se integra al encabezado existente sin
agregar otra línea que ensanche la ficha.

## QA y reproducción

- Producción: 22 controles y 171 tests; casos sintéticos de positivos, cero,
  ausente, Semilla, Sin Caña con área cero/positiva, baja, ausentes, conflictos,
  finca no productiva, combinación por productor y zona, y snapshot B1.
- Shell/GEO JavaScript: 63 tests. TCH: validate y test, 91 cada uno.
- Chromium aislado: 11 grupos, con cifras del DOM, desktop 1440×900,
  tableta 768×1024 y móvil 390×844. Límites horizontales medidos en tableta/móvil.
- Exportaciones reales: San Lucas PDF 1 página; Pansaco PDF 2 páginas y PNG.
  Se inspeccionaron las tres páginas renderizadas; límites de 49 filas medidos.
- Offline tras cerrar la página: generación aprobada y plan completos,
  `APP_DATA` idéntico; rollback correcto; fallo IDB simulado atómico.
- Originales verificados por SHA-256, sin cambios. No se aplicaron datos al
  perfil real ni se modificaron datasets, GEO, SW, TCH o IndexedDB.

Ejecutor usado: `CASUR_QA_ORGANIZACION_2026-10-24/Invoke-B1-QA.ps1`, que dirige
a `%LOCALAPPDATA%/CASUR/QA/work/B1/current` y bloquea sobrescrituras. No se crean
carpetas b1-browser numeradas. Los diagnósticos de dos expectativas desactualizadas
de texto y la revisión visual previa están conservados bajo `B1/incidencias`.
No se borró evidencia previa ni se sustituyeron los finales A/B1 aprobados.

Evidencia local de esta revisión:

- `B1/analysis/participacion-final-matriz.csv`: 1.053 identidades y motivos.
- `B1/analysis/conciliacion-final.json`: antes/después, por finca y zona.
- `B1/current/results.json`, `run.log`, `layout-390.json`, `layout-768.json`,
  `reconciliation-applied.json`, capturas y PDF/PNG.
- `B1/current/pdf-render`: todas las páginas inspeccionadas.

`tools/audit-crono-participation.mjs` recibe extracción, libro completo, salida
externa y prefijo opcional; no sobrescribe sus archivos de salida.

Python GEO sigue sin geopandas local; no se acredita esa suite. No hay QA físico
de teléfono ni autorización para aplicar datos oficiales. El workflow existente
solo dispara automáticamente en PR hacia main; un PR hijo se valida también por
ejecución manual de CASUR Release Gate, sin cambiar la configuración de CI.
Las versiones siguen siendo las de la liberación aún pendiente del PR #43.
