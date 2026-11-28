# Maestro Central y Visitas de Campo — propuesta, plan y criterios de aceptación

Es el documento de cierre de la primera entrega (MC00). Usa las marcas de `MAESTRO_CENTRAL_DIAGNOSTICO.md`.

## 0. Índice de la entrega

| # | Entregable | Dónde |
|---|---|---|
| 1 | Diagnóstico | `MAESTRO_CENTRAL_DIAGNOSTICO.md` §1–3, 6 |
| 2 | Matriz de autoridad | `MAESTRO_CENTRAL_CONTRATO.md` §2 |
| 3 | Matriz de integración de módulos | `MAESTRO_CENTRAL_DIAGNOSTICO.md` §4 |
| 4 | Propuesta para los conflictos de área y estimados | §2 de este documento |
| 5 | Contrato | `MAESTRO_CENTRAL_CONTRATO.md` §3–6 y PoC `tools/poc/maestro-central-contract.mjs` |
| 6 | Simplificación del Centro Maestro | `CENTRO_MAESTRO_ACTUALIZACIONES.md` |
| 7 | Comparación independiente / integrada / híbrida | `VISITAS_CAMPO_ARQUITECTURA.md` §1 |
| 8 | Instalación y acceso directo | `VISITAS_CAMPO_ARQUITECTURA.md` §2 y PoC `tools/poc/pwa-visitas-coexistencia.cjs` |
| 9 | Arquitectura del módulo | `VISITAS_CAMPO_ARQUITECTURA.md` §3, 7, 8 |
| 10 | Modelo de datos | `VISITAS_CAMPO_ARQUITECTURA.md` §4 |
| 11 | Fotografías y respaldo | `VISITAS_CAMPO_ARQUITECTURA.md` §5 |
| 12 | Sincronización | `VISITAS_CAMPO_ARQUITECTURA.md` §6 |
| 13 | Seguridad, factibilidad y costos | `VISITAS_CAMPO_ARQUITECTURA.md` §9 y `MAESTRO_CENTRAL_DIAGNOSTICO.md` §5 |
| 14 | Propuesta propia de Claude | §1 de este documento |
| 15 | Plan y criterios de aceptación | §3–5 de este documento |

## 1. Propuesta propia [CL]: dónde coincido y dónde no

| Tema | Encargo [GPT] | Claude [CL] | Motivo |
|---|---|---|---|
| Fuente del Maestro Central | Centralizar en el almacén compartido | Usar como fuente común la **generación publicada y verificada por el SW**. IDB solo como override local transaccional | El almacén IDB está vacío en casi todos los dispositivos (P2); la generación publicada es igual en todos y ya está protegida (LKG) |
| Simplificar el actualizador | Un centro con cinco tipos | De acuerdo, sumando dos precisiones: el camino oficial real es el generador de desarrollo (A), y la app debe producir **el mismo paquete** que él. Además, retirar el camino C, que no es transaccional | Exactitud por encima de funcionalidad: sin esa equivalencia, el centro nuevo sería otra fuente de divergencia |
| Áreas | Cubrir todos los estados | Añadir el **área física** como variable nueva, con su autoridad, y no reutilizar `area` | El aforo trae 0 en las 51 suertes no productivas (P5); hoy el área física solo vive en el historial |
| Orden MC01–MC03 y VC01–VC05 | Secuencial: primero el Maestro, después Visitas | **Intercalado.** Visitas solo necesita el contrato de *lectura*. La unificación de escritura (MC02) es lo de más riesgo y no debe bloquear a Visitas | Visitas aporta valor antes y no toca datos oficiales |
| Instalación separada | Instalable aparte en Android | Viable en Chromium (PoC), pero exige un cambio en el SW (P9). La instalación en el dispositivo sigue siendo una **hipótesis** hasta probarla en la preview HTTPS | No afirmar capacidades sin comprobarlas |
| Supabase | Para los datos estructurados | De acuerdo, pero **en una fase posterior (VC03)**. El MVP es local-first, con respaldo ZIP | Auth, RLS y el cupo de proyectos gratuitos están por resolver; el MVP no debe depender de ellos |
| Riego | Integrarlo al maestro | No tocar sus bundles. Primero, el diagnóstico en los dispositivos (H2) y decidir si se recupera el código fuente | Parchear bundles minificados es frágil y no es auditable |
| Seguridad | — | Priorizar S1 y S3 (contraseña de Riego y nóminas publicadas) **antes** de sumar datos nuevos al repo o a Supabase | Seguridad antes que funcionalidad nueva |

## 2. Conflictos de área y estimados: propuesta

