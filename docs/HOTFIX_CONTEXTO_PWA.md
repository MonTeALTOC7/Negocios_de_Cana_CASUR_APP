# Hotfix de contexto PWA · candidata 1.5.2

Base publicada: `4125f61498e428d4c3be10ddacabc290cbe3d44a`.
Cliente legacy real: `74231a1e4cbc7ff4e0207017e104d036d9c8f02e` (App 1.3.6).
Incidente: CASUR-PUB-20261027-LEGACY-CONTEXT.
Rama independiente: `codex/hotfix-pwa-context`, creada desde main actual.
App/SW 1.5.2 · Producción V1.7.2 · TCH 2.8.1 · Histórico V2.9.
No autoriza merge ni publicación de esta candidata.

## Causa comprobada y cobertura que faltaba

La 1.3.6 original llama al checkpoint del bridge de Producción, que devuelve
`{ok:true,status:'noop'}`. Su shell no llama a `CASUR_SAVE_UPDATE_CONTEXT`;
esa función y `CASUR_CRONO_SELECTION` no existen en ese cliente. El hash de
localStorage/sessionStorage no cambia al cambiar de 99336 a otra suerte y
volver. La ficha está en memoria/DOM; tras recargar no existe un identificador
persistido que permita reconstruirla. Los catálogos IDB que contienen 99336
no representan una selección y no se usan para adivinarla.

El ensayo C4 B sí usó el código original, pero comprobaba el borrador TCH y
los hashes de almacenamiento. Abría Producción después de actualizar; no había
dejado 99336 abierta antes ni exigía su recuperación. El caso D comprobaba una
ficha seleccionada desde el cliente moderno antes de una actualización futura.
Esas pruebas no demostraban recuperación de contexto desde 1.3.6; el informe
anterior excedió esa cobertura. Los dos drivers actuales verifican la ficha
antes de actualizar y distinguen la limitación legacy de restauración completa.

En 1.5.1 sí existe un snapshot de navegación. Se detectaron además riesgos
independientes: se eliminaba antes de aplicar/restaurar, se restauraba al load
sin esperar al último initCurrent ni a la lectura de overlay, y no incluía el
periodo del Histórico individual. Las dos primeras condiciones se ejercitan
con inicialización demorada; la tercera se demuestra con el código publicado
original y su snapshot real. No se atribuye a esas condiciones la ausencia de
snapshot demostrada en 1.3.6.

## Contrato implementado

- La lectura de overlay expone una promesa. Producción emite una señal de
  preparación después del último initCurrent y de resolver esa lectura.
- El checkpoint conserva sus bloqueos de trabajo. Si el cliente moderno aún
  no puede guardar contexto, rechaza la activación y permite reintentar.
- El contexto incluye vista individual/múltiple, finca/suerte, Histórico,
  periodo/zafras, secciones, subvista y scroll. La ruta del shell se conserva.
- Un snapshot versión 2 se guarda por ventana en sessionStorage. Para una
  actualización preparada se conoce la versión destino mediante el SW ya
  esperado; no cambia el protocolo de activación ni añade recargas.
- Solo después de inicializar controles y datos se filtran identidades contra
  la generación efectiva y se aplica el contexto. Se consume después de éxito;
  un registro más nuevo no puede ser eliminado por un callback anterior.
- La entrada real del usuario cancela una restauración antigua. Si la entrada
  ocurrió durante el arranque, se conserva su intención en memoria y se aplica
  sobre los datos ya inicializados, con la misma validación de identidades.
- pagehide conserva la consulta para una recarga/reapertura posterior, sin
  reemplazar un checkpoint pendiente. Salir a otro módulo cancela el intento
  anterior y no fuerza volver a Producción al arrancar.
- Un respaldo local de navegación pendiente puede recuperar un arranque frío
  únicamente si es único, corresponde a la versión instalada, tiene menos de
  24 horas y su ruta es Producción. La adopción se serializa con Web Locks.
  Si hay varias ventanas pendientes, se informa y no se elige una al azar.
  En navegadores sin Web Locks no se adopta el respaldo de otra sesión.
- Una entidad ausente o un periodo no guardado se informa en una línea discreta
  visible fuera de acordeones cerrados. No se inventa otra suerte.

