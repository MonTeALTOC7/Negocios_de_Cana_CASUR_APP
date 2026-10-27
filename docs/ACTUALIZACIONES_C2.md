# C2 · Candidata local de actualización PWA y datos

App 1.5.0 · Producción V1.7.0 · TCH 2.8.1. Sin publicación.
Base acumulada aprobada: PR #45, `6d6c790fec35d53f75da6cca9ff483cd535575cb`.

## Código

Se conserva un único SW raíz y el protocolo existente: preparar código íntegro,
espera, botón del usuario, checkpoint en todas las ventanas, activación y una
recarga por ventana. El nuevo cliente muestra «Nueva actualización CASUR
disponible», «Instalar actualización» y «Más tarde». El aplazamiento persiste
por versión y deja un acceso compacto. No hay confirmaciones al abrir la app.
Antes de activar se vuelven a comprobar los hashes del código preparado.

El usuario aprobó mantener «Actualizar ahora» en la primera transición desde
el código ya instalado 1.3.6. Sus textos y su checkpoint son los de esa versión;
los cambios nuevos rigen desde que la candidata queda instalada. Una versión
en espera también puede activarse por el ciclo nativo del navegador cuando se
cierran todos los clientes; no se fuerza una recarga de una app en uso.

El guard de actividad protege transacciones IDB, solicitudes de escritura,
captura GPS y formularios pendientes. TCH bloquea además el checkpoint durante
todo el procesamiento GPS, guardados, fotos y exportaciones. Producción conserva
el bloqueo propio de importación y bloquea PDF/PNG activos. Un rechazo conserva
la versión anterior y permite reintentar desde el mismo aviso. El contexto de
Producción y la sesión biométrica se restauran cuando siguen disponibles.

## Datos oficiales

Los seis archivos canónicos JSON/JS siguen siendo la unidad de datos.
`modules/produccion/data/integrity.json` acompaña esa unidad con seis SHA-256,
schemaVersion 1 y dataVersion. El SW comprueba los seis archivos, su equivalencia
JSON/JS, versiones, estructura y estabilidad del manifiesto antes de promover
LKG. La promoción escribe primero todos los recursos y sus hashes de contenido,
y mueve el puntero al final. Las lecturas offline verifican esos hashes.

La LKG anterior sin prueba criptográfica sigue siendo una fuente heredada
recuperable durante la transición; nunca se acepta una generación nueva de red
sin manifiesto. Los clientes en uso quedan fijados a un conjunto coherente.
La comprobación de actualización consulta la última generación, pero no mezcla
esos recursos con los que la página ya cargó. Las generaciones compartidas
anteriores se retienen para páginas activas. No hay limpieza de datos personales.

Una actualización de datos puede recargar solo el iframe de Producción, después
de su checkpoint y guardado del contexto. Una edición en curso la aplaza. Se
notifica una vez únicamente cuando cambian los datos efectivos, sin importar
Excel. No se anuncia como aplicada una generación bloqueada o solo descargada.

| Estado del usuario | Prioridad |
|---|---|
| Nuevo | Última generación oficial íntegra |
| Compartidos antiguos, sin trabajo pendiente | Actualización oficial automática |
| Local anterior sin personalización ni elección explícita de conservarla | Oficial más reciente automática, después del checkpoint; la local y su archivo siguen íntegros |
| Local personalizada, fijada o de procedencia no verificable | Se conserva; «Usar datos oficiales» permite cambiar sin borrar registros |
| Edición/importación/operación pendiente | Se protege; no se cambia la vista ni se fuerza instalación |
| Vista oficial con generación personal archivada | Puede volver mediante «Usar generación local guardada», también desde Centro Maestro; recuperarla la fija explícitamente |
| Offline | Mantiene la generación íntegra; al reconectar vuelve a comprobar y espera un checkpoint seguro |

Solo es sustituible automáticamente una importación operativa de contrato 1,
con `manualChanges: false` explícito en sus metadatos, versión coherente y copia
archivada de Producción y Maestro idéntica a los registros actuales. Una copia
ausente, divergente o con personalización explícita se conserva. No se deduce
la intención por el nombre del archivo. Se usa el comparador de versiones
existente (fecha y secuencia): una versión igual, anterior o no comparable no
provoca recarga automática. La comprobación relee el estado después del
checkpoint para respetar una importación o elección concurrente. Aplicar o
recuperar una generación local aprobada cuenta como elección explícita.

El cambio de fuente solo escribe la preferencia y el contexto de navegación;
la consulta de Producción, Maestro y archivo es una transacción IDB de lectura.
Centro Maestro distingue fuente efectiva y generación local guardada. Su
recuperación de fuente no ejecuta una restauración de registros históricos.

Elegir datos oficiales no borra ni modifica `produccion_current`, Maestro o su
archivo de generaciones. La elección no sincroniza los datos locales entre
dispositivos. Una edición legacy solo en memoria también bloquea el reemplazo.

## Preparación y comprobaciones

`node tools/production-integrity.mjs --write` genera el manifiesto de los seis
archivos de un directorio; sin `--write` lo verifica. La distribución usa LF
según `.gitattributes`. La fuente y los valores del aforo C1 no se modifican:
su paquete y el manifiesto de ensayo quedan en QA externa, nunca en Git.
El generador de paquetes del Centro Maestro incluye el manifiesto.

CI verifica metadatos, runtime, manifiesto de datos y pruebas. Las pruebas de
datos restringidos/Chromium se ejecutan localmente con `tools/qa-c2-updates.cjs`.
El modo `node tools/qa-c2-updates.cjs <QA externa> --source-priority` prueba las
seis transiciones solicitadas, personalización, igualdad de versión, elección
concurrente y overlay heredado; compara SHA-256 de todos los registros maestros
antes y después. `tests/official-source-priority.test.mjs` cubre la regla pura.
No subir perfiles QA, Excel, paquetes de aforo ni snapshots a Actions públicos.

La integración/publicación sigue pendiente de aprobar el SHA definitivo y los
campos/canal acordados en C1. GitHub Pages conserva enlace, scope e instalación;
no hay migración de origen ni una PWA nueva. No se modifica GeoStudio ni Cloudflare.