| Caso | Situación hoy (1102) | Propuesta |
|---|---|---|
| Suerte presente con estado no productivo (Sin Caña, Baja rentabilidad, Investigación, Baja definitiva) | `area = 0` según la fuente del aforo | `inventoryArea = 0` (lo que dice el aforo). Nuevo **`physicalArea`**, tomado del cronológico SIAGRI o de la última no nula conocida (`changeHistory.previousArea`) con su versión. Se excluye del área activa por estado, **no por área** |
| Suerte ausente de la fuente (7) | `area = 0`, `inventoryArea` heredada | `presence: absent`. Conserva `physicalArea` y sus atributos como `inherited`. No suma al área activa ni se borra. Tampoco es baja |
| Activa (Molienda o Semilla) sin estimado | Admitida con advertencia (decisión del 25-Oct) | `estimate: missing`. **Sigue en el área activa**; se excluye solo del denominador del TCH estimado. Se informa la cobertura |
| TCH estimado 0 en una activa (p. ej. 2003 Semilla) | Admitido | Se conserva el 0 de la fuente. No vuelve inactiva la suerte |
| Diferencias de área entre los módulos y la 1102 (148) | Cada módulo con su copia | Las 58 «cero↔no cero» se resuelven con `physicalArea`. Las 47 de ≤0,02 ha se aceptan como remensura de la generación vigente. Las 43 restantes se revisan una a una, con el propietario, antes de migrar un módulo |
| Renovación, pérdida parcial o total | No representadas | Eventos explícitos `{tipo, fecha, área afectada, fuente, autor}` en una capa propia. Nunca se deducen del TCH ni del área |
| Partición (13 → 13A/13B) | Solo el sufijo | Alta con `parent` opcional. La identidad madre pasa a `absent` y conserva su historia. Su geometría se versiona en la capa E |
| Suerte sin polígono (4 activas) | Sin mapa | Sigue en el catálogo y en los totales. En Visitas se elige manualmente |

Ninguna de estas reglas recalcula estimados oficiales ni convierte un desconocido en 0.

## 3. Plan reorganizado

| Etapa | Contenido | Runtime / versión | Riesgo | Depende de |
|---|---|---|---|---|
| **MC00** (esta) | Auditoría, PoC (contrato y PWA), diagnóstico de solo lectura y los 5 documentos | Ninguno. Sin bump | — | — |
| **S0** | Seguridad: retirar y rotar S1, decidir S3 | Datos o archivos públicos. Decisión del propietario | Bajo | Autorización |
| **MC01** | Contrato de lectura en `core/shared-data/maestro-central.js` (desde la generación publicada); pantalla de diagnóstico de solo lectura en el Centro Maestro; camino C pasado por `commitOperationalDataset` | Sí (bump de patch) | Bajo | MC00 |
| **VC01** | MVP de Visitas, local-first: bundle propio, cambio P9 del SW, IDB propia, flujo de 14 pasos (§4), fotos y respaldo ZIP con restauración | Sí (bump de minor) | Medio (SW) | MC01 (lectura) |
| **VC02** | Expediente del productor, seguimiento de recomendaciones y solicitudes, mapa e informes (motor movido a `shared/reports/`) | Sí | Medio (motor de informes) | VC01 |
| **MC02** | Asistente «Actualizar maestro» de 10 pasos, tipos A–E, sellos por capa y `physicalArea`; aceptación por paridad con el generador | Sí | **Alto** (datos oficiales) | MC01 |
| **VC03** | Sincronización con Supabase: proyecto nuevo, Auth, RLS, cola idempotente y conflictos | Sí | Medio | Cupo y credenciales del propietario |
| **MC03** | Migración progresiva de los módulos: Insumos, luego Labores y Riego (según la decisión sobre su código), TCH solo con encargo; lectura en sombra y luego conmutación | Sí, por módulo | Medio | MC02 + paridad |
| **VC04** | Importación GIS controlada, informes de período, OneDrive opcional y mejoras de campo | Sí | Bajo | VC02 |

Cada etapa con runtime sigue el mismo ciclo: rama propia, Draft PR, preview HTTPS sin datos privados reales, QA, y merge y
publicación **solo con autorización**.

## 4. MVP (VC01): flujo de aceptación en 14 pasos

