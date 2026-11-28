# Maestro Central — diagnóstico del estado real (MC00)

Base auditada: `main` `21a90045cbdacbeeff044081f2f7fbdbff8cd1ef` (App Maestra 1.6.2, Maestro de Suertes V1.8.3, generación
`2026.11.22-aforo.1102`, aforo 12-Oct-2026, consolidado 22-Nov-2026). Rama `claude/maestro-central-visitas`. Etapa de
auditoría y diseño: no cambia el runtime, los datos oficiales, SIAGRI ni el Estimador TCH.

> **Actualización (MC01/VC01):** las decisiones del propietario y las correcciones posteriores están en `docs/MC01_VC01_IMPLEMENTACION.md`. Allí se eliminó la etapa S0 y se resolvió `nrMaster` (NR acumulado, no «riegos objetivo»). También se corrigieron las áreas menores y por conciliar (49 y 41, antes 47 y 43) y se precisó que Riego e Inventario comparten un proyecto Supabase.

Convención de este documento y de los siguientes:

| Marca | Significado |
|---|---|
| **[C]** | Comprobado en código, datos o una prueba ejecutada en esta etapa |
| **[P]** | Problema real, con su evidencia |
| **[H]** | Hipótesis que falta verificar, y cómo verificarla |
| **[GPT]** | Propuesta inicial del encargo |
| **[CL]** | Propuesta técnica de Claude |
| **[R]** | Recomendación conjunta para decidir |

Evidencias reproducibles:

| Herramienta | Qué demuestra |
|---|---|
| `node --test tools/poc/maestro-central-contract.test.mjs` | Contrato de lectura y comparación con las copias de los módulos (8/8) |
| `node tools/poc/pwa-visitas-coexistencia.cjs` | Coexistencia PWA (resultado en `docs/evidencias-maestro-central/poc-pwa-visitas.json`) |
| `tools/diagnostico/diagnostico-maestros-locales.js` | Diagnóstico de solo lectura para los dispositivos reales |

---

## 1. Qué es hoy «el maestro de suertes»: siete copias, no una

| # | Copia | Dónde vive | Versión o fecha | Quién la escribe | Quién la lee |
|---|---|---|---|---|---|
| 1 | Generación oficial de Producción | `modules/produccion/data/cronologico.json/js` + `historico` + `version` + `integrity.json` (GitHub) | `2026.11.22-aforo.1102` | Generador de desarrollo `tools/plan-z2627/build-aforo-z2627.cjs` y publicación | Producción y Centro Maestro (por red/SW) |
| 2 | Almacén central del navegador | IDB `casur_master_data` → `datasets`: `produccion_current`, `maestro_suertes_current`, `operational_*` | La que se importó en **ese** dispositivo | Shell (Centro Maestro) e importador operativo de Producción | Producción (override local) y Riego (`maestro_suertes_current`, solo lectura) |
| 3 | Maestro de Riego | `modules/riego/data/bootstrap.json` + Supabase `master_lots` + IDB `casur_riego_db/kv` | Cronológico 24-Ago-2026; riegos al 11-Sep-2026 | Edge function `casur-admin-master` (contraseña) | Riego |
| 4 | Maestro de Insumos | `modules/insumos/data/bootstrap.json` (`maestro`, 1053 filas) + IDB `insumos_casur_db/kv` | 23-Ago-2026 | Bundle publicado y pantalla Admin propia (clave) | Insumos |
| 5 | Maestro del Estimador TCH | `modules/tch/data/suertes.json` (1053) + IDB `casur-estimador-tch/master` | Estimados propios del 17-Jul-2026 | «Maestro General CASUR» propio (clave) | TCH |
| 6 | Labores | `modules/labores/datos/Cronologico_Maestro_2026.xlsx` | Sin versión declarada | Publicación manual del Excel | Bundle compilado de Labores |
| 7 | GIS | `shared/geo/data/manifest.json` + 4 GeoJSON por zona | `2026-07-24-maestro-26-27-r2`, 1047 suertes | `tools/geo/` | Producción, TCH y los informes |

**[C]** Las copias 1, 3, 4 y 5 tienen las mismas 1053 identidades: no sobra ni falta ninguna y no hay duplicados. Lo
comprueban las pruebas 6–8 del PoC del contrato.

**[P1] Hay divergencia de atributos medida contra la 1102.** Los atributos de las copias propias no coinciden:

