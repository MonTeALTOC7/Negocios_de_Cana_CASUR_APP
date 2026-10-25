# Etapa B2 · propuesta funcional para aprobación

**Propuesta histórica sustituida el 25-oct-2026.** El usuario descartó el
panel separado y excluyó Plan 600K/601K de la B2 operativa. El alcance vigente
es aforo integrado en las tarjetas existentes, documentado en
`CONSULTA_ESTIMADOS_PLAN_B2.md`. Este archivo solo conserva el antecedente;
no autoriza implementar sus pantallas ni utilizar sus metas/calendarios.

Solo análisis y propuesta. No se crea otro módulo ni se implementan pantallas.
Depende de la aprobación de A/B1 y de la corrección de participación cronológica.

## Lo que ya existe

- `core/imports/workbook-reader.js`: lectura local tipada, fórmulas y coordenadas.
- `core/imports/operational-import.js`: detección por estructura, mapeos, identidad,
  clasificación, forecast con zafra/área/TCH/toneladas de origen y procedencia.
  `participation()` y `totals()` separan molienda, pendientes y cobertura.
- Plan por registro: fecha propuesta (raw/tipo/ISO), corte propuesto, fecha base,
  edad aportada y calculada. La mera presencia de una fecha no programa cosecha.
- `harvestLines`: identidad lógica + ID de línea, fracción, área, toneladas
  propuestas, fecha y corte. `planAudit` concilia líneas por CodSuerte sin sumar
  el área o las toneladas dos veces al inventario. Las cuatro suertes fraccionadas
  y sus 1.050 líneas ya se guardan separadas de las 1.046 identidades.
- Centro Maestro: conciliación, advertencias, aprobación, versión, archivo de
  generaciones, aplicación atómica y rollback. El guard multiventana ya evita
  sobrescribir una generación que cambió durante la previsualización.
- Cronológico: búsqueda por finca/suerte/productor/zona, estimado de la zafra,
  cobertura, fichas y exportaciones; datos aprobados conservados offline.
- El registro de módulos no contiene un módulo independiente Estimados/Plan.
  No hace falta registrarlo antes de decidir el alcance funcional.

## Alcance propuesto para B2

Reutilizar identidades y filtros del Cronológico y añadir, dentro de Producción,
una consulta operativa por finca, suerte y zafra. Primera entrega de consulta:

1. Estimado: área clasificada Molienda, área utilizable y pendiente, cobertura,
   TCH ponderado y toneladas, con la fuente y zafra del forecast. Semilla y demás
   destinos consultables por separado; no cambiar su clasificación al filtrar.
2. Plan: fecha propuesta, corte, edad aportada/calculada y desglose fraccionado,
   conservando la identidad lógica y mostrando las líneas de esa suerte.
3. Diferencias: toneladas del forecast frente al escenario del plan y cobertura
   de área/fracciones; ausencias y discrepancias visibles, sin sustituir un
   escenario por el otro ni inferir que el plan ya fue ejecutado.
4. Consultar otra zafra mediante la generación archivada correspondiente, sin
   mezclar forecast vigente con fechas/áreas de otra campaña. No inventar un
   histórico de estimados si solo se cargó una generación.

Las fórmulas y universos deben reutilizar el contrato actual. Edad calculada:
días entre fecha base y fecha propuesta / 30,4375; conservar ambas fechas y la
edad aportada para auditoría. No alterar TCH ejecutado ni las biometrías TCH.

Una segunda entrega, solo si se aprueba expresamente, podría permitir editar y
aprobar escenarios de planificación. Reutilizaría el protocolo de generación,
checkpoint, procedencia, persistencia offline y revisión antes de aplicar.
Debe definir conflictos entre ventanas y distinguir escenario propuesto,
aprobado y ejecutado antes de habilitar escrituras.

## Decisiones que requiere CASUR

- Confirmar 2003 y 1927, y las demás contradicciones administrativas, mediante
  dato aprobado; no resolverlas desde la pantalla de estimados.
- Confirmar si B2 comienza solo con consulta o también requiere edición de plan,
  quién aprueba y qué vuelve una línea efectivamente programada.
- Definir el catálogo de tipos de corte y la autoridad de fecha base en casos
  ambiguos. No inferir códigos ni reinterpretar cortes del histórico.
- Acordar qué escenarios/fechas se comparan y cómo se selecciona una versión
  archivada. Una generación anterior no es automáticamente un plan aprobado.
- Precisar el tratamiento de excedentes/déficits de fracción o área y los
  criterios para bloquear o advertir. No normalizar fracciones a 100% de oficio.
- Definir las exportaciones operativas necesarias y su alcance; conservar los
  exportadores históricos y cronológicos existentes.

## Criterios de aceptación propuestos

Por finca/zona/consolidado, áreas y toneladas deben conciliar desde identidades
únicas. Un plan fraccionado no duplica inventario. Fecha propuesta no equivale
a corte ejecutado. Pendientes, ceros e incertidumbres se conservan sin imputar.
Consultar y guardar offline no pierde versiones ni modifica el Histórico.
Los casos 2003, 49404A, ausentes, conflictos y fraccionadas deben ser regresiones
obligatorias. El diseño se revisará con CASUR antes de implementar pantallas.
