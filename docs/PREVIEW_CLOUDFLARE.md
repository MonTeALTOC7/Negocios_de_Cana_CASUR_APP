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
de datos operativos compartidos. No reconstruye motores ni modifica el SW, datos,
versiones o manifiesto. Incluye todos los ejecutables requeridos por el SW,
incluso el HTML de redirección privado; este no contiene datos financieros y
queda sujeto a Access. No habilitarlo como una nueva aplicación financiera.

Nunca se copian Excel, datos locales aprobados, perfiles de navegador, respaldos,
carpetas de QA, credenciales, documentación interna ni archivos Git. Labores tiene
rutas heredadas que esperan Excel excluidos: no se acredita ese flujo financiero
en esta preview. Riego conserva su backend existente; no realizar pruebas de escritura.

## Datos locales y aceptación

Usar el alias HTTPS estable de rama en el mismo navegador/perfil. La URL por
despliegue tiene otro origen y no comparte IndexedDB. Importar el Excel autorizado
localmente y aprobar mediante el flujo existente; nunca subirlo a Pages.
Comprobar 99336, seis KPI, 18 columnas, PDF/PNG, reapertura, rollback y offline.
Access limita la red, no borra copias offline ya autorizadas.

Conservar producción deshabilitada al revertir. Un rollback de código no debe
borrar IndexedDB, GEO, LKG ni datos del usuario. El proyecto de preview puede
deshabilitarse independientemente de GitHub Pages. No hay merge ni migración
de producción implícitos en este procedimiento.