| Copia | Área | Variedad | Corte | Destino | Tipo de riego | Zona |
|---|---|---|---|---|---|---|
| Riego | 148 | 6 | — | — | 59 | 16 |
| Insumos | 148 | 9 | 28 | 114 | (formato distinto) | — |
| TCH | 148 | 9 | 28 | — | — | — |

Las 148 diferencias de área se reparten así:
- **58 de cero a valor positivo:** la 1102 tiene área 0 y la copia del módulo conserva el área física.
- **47 de 0,01–0,02 ha:** redondeo o remensura.
- **17 de 0,02–0,5 ha.**
- **14 de 0,5–2 ha.**
- **12 de más de 2 ha.**

Riego, Insumos y TCH tienen la misma distribución. Las tres copias derivan del mismo cronológico de agosto y ninguna
recibió la 1101 ni la 1102.

**[C] Las fechas de Riego no son equivalentes.** `cropStartDate` de Riego es el máximo entre F. Siembra y F. Ult. Cte; no es
la fecha de siembra. `nrMaster` es el NR del cronológico (riegos acumulados) a la fecha de corte del maestro de Riego, de modo que solo se compara con una fuente de la misma fecha. Compararlos campo a campo produce diferencias falsas: el
adaptador del PoC los declara como `notEquivalent` (no equivalentes) y no los compara.

**[P2] El almacén central suele estar vacío en un dispositivo normal.** En un perfil nuevo que abrió Producción, TCH e
Insumos, `casur_master_data/datasets` tiene 0 registros (lo midió el diagnóstico local). Ese almacén solo se llena cuando
alguien importa en el Centro Maestro de **ese** dispositivo. Riego lo consulta y, al no encontrarlo, usa su propio
bootstrap. Hoy el «Maestro Central» de IndexedDB es, en la práctica, local del administrador. La fuente común real es la
generación publicada (copia 1).

## 2. Caminos de actualización: cuatro, con garantías distintas

| Camino | Ruta | Transaccional | Archiva la anterior | Restaura | Publica |
|---|---|---|---|---|---|
| A | Generador de desarrollo (1101 y 1102) → commit → release | Sí, vía git, `integrity.json` y la Release Gate | Sí (git y el historial de la generación) | Sí (revert) | Sí |
| B | Producción → importación operativa → `commitOperationalDataset` | Sí: una transacción IDB, `expectedVersion`, rechaza versiones reutilizadas | Sí (`operational_previous` y `operational_generation:<v>`) | Sí (`restoreOperationalPrevious`) | No: solo ese dispositivo |
| C | Centro Maestro del shell (`app.js` ≈990–1115) → `adaptSiagriToProduction` → `saveProduccionDataset` y luego `saveMaestroSuertes` | **No**: dos escrituras separadas; un error en la segunda se ignora en silencio | **No** | **No** | No (solo avisa «Genera el paquete para publicar») |
| D | Administrador SIAGRI (`master/convertidor/`) → «Paquete solo datos para GitHub» (ZIP) → subida manual | Depende de quien suba el ZIP | No | Manual | Sí, manual |

**[P3]** El camino C puede dejar `produccion_current` en una versión y `maestro_suertes_current` en otra. No existe
recuperación desde la UI.

**[P4]** El camino D depende de una subida manual del ZIP. El SW raíz protege contra los downgrades (gate LKG), pero no
contra un ZIP incompleto que la gente prepare a mano.

**[C]** La 1102 se produjo por el camino A: el generador ejecuta en Chromium los mismos motores de la app y aplica 13
ajustes autorizados con su «antes» verificado (`docs/PLAN_COSECHA_Z2627.md`). **El camino oficial vigente es un proceso de
desarrollo, no una función de la app.** La simplificación debe partir de ese hecho y no de suponer que el Centro Maestro
ya es la vía oficial.

## 3. Representación real de áreas y estados (generación 1102)

| Estado operativo original | Suertes | `area` | Participa del área vigente | Participa de molienda |
|---|---|---|---|---|
| Molienda | 946 | > 0 | sí | sí |
| Semilla | 49 | > 0 | sí | no |
| Sin Caña | 32 | **0** | no | no |
| Baja rentabilidad | 15 | **0** | no | no |
| Ausente de la fuente (`sourcePresence: absent`) | 7 | **0** (`inventoryArea` heredada, p. ej. 147/10A → 3,1) | no | no |
| Baja definitiva | 2 | **0** | no | no |
| Investigación | 2 | **0** | no | no |

