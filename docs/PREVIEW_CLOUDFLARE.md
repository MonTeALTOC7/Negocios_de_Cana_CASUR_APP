# PR45: preview HTTPS independiente

Proyecto: `casur-negocios-preview`, cuenta `0a51301ab5cb16ce40f6c28316e2a472`.
Repositorio Git conectado: `MonTeALTOC7/Negocios_de_Cana_CASUR_APP`.
Única rama autorizada: `codex/estimados-plan-consulta-b2`.

## Estado y puesta en marcha

El proyecto se crea sin despliegues activos: producción deshabilitada y previews
deshabilitadas hasta verificar Cloudflare Access. No publica ni cambia GitHub Pages.
No utiliza proyectos, dominios ni reglas de GeoStudio.

1. Habilitar Access exclusivamente para el correo autorizado. Verificar rechazo
   anónimo en el alias de rama y en cada URL de despliegue, también para JSON/JS.
2. Mantener el dominio principal del proyecto sin contenido operativo. La protección
   nativa de previews no protege automáticamente ese dominio.
3. Tras verificar Access, configurar en el entorno preview
   `CASUR_PREVIEW_ACCESS_CONFIRMED=true`. No es un secreto ni sustituye Access.
4. Build: `node tools/build-pages-preview.mjs`; salida: `preview-dist`.
   Producción sigue deshabilitada. Previews: solo la rama autorizada.
5. Verificar `__preview.json` contra el HEAD del PR y los hashes del artefacto.
   Las URLs deben obtenerse del despliegue real; no se consideran verificadas
   hasta abrirlas desde una red externa y el navegador del usuario.

El builder copia los activos del manifiesto de integridad y una lista explícita
de datos operativos compartidos. No reconstruye motores ni modifica el SW fuente, datos,
versiones o manifiesto. Incluye todos los ejecutables requeridos por el SW,
incluso el HTML de redirección privado; este no contiene datos financieros y
queda sujeto a Access. No habilitarlo como una nueva aplicación financiera.

Nunca se copian Excel, datos locales aprobados, perfiles de navegador, respaldos,
carpetas de QA, credenciales, documentación interna ni archivos Git. Labores tiene
rutas heredadas que esperan Excel excluidos: no se acredita ese flujo financiero
en esta preview. Riego conserva su backend existente; no realizar pruebas de escritura.

Pages redirige normalmente los HTML a sus rutas canónicas. El builder genera
reglas de proxy HTTP 200 por HTML para impedir respuestas redirigidas en la caché
de navegación. Solo en el artefacto añade un comentario fijo al SW para provocar
una reinstalación normal en previews que ya cachearon el redirect inicial; no
cambia su lógica, versión, fuente Git ni borra cachés/IndexedDB. Los hashes del
manifiesto de código se conservan y el hash del SW derivado queda en `__preview.json`.

## Datos locales y aceptación

Usar el alias HTTPS estable de rama en el mismo navegador/perfil. La URL por
despliegue tiene otro origen y no comparte IndexedDB. La preview incluye ahora
la generación aprobada `2026.10.25-aforo.1101`: no requiere importar Excel.
Una generación personal ya existente conserva prioridad y no se sobrescribe.
Comprobar 99336, seis KPI, 18 columnas, PDF/PNG, reapertura, rollback y offline.
Access limita la red, no borra copias offline ya autorizadas.

## Recuperación del aforo aprobado

Se recuperó el registro `operational_generation:2026.10.25-aforo.1101` de una
copia aislada del blob del perfil Chromium QA `pr45-cronologico`, origen 4317.
El perfil original no se abrió ni escribió. La copia conserva el hash del blob
original. Se descomprimió Snappy y se leyó el contenido V8 compatible con objetos
JSON; el byte de versión de serialización se adaptó 16→15 solo en memoria para
el lector Node, sin modificar valores ni bytes originales.