1. Abrir Visitas desde Inicio **y** por enlace directo, con red y sin red (después del primer uso).
2. Identificar al técnico: nombre local, y cuenta desde VC03.
3. «Nueva visita»: elegir productor (búsqueda por código o nombre en el contrato del maestro).
4. Obtener el GPS con su precisión visible.
5. Proponer la suerte por point-in-polygon y confirmarla, o elegirla manualmente si no hay polígono o hay ambigüedad.
6. Mostrar la ficha de la suerte desde el maestro y congelar la instantánea (`masterSnapshot`) en la visita.
7. Completar el formulario progresivo: los campos condicionales cambian según riego o secano y según el estado.
8. Dictar observaciones con el teclado del sistema.
9. Tomar fotos con la cámara y agregarlas desde la galería; se guarda el original intacto con su `sha256` y se genera la copia
   rotulada.
10. Registrar recomendaciones (seguimiento en estado «Pendiente») y solicitudes (estado «Solicitada»), sin crear pedidos ni
    registros en SIAGRI.
11. Autoguardado: cerrar la app a mitad de la visita y recuperar el borrador al volver.
12. Cerrar la visita. Las ediciones posteriores generan revisiones.
13. Ver la visita en «Mis visitas» y en el expediente del productor.
14. Exportar el respaldo ZIP (datos, fotos y Excel), borrar el perfil y restaurarlo con integridad verificada: los `sha256`
    coinciden y no hay duplicados.

## 5. Pruebas obligatorias (24)

| # | Prueba | Etapa |
|---|---|---|
| 1 | Identidad: ceros a la izquierda, suertes alfanuméricas y sin uso de `codLote` | MC01 (PoC ✔) |
| 2 | El contrato de lectura devuelve la misma generación que Producción, online y offline | MC01 |
| 3 | El contrato es inmutable y la fuente no cambia | MC01 (PoC ✔) |
| 4 | El diagnóstico de solo lectura no escribe ni crea bases (conteos antes y después) | MC00 ✔ |
| 5 | El camino C deja `produccion_current` y `maestro_suertes_current` coherentes o no escribe nada | MC01 |
| 6 | Una actualización A conserva por identidad el aforo, el plan y el histórico | MC02 |
| 7 | Una actualización B no altera los atributos de A sin una decisión explícita | MC02 |
| 8 | Ausente ≠ baja; sin estimado ≠ fuera del área; TCH 0 ≠ inactivo; desconocido ≠ 0 | MC01/MC02 (PoC ✔ parcial) |
| 9 | Partición: madre e hijas con linaje y con la historia conservada | MC02 |
| 10 | La restauración de la generación anterior es exacta (hash) | MC02 |
| 11 | El paquete de la app es idéntico al del generador reproducible para la 1102 | MC02 |
| 12 | Release Gate, `check-release-policy` y `runtime-assets` en verde con el bundle `visitas` | VC01 |
| 13 | Enlace directo a Visitas controlado por el SW, con red y antes de abrir el shell: 200 | VC01 (PoC ✔ variante B) |
| 14 | Visitas offline, directa y desde el shell; la App Maestra no cambia | VC01 (PoC ✔) |
| 15 | Instalación separada en Android (WebAPK) con su icono y nombre, conviviendo con la App Maestra | VC01, en un dispositivo real |
| 16 | Los módulos existentes no muestran regresión: `qa-produccion-publicada` y QA de TCH en verde | VC01 |
| 17 | Visitas no escribe en ninguna base ajena (`casur_master_data`, `casur-estimador-tch`, `insumos_casur_db`, `casur_riego_db`) | VC01 |
| 18 | El borrador se recupera después de cerrar la app a mitad de la visita | VC01 |
| 19 | GPS: point-in-polygon correcto, con confirmación en caso de ambigüedad o mala precisión | VC01 |
| 20 | Foto: el original es byte a byte el capturado (hash) y conserva el EXIF; la copia rotulada va aparte | VC01 |
| 21 | ZIP grande dividido sin agotar la memoria (perfil Android de gama media) | VC01 |
| 22 | Restauración idempotente: dos restauraciones no duplican y no se pisa un registro más nuevo | VC01 |
| 23 | Sincronización: reintentos idempotentes, conflicto visible y RLS que impide leer visitas ajenas | VC03 |
| 24 | Informes: estándar editorial (`qa-informes-norma`) en verde para los informes de Visitas | VC02 |

## 6. Decisiones que necesita el propietario

1. Seguridad S1, S2 y S3: rotar y retirar, y si se reescribe el historial de git.
2. Riego: recuperar el código fuente de la v6, o mantenerlo con un adaptador externo sin parchear bundles.
3. Supabase para Visitas: cupo de proyectos gratuitos y quién administra Auth.
4. Aprobar `physicalArea` y la tabla de correspondencia de valores (tipo de riego y destino) antes de MC02 y MC03.
5. Aprobar el orden intercalado del §3.