**[C] Campos que existen por registro:**
- `permanentIdentity {code, lot}` y `codLote`.
- `sourcePresence`, `operationalState`, `classification`.
- `participatesCurrentArea` y `participatesMilling`.
- `area`, `inventoryArea` y `millingArea`.
- `forecast` (aforo AD/AE con fuente y SHA), `forecastOptimistic` (AF/AG) y `plan` (BE/BF).
- `provenance` (hoja, fila, columna, valor crudo y fórmula por celda).
- `inherited` (ausentes) y `changeHistory` (por generación, con `previousArea`).

La regla de participación vive en un único sitio, `participation()` de `core/imports/operational-import.js`:
`present && !retired && inventoryArea>0 && destino∈{Molienda, Semilla}`.

**[P5] El área física se pierde en la generación vigente.** En las 51 suertes presentes con estado no productivo, la fuente
AFORO trae «Area Ha = 0» (celda cruda 0, verificada en `provenance`). El área anterior solo sobrevive en
`changeHistory[].previousArea` (p. ej. 904/01: 4,94 → 0) o en las copias desactualizadas de los módulos. Hoy nada distingue
«área física/catastral» de «área en inventario del aforo». Si un módulo adoptara la 1102 tal cual, Riego e Insumos verían
0 ha en suertes que físicamente existen.

**[P6] No hay representación para algunos estados.**
- Pérdida parcial o total.
- Renovación: `renovacion` es siempre `false` y la fuente no la informa.
- Particiones (p. ej. 13 → 13A/13B): no hay vínculo de linaje.

Las particiones se reconocen solo por el sufijo; no hay un campo `parent`.

**[C] Suertes alfanuméricas y ceros.**
- 133 de las 1053 suertes terminan en letra; todas las suertes tienen 2 o 3 caracteres.
- `normLot` del adaptador de Riego solo rellena un único dígito («1» → «01»). El PoC lo generaliza para que «5A» quede «05A»
  y verifica que no produce colisiones en la 1102.

**[P7] La identidad GIS concatena hacienda y suerte.** El GIS usa una sola cadena `codLote` = hacienda + suerte (p. ej.
«24201»).
- No hay colisión hoy.
- Pero 990 de los 1053 códigos son estructuralmente ambiguos: un prefijo suyo es también otra hacienda («1921B» podría ser
  19|21B o 192|1B).

El contrato nunca debe usar `codLote` como identidad. La correspondencia GIS↔catálogo debe pasar por el catálogo.

**[P8] Brecha GIS ↔ catálogo.**
- 7 suertes del catálogo no tienen polígono; 4 de ellas están activas: 18413A, 1921B, 337A y 606.
- 2209B existe solo en el GIS.

## 4. Matriz de integración por módulo

| Módulo | Código fuente | Lee el Maestro Central | Maestro propio | Backend | Estado de integración |
|---|---|---|---|---|---|
| Producción | Sí (vanilla) | Es la fuente (copia 1) + override local (copia 2) | — | — | **Integrado** |
| Centro Maestro (shell) | Sí | Escribe la copia 2 (camino C) | — | — | **Parcial** (no transaccional) |
| Administrador SIAGRI | Sí | Abre `casur_master_data` | Validaciones propias (`casur-master-validations-v1`) | — | **Parcial** (camino D manual) |
| Estimador TCH | Sí | **No** | Sí: IDB `master` + `suertes.json` | — | **Ausente.** No tocar sin un encargo específico (`modules/tch/CLAUDE.md`; «no iniciar mejoras independientes») |
| Riego | **No**: solo bundles compilados. `index-R75-ESTABLE.js` parchea `…-ORIGINAL.js` reemplazando cadenas en tiempo de ejecución | Sí, solo lectura de `maestro_suertes_current` (casi siempre vacío, P2) | Sí: bootstrap + Supabase `master_lots` | Supabase propio | **Parcial y frágil.** No es mantenible desde el código fuente |
| Insumos | Sí (`app.js`) | **No** | Sí: `maestroArea`, `repairMaestro` | — | **Ausente** |
| Labores | **No** (bundle compilado) | **No** | Excel `datos/Cronologico_Maestro_2026.xlsx` | — | **Ausente** |
| Inventario | Placeholder | — | — | Supabase propio (fuera del repo) | No aplica |
| Conciliación | Redirección a otro repo | — | — | — | No aplica |
| GIS compartido | Sí (`shared/geo`) | Sus identidades se cruzan con el catálogo | Su propia `dataVersion` | — | **Integrado** para geometría, con la brecha P8 |