El snapshot conserva Producción (catálogo, Cronológico, REPORTE, procedencia,
decisiones y plan) y Maestro asociado: 1.053 identidades en ambos. Su SHA de
fuente registrado coincide con la auditoría aprobada: `aa9ab25b863dc399d5a6d445c0efe7907ca8956ef868429f308a404a46267fc6`.
No se afirma haber recuperado ni vuelto a calcular los bytes del Excel original.
El archivo Excel actualmente disponible tiene otro hash y no se utiliza.

`tools/preview-data/aforo-1101.enc` contiene exclusivamente el snapshot derivado,
comprimido y cifrado AES-256-GCM. El manifiesto documenta hashes del blob,
snapshot y cifrado, fecha de archivo y conciliación. La clave vive exclusivamente
en la variable secreta de build **preview** `CASUR_PREVIEW_SNAPSHOT_KEY` del
proyecto `casur-negocios-preview`; nunca en Git, HTML, metadatos o logs.
Sin clave válida, SHA íntegro, procedencia exacta y conciliación, el build falla:
no sustituye el aforo por septiembre ni autoriza otra fuente por nombre.

El builder deriva únicamente los seis archivos de datos del artefacto, añade
un bootstrap inline al HTML de preview y recalcula su manifiesto de runtime.
La aplicación usa su helper canónico para presentar la generación y muestra
«Preview · Aforo 26/27 aprobado». No escribe el snapshot en IndexedDB ni cambia
el Maestro compartido de los otros módulos. El Maestro recuperado se valida
contra el catálogo y permanece dentro del snapshot cifrado.

El Histórico conserva íntegramente sus registros. Solo su envolvente de paquete
recibe la misma versión que Cronológico/version para la promoción atómica LKG;
`sourceDataVersion` documenta su versión histórica original. La lógica SW no
cambia: asciende de septiembre al aforo y rechaza un downgrade posterior.
El comentario de hosting del SW derivado identifica el hash del snapshot.

## Identidad de código por HEAD y actualización real

Cada artefacto declara `previewReleaseId = APP_VERSION + "-preview." + HEAD`.
Su SW usa una caché de código independiente `casur_master_shell_v<previewReleaseId>`.
El manifiesto runtime y el marcador de preparación deben coincidir con esa
identidad además de verificar todos los hashes. El SW de producción, su versión,
GEO, LKG y las bases IndexedDB no se modifican. Las cachés anteriores se conservan.

El worker preparado comunica esa identidad mediante `CASUR_UPDATE_INFO`, junto
con HEAD, APP_VERSION y nombre de caché. El controlador de actualizaciones
existente detecta la diferencia incluso si APP_VERSION sigue siendo 1.4.0.
«Actualizar ahora» utiliza el checkpoint multiventana y activa/reload una vez;
«Más tarde» conserva el código instalado. No se requiere Ctrl+F5 ni borrar datos.
El identificador visible de versión de la app continúa siendo el oficial.

`__preview.json` tiene una excepción de diagnóstico network-first dentro del SW
de preview, antes del fallback de navegación, y conserva su última respuesta en
la caché de ese código para consulta offline. No habilita acceso sin Access.

La ausencia de gráfico observada en la instalación anterior se reprodujo con
11598 registros históricos efectivos y 10 registros agregados de 99336 presentes,
pero `lotByCode` indefinido: el HTML cacheado tenía el bootstrap dentro de una
plantilla de exportación y el script del Histórico no terminaba de inicializar.
La corrección de inserción ya publicada se vuelve efectiva al instalar la nueva
generación completa de código. La validación compara Histórico JSON/JS y los
ocho valores originales 18/19–25/26; no reconstruye ni altera registros.

El build ejecuta `tools/verify-preview-aforo.mjs`: verifica los 163 hashes de
runtime, 185 archivos, conciliación y 99336; prueba el gate SW real en memoria
con caché septiembre, promoción, reinicio offline simulado y rechazo de datos
antiguos. Esto no sustituye el QA visual de navegador ni una prueba física móvil.

Conservar producción deshabilitada al revertir. Un rollback de código no debe
borrar IndexedDB, GEO, LKG ni datos del usuario. El proyecto de preview puede
deshabilitarse independientemente de GitHub Pages. No hay merge ni migración
de producción implícitos en este procedimiento.