Solo se escriben claves propias de navegación. No se escriben datasets, IDB,
generaciones, formularios, biometrías ni datos del aforo desde este mecanismo.
Las funciones existentes siguen protegiendo ediciones, importaciones, GPS,
escrituras y PDF/PNG en curso. No hay limpieza de almacenamiento de usuarios.

## Límites que deben figurar en la revisión

**1.3.6 → candidata: recuperación parcial demostrada.** Se conserva módulo,
trabajo, borrador y datos; se informa que puede ser necesario volver a elegir
la suerte. No se declara recuperada una ficha que no fue persistida. Esto no
bloquea instalar una actualización íntegra desde ese cliente legacy.

**1.5.1 → candidata:** la ficha cronológica 99336 sí puede recuperarse desde
su snapshot existente. La versión publicada no guardaba el periodo individual
del Histórico: puede recuperarse la finca, pero no deducirse ocho zafras que
solo estaban en memoria; se informa esa recuperación parcial. Las selecciones
y periodos que sí constan en el contrato antiguo se respetan.

**Candidata → futura sintética:** se exige restauración completa de todos los
campos del contrato nuevo, incluida identidad visible, acordeón abierto,
periodo, varias ventanas, reconexión y reapertura donde hay respaldo válido.
Una selección ya incompatible se descarta de forma explícita y no se sustituye.

## Pruebas y datos

`node --test tests/context-store.test.mjs` cubre consumo, cancelación, escritura
fallida, controles pendientes, formato 1.5.1 y aislamiento/ambigüedad de respaldo.
`tools/qa-context-hotfix.cjs` sirve 1.3.6 y 1.5.1 desde sus objetos Git originales,
sin modernizar sus scripts. Solo la versión futura sintética cambia identidad
y puede demorar la señal final de inicialización. Las aserciones comprueban
hash/ruta, iframe, finca, suerte, visibilidad, acordeón y generación efectiva.
El modo `--published-history` demuestra el límite del periodo 1.5.1.

`tools/qa-c2-updates.cjs` conserva las regresiones y ahora exige la ficha 99336
abierta antes del cambio legacy, y su aviso real después. Las pruebas de GPS,
borradores, exportación, multiventana, fuentes locales, offline y fallos siguen
activas. Se ejecutan PC y móvil emulado con perfiles QA nuevos y separados.
El gate conserva Shell/GEO, Producción, TCH, política de versiones e integridad.
El guard C4 congelado se aplica a C4; el hotfix tiene un guard de alcance y
metadatos propio, sin desactivar las regresiones ni la validación de datos.

Los siete recursos oficiales son idénticos a main publicado y al manifiesto
C4: generación `2026.10.25-aforo.1101`, publishedAt null, SHA sin modificaciones.
El runtime contiene 167 recursos (166 anteriores más context-store.js).
Los resultados completos, capturas, HEAD/PR/CI y SHA del paquete se registran
en el informe externo de entrega para evitar una referencia circular de HEAD.

## Publicación posterior y recuperación

Esta tarea solo prepara un PR de código independiente. Antes de push se
revalidan main, Pages main:/, workflows/hooks y la omisión Cloudflare. Todos
los commits enviados empiezan por `[CF-Pages-Skip]`; se mantiene el CI normal.
No se cambia Cloudflare/Access, GeoStudio, #44 ni #45.

Para publicar se necesita una autorización nueva que identifique el HEAD y
SHA del artefacto del hotfix. Con ella, releer main y PR, esperar el gate del
HEAD exacto, comprobar tree/diff y datos, y hacer un único merge commit cuyo
mensaje también comience por `[CF-Pages-Skip]`. Esperar Pages SUCCESS y
verificar red, nueva instalación, cliente 1.5.1 y límite 1.3.6 declarado.
Conservar URL, origen, scope, manifiesto, siete archivos y almacenamiento.
No modificar publishedAt ni crear otro artefacto bajo el mismo SHA aprobado.

Ante un fallo, conservar evidencia y LKG; no reset, force push, downgrade ni
borrado de IDB/Cache Storage. Preparar una identidad de App/SW posterior a la
fallida, sin alterar datos íntegros, y solicitar aprobación de su nuevo HEAD
y paquete antes de otra publicación. No reutilizar identidades de datos.
El incidente productivo permanece abierto hasta una publicación autorizada y
su verificación real; preparar este PR no cambia producción.
