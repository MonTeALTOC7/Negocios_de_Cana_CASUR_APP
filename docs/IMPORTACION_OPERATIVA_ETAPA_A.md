# Maestro CASUR · importación operativa por contenido (Etapa A)

Base: main `74231a1e4cbc7ff4e0207017e104d036d9c8f02e`.
La conexión HTTPS/Git se recuperó sin cambiar certificados, DNS, proxy o credenciales.
Se reutilizó la auditoría de los Excel; los datasets publicados no se sustituyen en este PR.

## Arquitectura y contrato

1. `core/imports/workbook-reader.js` convierte el libro con SheetJS local en
   matrices de valores tipados y fórmulas con coordenadas originales. El archivo
   no sale del navegador y no se ejecutan fórmulas financieras del libro.
2. `core/imports/operational-import.js` reconoce encabezados exactos/equivalencias
   semánticas, combinaciones de campos y contenido. No consulta nombres de hojas
   ni posiciones de columna fijas. Una hoja puede aportar varios perfiles.
3. El Centro Maestro de Producción presenta candidatos, mapeos, diferencias,
   universos y advertencias. La selección de archivo nunca modifica datos.
4. Aprobación explícita → `commitOperationalDataset()` → una transacción IDB v1
   guarda Producción y Maestro Central, respaldo anterior, baseline y archivo de
   generación. Si falla una escritura o cambió la versión, aborta todo.
5. El bridge existente lee la generación aprobada completa; no vuelve a convertirla
   a filas que pierdan atributos. Histórico (`APP_DATA`) permanece independiente.

Los perfiles son Cronológico, Estimados, Plan e Histórico largo. Requisitos de
identidad/área y tipos excluyen coincidencias superficiales. Las columnas ambiguas
quedan sin asignar; el usuario debe mapearlas. Varios inventarios requieren elección.
Un plan fraccionado o histórico nunca sustituye al inventario.

Se conserva el puente REPORTE. Su adaptador SIAGRI ahora comprueba la identidad
compuesta con el mismo contrato. La entrada de Excel completo de Producción se
redirige al nuevo importador; los modos de corrección parcial/histórico mantienen
sus contratos anteriores. El Centro Maestro del shell ofrece acceso al flujo,
conservando el desbloqueo del administrador del módulo.

El Convertidor SIAGRI clásico conserva su UI y su normalización existente; no se
amplió aquí su motor general de estimados ni su regla legacy de estados. Para el
nuevo aforo debe utilizarse el nuevo flujo, que no hereda esas inferencias.
La importación masiva de Histórico (incluido su formato ancho Z.*) requiere fase
posterior; se trata únicamente como referencia. No se importan sus filas al motor.

## Identidad, procedencia y universos

Identidad: código de hacienda + suerte normalizados, con componentes originales;
no se corta CodSuerte para adivinar hacienda/suerte. Se comprueban colisiones y
duplicados. Un formato numérico de Excel `00` conserva sus ceros en la identidad.
La segunda columna HHHSSS auxiliar se descarta como llave cuando no concuerda
con los componentes de todas las filas.

Cada registro conserva `permanentIdentity`, `sourcePresence`, `operationalState`,
`classification`, `participatesCurrentArea`, `participatesMilling`, `changeHistory`,
`source` y procedencia por campo (hoja/fila/columna/encabezado/valor/tipo/fórmula).

| Universo | Regla propuesta y visible antes de aprobar |
|---|---|
| Inventario | Área de origen de las identidades presentes, incluida área cero |
| Área activa | Molienda + Semilla con área positiva, salvo baja documentada |
| Molienda | Solo clasificación de zafra Molienda y área positiva |
| Toneladas de molienda | Área de molienda × TCH estimado válido, conservando el cero real |
| Denominador TCH | Área de molienda con estimado válido; cobertura y denominador separados |
| Investigación / baja rentabilidad | Permanecen en inventario; no suman área activa/molienda |
| Sin Caña / ausente / baja documentada | Permanecen consultables; área activa y estimado excluidos |

Ausente no significa baja definitiva. Una identidad ausente puede reincorporarse;
una baja documentada no se activa automáticamente. En las ausentes se conserva
el área anterior solo como referencia, con área operativa cero.

Área válida nueva sustituye la anterior. Área faltante/inválida bloquea. Un vacío
explícito de una fecha no hereda la siembra de un ciclo anterior. Campos no aportados
pueden conservar referencias anteriores con motivo y versión de procedencia en
`inherited`; no se declaran valores actuales de la nueva fuente.

TCH anterior, estimado y plan son independientes. `forecast` conserva zafra,
clasificación, área, TCH/toneladas de origen. Los campos legacy `tchEst2627` y
`tonEst2627` solo se rellenan para 26/27; no se etiqueta otra zafra como 26/27.
La ampliación visual del nuevo módulo Estimados y de campañas futuras queda para
Etapa B. El importador admite variaciones de encabezado actTCH de otras zafras.

El plan conserva fecha propuesta original/tipo, corte propuesto, fecha base, edad
aportada y edad calculada (días / 30,4375), sin tratarlo como fecha ejecutada.
Desviaciones de edad >0,1 mes o fechas no válidas producen advertencias. Una fecha
sola no marca una cosecha como programada (`scheduled:false`).

