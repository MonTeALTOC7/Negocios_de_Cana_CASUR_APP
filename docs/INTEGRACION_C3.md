# C3 · candidata oficial de integración

Rama: `codex/c3-integracion-casur-candidata`.
Base técnica aprobada: C2 `522fa602a21748349806f70302d02e5108d9dbcb`.
Conserva la ancestralidad de PR #43 → #44 → #45, sin reescribirlos ni cerrarlos.
El HEAD, main remoto, estado CI y SHA del paquete candidato se registran en el
informe externo de C3. Esta documentación no autoriza merge ni publicación.

## Separación de código y datos

El PR dirigido a main contiene código y datos baseline ya publicados. No contiene
los siete archivos del aforo candidato ni copias de almacenamiento de usuarios.
El snapshot cifrado heredado de la preview #45 se excluye del árbol final y se
conserva íntegro fuera del checkout; sus commits originales siguen intactos.
Los helpers históricos de preview no forman parte del runtime oficial y no se
ejecutan en los ensayos de publicación. No se cambia Cloudflare ni Access.

La candidata oficial de datos es el paquete C1/C2, generación
`2026.10.25-aforo.1101`: seis JSON/JS y `integrity.json`, sin transformaciones ni
bootstrap, con `publishedAt: null` hasta autorizar la liberación. Su SHA y los
de cada recurso se cotejan con C1/C2 en QA externa. La cifra publicada de 948
suertes de molienda corresponde a participación operativa; se conservan las
dos decisiones, la Semilla activa 2003, las 430,50 t de 1927 y diez conflictos
administrativos pendientes. Los cálculos y la presentación de C2 no cambian.

## Gate y ensayo

1. Verificar `git status`, HEAD, main remoto y los tres PR abiertos.
2. Ejecutar `node tools/check-c3-candidate.mjs origin/main`, el gate completo
   `tools/check-c2-local.ps1` y `tools/check-release-policy.mjs origin/main`.
3. Preparar QA fuera del repositorio con `tools/prepare-c2-qa.mjs`, tomando el
   paquete C1 existente; comprobarlo con `tools/check-c2-data.mjs`.
4. Ensayar el SW oficial y el código integrado con
   `tools/qa-c2-updates.cjs <QA externa>` y su modo `--source-priority`.
   El servidor loopback sustituye los siete recursos de datos por los del
   paquete externo. No usa Cloudflare ni modifica bases o perfiles reales.
5. Guardar capturas PC/móvil, PDF/PNG reales, versiones, logs, SHA de registros
   antes/después, reapertura offline, 1.3.6 → candidata, checkpoint y recuperación.
6. Antes del push, comprobar vía API que Pages sigue en main:/ y que no hay
   workflows/hooks adicionales de despliegue. El commit C3 debe comenzar con
   `[CF-Pages-Skip]`: el proveedor documenta que omite ese despliegue sin cambiar
   configuración. Verificarlo con `check-c3-candidate.mjs origin/main --for-push`.
   No usar los prefijos genéricos de skip CI: el gate GitHub debe ejecutarse.
   La lectura del panel Cloudflare no estuvo disponible en C3; no se afirma
   haber verificado sus controles de rama. Se utiliza la omisión por commit,
   independiente de esos controles, y se comprueban los checks tras el push.
   Referencia: https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/
7. Solo tras esa comprobación, push de código C3, PR a main y CI del diff completo.
   Mantener #43/#44/#45 abiertos. No ejecutar merge ni workflow de despliegue.

La omisión de Cloudflare debe mantenerse en cada push C3. No modifica Access
ni evita las pruebas GitHub: solo impide publicar una build Pages de Cloudflare.

## Publicación posterior: condición previa y orden exacto

**Un merge del PR de solo código publicaría código nuevo con datos baseline. No
ejecutarlo como si ya incluyera el aforo oficial.** La aprobación posterior debe
identificar el HEAD candidato, el SHA del paquete externo, sus campos/canal,
metadatos de liberación y plan de recuperación. Pages puede publicar al merge.

1. Releer main, HEAD del PR, configuración Pages/Cloudflare y CI. Cancelar ante
   cambios no revisados, conflictos, checks pendientes o un proveedor no verificado.
2. Con autorización expresa del artefacto público y su fecha de liberación,
   aplicar únicamente los siete archivos candidatos a una rama de liberación.
   Completar solo los metadatos autorizados, regenerar los hashes afectados y
   `integrity.json`; no reprocesar Excel, fórmulas, decisiones ni generaciones.
   El guard C3 de solo código deberá sustituirse por la comprobación del
   manifiesto público autorizado como parte del cambio de liberación revisado;
   no deshabilitar el gate de regresión ni subir datos mientras siga sin permiso.
3. Producir el commit final de liberación y SHA final de datos. Comparar contra
   C3: solo metadatos aprobados y hashes derivados pueden diferir del paquete
   candidato. Repetir integridad, CI, casos especiales, offline y transición PWA.
4. La autorización de merge debe cubrir el commit/artefacto final resultante.
   Si no los cubre o el diff excede lo aprobado, detenerse y volver a revisión.
   No cerrar los PR acumulados antes de verificar la integración definitiva.
5. Solo con esa autorización posterior, integrar una vez en main, incluyendo
   código y datos en el mismo estado Git. Registrar el commit de main y la
   ejecución `pages-build-deployment`; esperar a que termine correctamente.
6. Consultar la URL GitHub Pages existente sin cambiar manifest/scope/origen.
   Verificar `sw.js`, versiones, 166 hashes runtime y los siete recursos por
   red sin caché. Contrastar cuerpo y SHA de JSON/JS con el manifiesto aprobado.
7. Verificar una instalación nueva y una existente: aviso real, instalación con
   un clic, aplazamiento, borrador/contexto, generación efectiva, cifras/casos,
   Histórico, PDF/PNG, cierre/reapertura offline y recuperación de la local.

## Recuperación y cancelación

Ante una publicación parcial, hash distinto, pérdida de contexto, mezcla de
generaciones o regresión, suspender toda promoción adicional y conservar logs.
No borrar IndexedDB, Cache Storage ni registros para ocultar un fallo.

Código: conservar el último commit productivo completo y su manifiesto. Una
recuperación debe ser un commit nuevo con identidad App/SW mayor que la fallida,
rehaciendo runtime y pruebas; bajar el número de versión o forzar una recarga
no es un plan seguro. Se requiere autorización expresa antes de publicarla.

Datos: el SW conserva la última generación íntegra y cada cliente usa una sola
generación. Corrupción o descarga incompleta no debe mover el puntero efectivo.
Para corregir datos ya promovidos, preparar una generación oficial completa
con versión posterior a la fallida y los valores restaurados desde el artefacto
íntegro aprobado. No reutilizar una identidad ni intentar retroceder su puntero.
Las generaciones locales siguen recuperables y las fijadas conservan prioridad.
Verificar las dos decisiones y el Histórico antes de autorizar recuperación.

No ejecutar una recuperación productiva automáticamente durante C3. Preparar
el artefacto, comprobarlo y solicitar la autorización aplicable al SHA exacto.
