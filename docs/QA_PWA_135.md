# Evidencia de hotfix 1.3.5 / Producción V1.5.1

Base: `34821beb844a0fe89a23ea9dd82b1ef2a4a8b951` (PR #40 integrado).
Rama: `codex/pwa-actualizaciones-versionado`. Sin merge ni despliegue.
Fecha de pruebas: 23-oct-2026; no es fecha oficial de publicación.

## Matriz

| Comprobación | Resultado |
|---|---|
| `node --test tests/*.test.mjs` | 60/60, incluye rechazo por hash inconsistente |
| `npm test --prefix modules/produccion` | 22 controles + 136/136 |
| `npm run validate --prefix modules/tch` | aprobado, incluye 91/91 |
| `npm test --prefix modules/tch` | 91/91 |
| `node tools/sync-versions.mjs` | versiones derivadas coherentes |
| `node tools/runtime-assets.mjs` | manifiesto de 159 recursos de código y visuales locales |
| `node tools/check-release-policy.mjs BASE_SHA` | shell PATCH, Producción PATCH, otros sin bump |
| `node --check` en JS/MJS/CJS cambiados | aprobado |
| `git diff --check` | limpio |
| Browser `tools/qa-pwa-updates.cjs` | 14 grupos previos + caso focal de primer acceso offline aprobados, SW real Chromium |
| `qa-gerencial-v2.cjs`, caso A | 4 PDF: ejecutivo 3 páginas / completo 6, ambos viewports |
| `qa-multifinca-recovery.cjs` | individual finca/suerte, Cronológico, PNG, shell/iframe/offline aprobados |

### Ciclo SW real

Servidor HTTP aislado sirve el commit original 1.3.4 y el hotfix. 1.3.6 se simula
en memoria y con hashes recalculados, no se publica. Se verifica instalación,
waiting, fallo de recursos, postergación recuperable, rechazo de checkpoint,
segunda pestaña con rechazo, ventana sin respuesta, ventana cerrada durante el
acuerdo, éxito offline, una recarga exacta por pestaña y confirmación.

Además del doble de prueba del protocolo, se usa el iframe **real de TCH**:
Suerte oficial 99325, edición del técnico sin guardar registro definitivo,
checkpoint de borrador, actualización offline, Continuar y recuperación del texto.
No GPS ficticio ni registros oficiales modificados. Se conservan centinelas de
IndexedDB v3, preferencia local, LKG y caché GEO. Pruebas en contextos nuevos que
no acceden al almacenamiento del usuario.

Caso focal adicional (`CASUR_QA_FIRST_OPEN_ONLY=1`): contexto nuevo, TCH nunca
abierto; instalar 1.3.5, preparar y aceptar 1.3.6 simulada, cortar red y abrir TCH.
Logo visible, formulario accesible, 159/159 recursos locales recuperables offline,
incluyendo código y recursos visuales de los demás módulos. Capturas inspeccionadas.
No se precargan los datasets TCH: en ese perfil sin visitas ni datos anteriores,
el módulo informa correctamente que no hay Maestro local y no puede seleccionar
una suerte oficial. Esto no invalida la recuperación del borrador y Maestro ya
descargado, acreditada en el caso multiventana anterior. No se afirma operación
completa sobre datos jamás descargados. Tampoco se acreditan servicios externos offline.

### Fecha efectiva

06-sep-2026 oficial; fecha inválida/ausente → N/D; generación identificada como tal.
Bridge real `CASUR_APPLY_REPORT_ROWS` con filas oficiales: publicación 15-nov,
importación siguiente sin fecha → N/D (no hereda 15-nov); overlay 16-nov.
Servidor de QA simula metadatos de una generación 17-nov sin alterar las cifras:
se adopta vía gate LKG y se recupera tras recarga completamente offline.
Esas fechas son exclusivamente escenarios de QA, no publicaciones oficiales.

### Exportaciones y cifras

Caso A, Dolores completa + Peirano 98301/98304/98304A, últimas cinco:
histórico 204.26 ha/zafra, TCH 61.20, KATM 108.63, TAH 6.65;
selección 187.41, 53.57, 105.66, 5.66; distancia 36.10 km.
Caso B: últimas tres, 188.84 ha/zafra, TCH 48.92, KATM 108.56.
Sin filas perdidas/duplicadas, desbordamientos de layout ni páginas vacías.
Revisión visual de las 3+6 páginas de escritorio y capturas de móvil; el completo
conserva la distribución previa (anexo Dolores separado). No se rediseñó el informe.
Los identificadores de versión y Novedades no se incorporan al informe.

## Archivos de evidencia en la laptop

`C:\Users\ctije\Videos\CASUR_PWA_135_QA\`

- `delivery/`: aviso 1440/390, postergación, rechazo, confirmación, borrador TCH,
  encabezado, Novedades, overlay, LKG offline y JSON de resultados/persistencia.
- `first-open/`: primer acceso TCH offline posterior a actualización, logo y
  comprobación de los 159 recursos locales; JSON con limitación de datos explícita.
- `exports/`: PDFs ejecutivo/completo, PNG de todas las páginas, conciliación y layout.
- `regression/`: PNG/PDF individuales, Cronológico, multifinca y exportación offline.
- Logs `shell-final.log`, `produccion-final.log`, `tch*.log`, `exports.log`,
  `regression.log`, `delivery-browser.log`.
- Regresión definitiva repetida: `shell-delivery.log`, `produccion-delivery.log`,
  `tch-validate-delivery.log`, `tch-delivery.log`.

## Limitaciones explícitas

- No se acreditó instalación física Android/iOS; móvil es viewport 390×844.
- 1.3.4 no tiene el diálogo nuevo. Guardar y cerrar ventanas antiguas para completar
  la transición; no se promete protección retroactiva del cliente viejo.
- Ventana directa de módulo sin protocolo bloquea actualización en caliente:
  cerrarla después de guardar y reintentar. Módulos sin bridge mantienen el contrato
  `unsupported`; no se inventa persistencia de formularios no integrados.
- Los recursos externos conservan sus restricciones de red/CORS. El código local
  precargado con imágenes/fuentes es aproximadamente 33 MiB; las generaciones anteriores se conservan
  por seguridad y pueden aumentar la cuota requerida. Fallo de cuota no activa.
- No hubo prueba física de impresión ni despliegue a GitHub Pages.
