# Maestro de Suertes · Fase 1 · candidata de revisión

Base: `ac99614a9dd0c4a6a7f0ae06aa569fe1882be100` (`origin/main`, comprobado contra GitHub).
Rama: `codex/maestro-ux-premium-fase1`.
Esta entrega es una candidata visual y funcional. No autoriza merge ni publicación.

## Decisiones y alcance

Se leyeron íntegramente los documentos 00, 01 y 02 del paquete definitivo,
el diagnóstico, los prototipos V2/V3, las ocho capturas y las tres hojas del
Excel institucional. Las cifras y capacidades provienen del código y los
datos vigentes de main, sin trasplantar los 47 registros del prototipo.

| Vista | Incremento | Conservación y riesgo revisado |
|---|---|---|
| Resumen | Cuatro KPI canónicos, generación, zafra, población, cobertura y accesos a las cuatro vistas de trabajo. | Consume `CASUR_CRONO_PARTICIPATION.summary()`. No calcula otro TCH ni infiere una fuente personal como oficial. El Centro Maestro conserva su launcher y autorización. |
| Cronológico | Entrada inicial General, cinco KPI y siete paneles originales. Ruta General → Finca → Suerte con retorno a finca y general. Sugerencias con flechas, Enter y Escape. | Conserva búsqueda sobre el catálogo completo, seis KPI de suerte, ocho zafras, 18 columnas, multiselección, mapa y exportadores. Los retornos no llaman al limpiador de selección. |
| Histórico | Acceso por pestaña y presentación consistente de la cabecera y acciones. | Motor, fincas completas/parciales, períodos, cobertura, comparación, gráficos, mapa y los tres exportadores originales. Sin tabla histórica nueva ni otro motor. |
| Zonas | Pestaña que revela el mismo acordeón territorial. | Conserva sus dos subanálisis y los controles originales. No convierte riego/tenencia/destino en niveles organizativos. |
| Análisis | Acceso directo a la sección completa existente. | No elimina TCH × KATM, variedades, tendencias, prioridades, matrices ni maquila. |
| PWA | El snapshot existente incorpora únicamente el nombre de pestaña. | Restaura después de datos/selecciones/acordeones. Snapshots antiguos se interpretan por sus secciones. No se escribe IDB desde el adaptador ni se inventa contexto legacy 1.3.6. |

Los paneles originales permanecen en el DOM. El adaptador cambia visibilidad,
no desmonta informes ni reconstruye selecciones. Los acordeones secundarios
siguen siendo disclosures. La barra interna inferior se sustituye por las
pestañas superiores para evitar duplicarla con el shell; no hay otra sidebar.

Paleta exclusiva del módulo: petróleo `#173B46`, verde `#28483A`, acento
`#D4B35F`, salvia `#E4EAE9`, blanco `#FFFFFF`, texto `#30393D` y tablas
`#1F4E5C`. Verde y dorado se verificaron además en las direcciones visuales
del Excel. Los colores originales del logo se mantienen. CSS limitado a
pantalla y a `casur-maestro-premium`; los builders y CSS de exportación no
se reescriben. Se verifican los pares de contraste AA utilizados en el
incremento y el foco visible; esto no equivale a certificar WCAG de toda la app.

## Archivos y reversibilidad

- `modules/produccion/index.html`: solo dos enlaces nuevos, sin alterar otro byte lógico del documento original (prueba diferencial).
- `modules/produccion/js/maestro-ux.js`: adaptador de navegación, portada y teclado.
- `modules/produccion/css/maestro-ux.css`: presentación encapsulada y responsive.
- `modules/produccion/js/official-data-updates.js`: dos adiciones al contrato de contexto.
- `core/versions/runtime-assets.json`: hashes y registro de los dos recursos nuevos, sin excluir otros activos.
- `modules/produccion/tests/maestro-ux.test.mjs`: conservación diferencial y contraste del incremento.
- `tools/qa-maestro-ux.cjs`: regresión Chromium antes/después, perfiles aislados y descargas reales.
- `tools/serve-maestro-preview.mjs`: servidor loopback con allowlist de activos, baseline por objeto Git y metadatos de HEAD.
- Este documento.

Para descartar la propuesta basta cerrar el PR Draft. Para retirarla de otra
rama de revisión, revertir sus commits en orden inverso, sin reset ni force
push. El conjunto del adaptador, los dos hooks y sus hashes se revierte de
forma atómica. No hay migraciones ni datasets que recuperar.

## Reproducción local

Desde esta rama, con Node instalado:

```powershell
node tools/serve-maestro-preview.mjs --port 4380 --ref ac99614a9dd0c4a6a7f0ae06aa569fe1882be100
```

En otra terminal, para revisar el árbol de trabajo:

```powershell
node tools/serve-maestro-preview.mjs --port 4381
```

