# Centro Maestro de Actualizaciones — simplificación propuesta

Se apoya en `MAESTRO_CENTRAL_DIAGNOSTICO.md` §2 (los cuatro caminos actuales) y en `MAESTRO_CENTRAL_CONTRATO.md` (la
autoridad por capa). Es un diseño: esta etapa no lo implementa.

## 1. Objetivo

Un solo punto de entrada, «Actualizar maestro», dentro del Centro Maestro existente. **Se reestructura el actualizador
actual; no se crea otro.** Detrás quedan un único escritor transaccional y un único formato de generación. El resultado de
una actualización es una generación candidata con un paquete publicable, verificado y reversible.

## 2. Qué se conserva, qué se une y qué se retira

| Pieza actual | Destino |
|---|---|
| `core/imports/operational-import.js`: `inspectSheets`, `profiles()`, `parseCandidate`, `prepareUpdate`, `participation`, `validateGeneration`, `attachHarvestPlan` | **Se conserva como motor único.** Ya detecta los perfiles cronologico/estimados/plan/historico y valida la generación |
| `master-store.js` → `commitOperationalDataset` / `restoreOperationalPrevious` (camino B) | **Se conserva como único escritor local.** Es transaccional, archiva y comprueba `expectedVersion` |
| Shell `app.js`: `adaptSiagriToProduction` → `saveProduccionDataset` + `saveMaestroSuertes` (camino C) | **Se retira** cuando el asistente nuevo cubra el tipo A. Mientras tanto, se recomienda hacerlo pasar por `commitOperationalDataset` (P3) |
| Administrador SIAGRI (`master/convertidor/`) | Se conserva como **lector del Excel SIAGRI** (tipo A) y como generador del paquete. Se integra como paso 2 del asistente |
| `tools/plan-z2627/build-aforo-z2627.cjs` (camino A) | Se conserva como **verificador reproducible**. El paquete que genere la app debe ser idéntico byte a byte al del generador para la misma fuente; es la prueba de aceptación del asistente |
| `official-source-policy.js` y `official-data-updates.js` | Se conservan: resolución de la fuente vigente (paso 1) |

## 3. Los cinco tipos de actualización

| Tipo | Fuente | Capas que cambia | Capas que preserva | Detección |
|---|---|---|---|---|
| A · Cronológico SIAGRI | Excel del cronológico | Catálogo, atributos, estado y área física | Aforo, plan, histórico y GIS, por identidad | `profiles()` incluye `cronologico` sin `estimados` |
| B · Aforo o estimados | Hoja AFORO (AD/AE/AF/AG) | Aforo e `inventoryArea` | Atributos A (salvo los que la misma fuente traiga y el operador acepte), plan, histórico y GIS | `estimados` |
| C · Plan de cosecha | BE/BF y líneas | Plan | Todo lo demás | `plan` con `lineId` (`isPlan`) |
| D · Histórico | Histórico por zafra | Histórico | Todo lo demás | `historico` |
| E · GIS | GeoJSON o shapefile convertido con `tools/geo/` | Geometría | Todo lo demás. Las identidades del GIS no dan de alta suertes | Esquema `casur-master-geometry` |

Una fuente con varios perfiles, como la AFORO de la 1102 (catálogo + estimados + plan), se presenta como **actualización
combinada**. El operador elige qué capas aplica; por defecto, las que la fuente trae completas.

**Regla de oro.** Una actualización A ordinaria nunca elimina el aforo, el plan ni el histórico. Por identidad:
- La suerte nueva entra sin estimado (`estimate: missing`) y **en** el área activa si su estado lo indica.
- La suerte que desaparece pasa a `absent`, con atributos heredados.
- Un área desconocida queda `null`, nunca 0.

El aforo de 12-Oct-2026 se mantiene hasta que se aplique un tipo B nuevo.

## 4. Flujo en 10 pasos

| Paso | Qué ve el administrador | Motor |
|---|---|---|
| 1 · Fuente vigente | Generación activa, capas con versión y fecha, y si es publicada o local. Nada se puede aplicar si hay una generación local sin publicar no resuelta | `officialSourcePriority`, sellos por capa |
| 2 · Importar | Elegir un archivo (Excel o GeoJSON). Se calcula su SHA-256; si el mismo archivo ya se aplicó, se avisa | `workbook-reader`, convertidor SIAGRI |
| 3 · Detectar el tipo | «Este archivo es un Cronológico SIAGRI» (o Aforo, Plan, Histórico, GIS, Combinado), con la hoja y los encabezados reconocidos. El operador confirma | `inspectSheets` + `profiles()` |
| 4 · Validar | Bloqueos (identidad ausente, hacienda 16, columnas obligatorias, «-» en Molienda) y advertencias, con fila y celda | `parseCandidate`, `validateGeneration` |
| 5 · Comparar | Contra la generación vigente, por identidad: altas, ausencias, cambios de estado, cambios por campo y áreas | `prepareUpdate` |
| 6 · Cambios y conflictos | Lista filtrable. Cada conflicto pide una decisión explícita (aceptar, conservar o diferir) con motivo. Se reutilizan las decisiones operativas trazadas (`operationalDecision`) | `applyDecisions` |
| 7 · Impacto | Totales antes y después: catálogo, activas, área de molienda, toneladas oficiales y TCH, más los módulos afectados («Riego verá 3 suertes nuevas»). **No se recalculan los estimados oficiales**: se muestran | `totals()` y el contrato |
| 8 · Aprobar | Resumen firmado: quién, cuándo, archivo y SHA, decisiones. Doble confirmación si cambian más del X % del área o hay bajas | — |
| 9 · Aplicar | Una transacción: archiva la generación anterior y escribe la nueva (`commitOperationalDataset`, `expectedVersion`). Genera el paquete publicable con `integrity.json` y el manifiesto de datos | Camino B + empaquetador |
| 10 · Recuperar | «Volver a la generación anterior» local (`restoreOperationalPrevious`). En producción, la recuperación es publicar la anterior (git revert); el gate LKG del SW impide una vuelta atrás accidental en los dispositivos | Camino B, git, LKG |

## 5. Publicación

[CL] La aplicación **no publica en GitHub por sí sola**: no hay servidor ni token en el cliente, y no debe haberlo. El paso 9
produce un paquete verificado que se publica por el procedimiento vigente (commit, Release Gate y QA). Lo que se elimina es
la preparación manual del ZIP: el paquete sale completo, con SHA y validado contra el generador reproducible.

## 6. Qué no hace el Centro Maestro

- No escribe en los almacenes de Riego, Insumos, TCH, Labores, Inventario ni Visitas.
- No recalcula aforos ni toneladas oficiales.
- No borra identidades.
- No modifica SIAGRI: solo lee sus exportaciones.
