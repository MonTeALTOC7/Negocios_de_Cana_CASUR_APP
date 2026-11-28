# Previews HTTPS automatizadas: GitHub Actions + Cloudflare Pages

Mecanismo permanente para publicar previews de la App Maestra sin depender de Claude Cloud, del PC del propietario ni de cargas manuales.

**Nunca publica producción.** Producción sigue siendo GitHub Pages desde `main`.

| Elemento | Valor |
|---|---|
| Proyecto Cloudflare | `casur-maestro-ux-review` (existente; Direct Upload) |
| Workflow | `.github/workflows/casur-preview-deploy.yml` («CASUR Preview Deploy») |
| Environment de GitHub | `casur-preview`, con secretos `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` |
| Ramas de despliegue | `preview-deploy/<nombre>`, con `.github/preview-request.json` |
| Herramientas | `tools/preview/` (`build-preview.mjs`, `cloudflare-guard.mjs`, `verify-deployment.mjs`, `smoke-preview.cjs`) |
| URL de la app | `https://<hash>.casur-maestro-ux-review.pages.dev/Negocios_de_Cana_CASUR_APP/` (inmutable) y alias `https://pr-<N>.casur-maestro-ux-review.pages.dev/Negocios_de_Cana_CASUR_APP/` |

## Flujo de cada ejecución

1. **Solicitud.** El workflow toma el SHA completo y el PR, desde `workflow_dispatch` o desde `.github/preview-request.json` de la rama `preview-deploy/*`.
   - Rechaza SHA inválidos y commits que no estén en una rama de este repositorio. Los forks quedan excluidos.
   - El alias de preview es `pr-<N>`, o `sha-<7>` si no hay PR.
2. **Paquete reproducible** (`build-preview.mjs`). Lee cada archivo como blob de Git del SHA, nunca del árbol de trabajo.
   - Incluye solo los activos de `core/versions/runtime-assets.json`, el SW, el manifest y los datos operativos.
   - Excluye `docs`, `tools`, `tests`, `.github`, Excel, ZIP y claves.
   - **Verifica:** los SHA-256 de los activos de runtime y los seis archivos de datos de Producción contra `integrity.json`.
   - **Añade:** `__preview.json` (SHA, PR, rama, versión de datos, aforo, consolidación), `_headers` (`noindex` y caché) y `_redirects` (raíz → app).
3. **Guarda previa** (`cloudflare-guard.mjs before`). Normaliza las credenciales (`cloudflare-credentials.mjs`) y diagnostica por capas: token (`tokens/verify`), cuenta y proyecto, en modo solo lectura.
   - Cancela si el alias es `main`, `master`, `production` o coincide con la rama de producción del proyecto.
   - Cancela si el proyecto no declara rama de producción.
4. **Despliegue** (`wrangler-deploy.mjs`, con las credenciales normalizadas):
   ```
   npx wrangler@4.159.0 pages deploy <paquete> --project-name casur-maestro-ux-review --branch <alias> --commit-hash <SHA> --commit-dirty=false
   ```
5. **Guarda posterior.** Confirma en la API que el despliegue es `environment: preview` y que su `commit_hash` es el SHA solicitado.
6. **Verificación HTTP** (`verify-deployment.mjs`):
   - `__preview.json.head` = SHA.
   - La raíz redirige a la app.
   - Encabezado `X-Robots-Tag: noindex`.
   - **Cada archivo publicado es idéntico byte a byte** al paquete.
7. **Navegador** (Playwright 1.65.0 y Chromium):
   - `smoke-preview.cjs`, a 390 y 1536 px: generación de datos, fecha efectiva del aforo, cabecera «Cron DD-MMM-AAAA», Service Worker, reapertura sin conexión y 0 errores.
   - `qa-maestro-shell-e2e.cjs` del propio SHA, si existe: instalación en frío, navegación de zona, regreso, segunda visita y recarga con y sin conexión.
8. **Evidencias y enlace:**
   - Artefacto `preview-<alias>-<SHA>`, con SHA256SUMS, `__preview.json` y resultados, conservado 30 días.
   - Resumen de la ejecución.
   - **Comentario en el PR** con el enlace directo.

## Configuración inicial: una sola vez, por el propietario