Abrir `http://127.0.0.1:4381/Negocios_de_Cana_CASUR_APP/#/modulo/produccion`.
Para una candidata congelada usar `--ref SHA_COMPLETO --port 4382`.
`/__maestro_preview.json` identifica SHA, generación y estado del árbol.
Si cambia el SHA usar otro puerto/origen y perfil QA, conservando las cachés
anteriores. No publicar diferentes bytes bajo la versión productiva instalada.

El servidor solo escucha en `127.0.0.1`; no expone el equipo a la red ni abre
túneles. Solo sirve runtime y datos oficiales versionados requeridos por la
app: no `.git`, documentos de QA, Excel, perfiles o credenciales. No utiliza
ni modifica el constructor Cloudflare histórico de PR #45.

Para repetir la regresión de navegador (requiere Playwright y Chromium):

```powershell
# Usar el Playwright del runtime QA existente, sin añadir dependencias a la app.
$env:NODE_PATH = 'RUTA_AL_NODE_MODULES_DEL_RUNTIME_QA'
node tools/qa-maestro-ux.cjs 'DIRECTORIO_NUEVO_DE_EVIDENCIAS'
```

El runner usa contextos temporales propios, dos orígenes loopback y los
botones/generadores originales. Bloquea red externa para impedir escrituras
o consultas accidentales a otros servicios. En ambos lados acepta únicamente
la confirmación original de exportar sin mapa base cuando faltan tiles;
conserva las geometrías oficiales. Por tanto ese caso acredita el documento
con polígonos y su fallback original, no la disponibilidad de los tiles Esri.

## Validaciones y límites

Comandos existentes, sin cambiar tests ni desactivar guards:

```powershell
node tools/sync-versions.mjs
node tools/runtime-assets.mjs
node tools/production-integrity.mjs
node --test tests/*.test.mjs
npm test --prefix modules/produccion
npm run validate --prefix modules/tch
git diff --check
node tools/check-release-policy.mjs ac99614a9dd0c4a6a7f0ae06aa569fe1882be100
node tools/check-context-hotfix.mjs
```

Los dos últimos guards bloquean la liberación: el primero exige incremento
de versiones de shell/Producción; el segundo está congelado al alcance,
versiones y 167 activos del hotfix 1.5.2. Esta candidata añade dos activos y
mantiene 1.5.2/V1.7.2 como base de revisión. No se cambian guards, excepciones,
workflow, SW, manifest, historial publicado ni versión instalada para ocultar
ese bloqueo. Una liberación posterior requiere resolver el versionado y la
aplicabilidad del guard con autorización explícita, repetir QA y obtener CI
verde para su HEAD. Esta candidata no debe promocionarse tal cual.

Se conservan los siete archivos oficiales y los hashes de generación
`2026.10.25-aforo.1101`, GEO y Maestro. Las regresiones cubren 99336, finca
494 con varias fechas, participación Semilla 2003 y Molienda 1927, selección
cronológica, multifinca 25 + 993 completa/parcial, todos los períodos,
descargas PDF/PNG, mapas, tamaños 1440/1280/768/390, recarga, otra ventana,
offline y hashes de IndexedDB antes/después. El runner registra cada PASS o
FAIL y conserva archivos descargados y capturas fuera del repositorio.
Las cifras y modelos agronómicos se comparan con el baseline, no con la maqueta.

La aceptación física en teléfono e impresora corresponde a la revisión del
usuario. No se repite una migración productiva ni se acredita recuperación
de selecciones que el cliente legacy 1.3.6 nunca persistió.

## Seguridad de rama y hosting

Se consultaron GitHub Pages, PRs abiertos, workflow, hooks, deployments y la
configuración remota de Cloudflare en modo lectura. Pages usa `main:/`.
`casur-negocios-preview` tiene producción deshabilitada y solo admite previews
de `codex/estimados-plan-consulta-b2`; esta rama queda excluida. Se mantiene
el prefijo histórico `[CF-Pages-Skip]` y CI GitHub permanece activo. Ninguna
configuración de Pages, Cloudflare, Access o GeoStudio se altera.

La sesión Vercel disponible mostró `Carlos_TM` con plan Hobby; el equipo
`ctijerino1-6420` del antecedente no estaba accesible. No se acreditó plan
autorizado para uso empresarial CASUR ni protección de todas las URLs y
recursos, por lo que no se creó proyecto ni se cargaron datos operativos.
No se reutilizó Cobros Mecanizados. Si el usuario habilita un equipo compatible,
verificar primero un despliegue inocuo, protección anónima de HTML/JSON/JS y
aliases antes de un Preview del SHA revisado. No habilitar producción.

Referencia del requisito de plan: https://vercel.com/docs/plans/hobby.
Los enlaces de PR, HEAD final, logs y evidencias externas se entregan aparte
para evitar una referencia circular de SHA dentro del propio commit.
