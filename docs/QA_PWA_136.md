# Hotfix PWA 1.3.6 — notificaciones exclusivamente de actualización pendiente

Base oficial: `e31c1c166f2498fbfaebea266e4867f8be123b1f`, App 1.3.5 / Producción V1.5.1.
Rama: `codex/pwa-1-3-6-notificaciones`. QA: 23-oct-2026 (no fecha de publicación).

## Diagnóstico y cambio

Reproducido en Chromium: crear una caché de shell 1.3.4 y abrir una sesión nueva
con 1.3.5 muestra la confirmación incorrecta. La existencia de cachés anteriores
no acredita una actualización reciente; el marcador era de sesión.

1.3.6 elimina toda confirmación automática, deja de escribir su marcador y retira
únicamente `sessionStorage['casur-update-confirm']`. Conserva las cachés anteriores
y los demás datos. Una notificación exige un SW en espera distinto del controlador,
versión diferente y generación preparada. Más tarde y el acuerdo de actualización
permanecen disponibles. No cambia el código del SW salvo APP_VERSION.

Referencia revisada vía GitHub API: `GeoStudio_CASUR_NC_CT/src/pwa/registerPwa.ts`
ofrece actualización desde `onNeedRefresh`; `PwaController.ts` presenta ese aviso.
Se reproduce el comportamiento sin incorporar Vite ni dependencias.

La instantánea de Producción V1.5.1 conserva App 1.3.5, con la que fue liberada.
El sincronizador admite publicaciones independientes del shell; la nueva entrada
de APP_RELEASES es PATCH 1.3.6. Ningún módulo ni dataset cambia de versión.

## Regresiones

| Comando | Resultado |
|---|---|
| `node --test tests/*.test.mjs` | 63/63 Shell/GEO/versionado; tres casos nuevos del cliente |
| `npm test --prefix modules/produccion` | 22 controles + 136/136 |
| `npm run validate --prefix modules/tch` | aprobado, incluye 91/91 |
| `npm test --prefix modules/tch` | 91/91 |
| `node tools/sync-versions.mjs` | coherente |
| `node tools/runtime-assets.mjs` | 159 recursos locales, hashes válidos |
| `node tools/check-release-policy.mjs e31c1c166f2498fbfaebea266e4867f8be123b1f` | solo shell 1.3.5 → 1.3.6 |
| `node --check` en JS/MJS/CJS modificados/nuevos | aprobado |
| `git diff --check` | limpio |

## Chromium real: nueve grupos aprobados

`tools/qa-pwa-notifications.cjs` levanta HTTP en un puerto efímero y usa un perfil
persistente temporal exclusivo de QA. Sirve el commit oficial 1.3.5 y los archivos
actuales 1.3.6. La 1.3.7 se genera en memoria con hashes correspondientes y nunca
se publica ni se escribe a las fuentes.

1. Reproducción del defecto en 1.3.5, sesión nueva y caché antigua.
2. Nueva generación 1.3.6 completamente preparada en espera: aviso legítimo.
3. Rechazo de checkpoint en segunda ventana: no activa ni recarga.
4. Activación 1.3.5→1.3.6 offline, dos ventanas, exactamente una recarga por ventana,
   sin confirmación automática. Borrador real TCH de Suerte 99325 recuperado.
5. IDB v3 y registro centinela intactos; preferencia local, GEO, LKG y cachés
   de 1.3.4/1.3.5/1.3.6 conservados.
6. Diez aperturas separadas sin actualización: cero avisos, cachés antiguas presentes.
7. Cierre completo y reinicio de Chromium con el mismo perfil: cero avisos.
   Marcador obsoleto eliminado; clave de sesión ajena conservada. Escritorio 1440×900
   y móvil 390×844 inspeccionados.
8. Generación futura con hash inconsistente: instalación rechazada, sin aviso falso,
   controlador 1.3.6 conservado.
9. 1.3.7 simulada y preparada: título, versión y dos botones exactos, sin mensaje
   genérico. Más tarde no recarga ni activa; recuperación del acceso pendiente
   después de recargar offline, manteniendo 1.3.6.

Evidencia: `C:\Users\ctije\Videos\CASUR_PWA_136_QA\delivery\`.
Capturas PNG: `before-false-confirmation`, `legitimate-update-136`,
`checkpoint-rejected`, `draft-offline-no-confirmation`, `no-notice-opening-1`,
`no-notice-opening-10`, `no-notice-mobile`, `legitimate-update-137-mobile`,
`later-mobile`. JSON: `ten-openings`, `persistence`, `results`, `run-metadata`.
Logs de regresión en `C:\Users\ctije\Videos\CASUR_PWA_136-*.log`;
ejecución final de navegador en `CASUR_PWA_136-browser-delivery.log`.

Reproducir con Playwright disponible externamente en NODE_PATH, ruta Chromium en
CASUR_CHROME_EXECUTABLE y directorio externo CASUR_QA_OUT:
`node tools/qa-pwa-notifications.cjs`.

## Límites

El aviso recibido mientras aún se ejecuta 1.3.5 conserva el texto del cliente viejo;
1.3.6 aplica el texto reducido desde su propia instalación. La comprobación móvil
usa viewport de Chromium, no acredita instalación física Android/iOS. No se prueba
GPS físico. Los centinelas y el borrador de QA están aislados del usuario.
Sin cambios en Producción/TCH, fórmulas, SIAGRI, geometrías, LKG, IDB ni exportadores.
Sin merge ni despliegue; main se utiliza únicamente como base de la rama nueva.