Las líneas fraccionadas se guardan separadas del inventario, con ID de línea,
fracción, área y toneladas propuestas. `planAudit` concilia cada identidad y sus
fracciones. Sus toneladas de escenario no sustituyen el estimado de molienda.

## Conciliación de las fuentes proporcionadas

Extracción: 1 hoja. Libro completo: 26 hojas. Inventario común: encabezado fila 3,
1.046 identidades con valores coincidentes entre ambas fuentes. Encabezado de
estimado: actTCH_2627 en extracción / actTCH en libro completo. Sin duplicados de
inventario ni llaves nuevas frente a las 1.053 identidades publicadas.

| Clasificación | Suertes | Área inventariada ha | t de origen |
|---|---:|---:|---:|
| Molienda | 949 | 9.126,60 | 563.187,9696909501 |
| Semilla | 46 | 448,06 | 0 |
| Investigación | 2 | 3,08 | 184,80 |
| Sin Caña | 34 | 0 | 0 |
| Baja rentabilidad | 15 | 94,39 | 0 |
| Total | 1.046 | 9.672,13 | 563.372,7696909502 |

Área activa propuesta: 9.574,66 ha / 995 suertes. Molienda: 9.126,60 ha y
563.187,9696909501 t; TCH 61,708409450501826 con cobertura 100% (incluye el
estimado cero válido). Investigación no entra al numerador de molienda.

Siete ausentes: 14710A, 902A, 3313, 3316A, 3325, 3327, 3328. Se conservan las
1.053 identidades. Se confirmaron 130 cambios de área y seis diferencias textuales
de nombre; la incorporación de clasificación/procedencia implica otros cambios
de contrato que no deben confundirse con correcciones de área.

- 49404A: Sin Caña, 0 ha; no hereda 5,67 ha anteriores.
- 2003: hacienda 20/suerte 03, destino Semilla y clasificación Molienda, estimado
  cero. Se conservan los dos atributos y se requiere revisión de su advertencia.
- Plan: 1.050 líneas / 1.046 identidades. Fraccionadas: 99207, 277, 2902, 531.
- AE1: `SUM(AE4:AE1048)` excluye fila 1049 (21102, 179 t) y contiene 184,80 t
  de Investigación. Su total 563.193,7696909502 no es el total de molienda.
  El importador advierte el rango incompleto y calcula desde las filas clasificadas.

Mapeo: Cod. Hacienda + Ste → identidad; Nombre Hacienda → nombre; Area Ha →
inventario; Clasificacion → clase de zafra; Nombre Destino del Cultivo → destino;
Tch.Ant → ejecutado anterior; actTCH[_2627] → estimado; Toneladas → control;
Dt/Km → kilómetros (no Surco); Fecha propuesta (Plan 601K), Tipo de Corte,
Fecha-maestro y Edad corte → plan. Las columnas optimistas/Est. V04 no sustituyen
las anteriores. Z.* e hist permanecen referencia, sin cambiar producción ejecutada.

## Recuperación, publicación y versiones

DB `casur_master_data`, versión 1, store `datasets`, sin migraciones. Se mantienen
las claves actuales y se añaden `operational_previous`, `operational_baseline`,
`operational_generation:<versión>` y eventos. Se rechaza reutilizar una versión
archivada; rollback no sobrescribe el archivo de esa generación. No hay limpieza
de IndexedDB, localStorage, GEO o LKG.

Una generación local aprobada no se reemplaza silenciosamente por la publicación
remota al enfocar/abrir la app. Puede recuperarse la anterior desde el mismo panel.
Las políticas del Service Worker y del LKG no se cambian: la preferencia afecta
solo a la vista local aprobada. El guard de versión impide aplicar una previsualización
si otra ventana cambió el dataset.

El paquete de datos existente conserva el catálogo y los campos de procedencia
en los detalles del Cronológico. Incluye el Histórico sin alterar sus filas para
mantener la coherencia de generación del gate existente. No requiere recompilar
código para cada actualización de datos bajo este contrato. La publicación sigue
siendo una acción administrativa independiente; seleccionar/aplicar local no publica.

SemVer: Producción V1.6.0 MINOR por nueva capacidad; shell 1.4.0 MINOR por contrato
compartido, acceso y persistencia. Histórico funcional V2.9, TCH 2.8.0 y otros módulos
sin incremento. SW solo incrementa APP_VERSION; las notificaciones corregidas en
1.3.6 permanecen intactas. Manifiesto SHA-256 regenerado, sin nueva generación GEO.

## Aprobación de datos oficiales

Este PR publica código, no los Excel ni un dataset oficial nuevo. Antes de aplicar
en un perfil real, el usuario debe confirmar: hoja/campos, zafra y versión, universo
completo, las siete ausencias, clases/áreas, conflicto 2003 y los avisos de calidad,
incluidos AE1, diferencias de edad y cobertura del plan. La casilla de aprobación
es obligatoria y se invalida al cambiar archivo, campos, zafra o versión.

El checkpoint del módulo bloquea navegación/actualización PWA mientras hay una
importación pendiente o transacción en curso. Aplique o descarte explícitamente
la previsualización para continuar; no se afirma que el archivo sin aplicar esté
persistido como un borrador. La generación aprobada sí queda guardada offline.

La auditoría original y su matriz detallada se conservan fuera del repositorio en
`C:\Users\ctije\Videos\CASUR_ETAPA_A_QA\`. No se adjuntan datos financieros ni
los Excel originales a un repositorio público.