**[C] Service Worker y módulos.**
- Un único SW raíz (`sw.js`, scope `./`).
- Cada módulo es un bundle verificado con SHA-256 que declara `core/versions/runtime-assets.json` (11 bundles con sus
  dependencias). Las navegaciones solo se sirven desde un bundle ya preparado (`bundleRuntime`).
- El shell prepara el bundle con `PREPARE_BUNDLE` antes de cargar el iframe.
- Labores tiene su manifiesto y su `registerSW` desactivados, a propósito: una sola PWA.

**[P9] Un enlace directo a un módulo no funciona sin el shell** (lo comprueba el PoC). Si un módulo se abre directamente
(sin pasar por Inicio) en un dispositivo controlado por el SW cuyo bundle aún no se preparó, la respuesta es **503 «Módulo
no preparado…» incluso con red**. Afecta a cualquier enlace directo de Visitas (ver `VISITAS_CAMPO_ARQUITECTURA.md` §2).

## 5. Seguridad (hallazgos; no se reproducen valores)

| # | Hallazgo | Severidad | Acción recomendada (requiere autorización) |
|---|---|---|---|
| S1 | `modules/riego/LEEME.txt` publica en texto plano la contraseña del módulo administrativo de Riego. Si coincide con la que valida la edge function `casur-admin-master`, permite modificar `master_lots` en Supabase desde cualquier lugar | **Alta** | Rotar la contraseña en Supabase, retirarla del archivo y del historial de git (o darla por comprometida). Reemplazarla por Auth + RLS o por un secreto que solo conozca el administrador |
| S2 | `modules/insumos/LEEME.txt` publica la clave de Admin de Insumos | Media (la clave es solo del cliente: evita errores, no protege) | Retirarla del archivo. Documentar que no es un control de seguridad |
| S3 | `modules/labores/datos/` publica en el repositorio y en GitHub Pages `Nomina_2026.xlsx` (declarado `kind: payroll`), `Prefactura_2026.xlsx` y `CobrosAgosto_Y2026.xlsx` | **Alta** (datos privados en un repo público; contradice «no almacenar datos privados en GitHub») | Decisión del propietario: retirarlos de la publicación y valorar si se reescribe el historial. Mientras tanto se consideran expuestos |
| S4 | Las claves de cliente de TCH (`casur-master-unlocked`), del Centro Maestro y del PIN privado no cifran nada | Informativa | Ya está documentado en el README. Visitas no debe repetir el patrón para sus datos sincronizados (usar Auth + RLS) |

Ninguno de estos hallazgos se corrige en esta etapa (no se modifican servicios productivos sin autorización).

## 6. Lo que no se pudo verificar y cómo verificarlo

| Hipótesis | Verificación |
|---|---|
| **[H1]** Los dispositivos de campo y el del administrador tienen en IDB versiones distintas de las de GitHub (p. ej. una 1101 aplicada localmente o un maestro de Riego descargado de Supabase más nuevo que el bootstrap) | Ejecutar `tools/diagnostico/diagnostico-maestros-locales.js` en cada dispositivo (solo lectura, mismo origen). Compartir el JSON por un canal privado, nunca en GitHub |
| **[H2]** `master_lots` de Supabase difiere del bootstrap de Riego | Leer en Supabase en modo solo lectura (requiere credencial del propietario) o mediante el diagnóstico en un dispositivo que haya sincronizado |
| **[H3]** Las 59 diferencias de tipo de riego son formatos distintos («Aspersión» frente a «Aspersion»), no valores distintos | Tabla de correspondencia aprobada por el propietario antes de cualquier migración |
| **[H4]** Las 112–114 diferencias de destino de Insumos y TCH reflejan la decisión operativa de octubre (AIDOSA → Semilla y otras) | Cruzarlas con `changeHistory` y `operationalDecision` |
| **[H5]** Labores usa el Excel solo como catálogo de identidades y áreas | Sin código fuente, solo se puede verificar observando el bundle en ejecución |