### A. Cloudflare: token de API con permiso mínimo
1. dash.cloudflare.com → My Profile → **API Tokens** → **Create Token** → **Create Custom Token**.
2. Nombre: `casur-github-preview`.
3. Permisos: **Account · Cloudflare Pages · Edit**. Ningún otro.
4. Account Resources: **Include** → la cuenta que contiene `casur-maestro-ux-review`.
5. Opcional: IP filtering vacío y TTL según la política interna.
6. Crear y copiar el token. Se muestra una sola vez; no se pega en chats ni archivos.
7. Copiar el **Account ID**: Workers & Pages → panel derecho «Account details», 32 caracteres hexadecimales.

### B. GitHub: Environment protegido
1. Repositorio → **Settings** → **Environments** → **New environment** → `casur-preview`.
   - Si ya existe porque una ejecución lo creó automáticamente, editarlo.
2. **Deployment branches and tags** → **Selected branches and tags** → agregar las reglas `preview-deploy/*` y `main`.
3. **Environment secrets** → **Add secret**:
   - `CLOUDFLARE_API_TOKEN`: el token del paso A.
   - `CLOUDFLARE_ACCOUNT_ID`: el Account ID.
4. Opcional: «Required reviewers», si el propietario quiere aprobar cada despliegue.

Con esto, solo los jobs que se ejecutan desde `preview-deploy/*` o `main` pueden leer los secretos. GitHub los enmascara en los registros y ninguna herramienta los imprime.

## Uso en sesiones futuras de Claude Code

### Antes de que el workflow esté en `main`
Las ramas de despliegue llevan el workflow consigo.
1. `git checkout -b preview-deploy/<nombre> <rama que ya contiene el workflow>`. Por ejemplo, una rama `preview-deploy/*` anterior o la candidata que lo incluya.
2. Editar `.github/preview-request.json`:
   ```json
   {"sha": "<40 hex>", "pr": <N>}
   ```
3. `git commit -m "[CF-Pages-Skip] preview: <PR> <sha corto>"` y `git push -u origin preview-deploy/<nombre>`.
4. Seguir la ejecución «CASUR Preview Deploy» en Actions. Al terminar, el enlace aparece en el PR.
5. Para repetir sin cambios, usar **Re-run** sobre la misma ejecución. No se hacen commits vacíos.

### Cuando el workflow esté en `main`
Actions → «CASUR Preview Deploy» → **Run workflow**, indicando el `sha` y el `pr`. La herramienta MCP `actions_run_trigger` (`run_workflow`) hace lo mismo con `ref: main` e `inputs`.

## Seguridad

- **Disparadores:** solo `push` a `preview-deploy/**` y `workflow_dispatch`. Sin `pull_request` ni `pull_request_target`, de modo que el código no confiable no se ejecuta con credenciales.
- **Credenciales:** solo en el Environment `casur-preview`, que restringe por rama. Los secretos solo se pasan a los pasos de guarda y despliegue.
- **Alcance:** proyecto fijo `casur-maestro-ux-review`, y la guarda impide producción. No se modifican DNS, Access, otros proyectos de Cloudflare, GitHub Pages ni `main`.
- **Acceso de la preview:** las previews son **públicas** (solo `noindex`), igual que las anteriores. Restringirlas requiere activar Cloudflare Access en el proyecto, por decisión del propietario.
- **Versiones fijadas:** Wrangler `4.159.0` y Playwright `1.65.0`.

## Diagnóstico

| Síntoma | Causa y acción |
|---|---|
| «Faltan CLOUDFLARE_API_TOKEN o CLOUDFLARE_ACCOUNT_ID» | El Environment no tiene los secretos o la rama no está permitida. Revisar la sección B. |
| «Headers.append … invalid header value» o 6003/6111 | El secreto contiene saltos de línea o texto adicional. Desde el 25-Nov-2026 `cloudflare-credentials.mjs` lo normaliza (quita saltos, espacios y «Bearer») si queda un único token; si hay ambigüedad se detiene. Conviene volver a guardar solo el token, en una línea. |
| «TOKEN: Cloudflare no reconoce el token» | Token revocado, vencido o de otra cuenta. Crear uno nuevo. |
| «PERMISOS: …» | Falta «Account · Cloudflare Pages · Edit» sobre la cuenta. Editar el token. |
| «CUENTA/PROYECTO: …» | `CLOUDFLARE_ACCOUNT_ID` no corresponde a la cuenta de `casur-maestro-ux-review`. |
| «El alias coincide con la rama de producción» | Cambiar el alias. Nunca forzar. |
| Contenido publicado distinto | Propagación o caché. La verificación reintenta; si persiste, no usar la preview y revisar el registro. |
| Fallo del navegador | Revisar el artefacto `qa/` y el registro. La preview queda creada, pero no se considera verificada. |
