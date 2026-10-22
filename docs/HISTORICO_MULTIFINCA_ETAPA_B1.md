# Histórico multifinca · B1 Panorama ejecutivo

Base funcional: PR #23, `87aab0bc443cd479b34440746f3db27b16678f08`.
Rama: `codex/historico-panorama-b1`. Destino temporal del PR: `feat/historico-multifinca-etapa-a`.
El PR dependiente muestra exclusivamente el incremento B1. No integra A ni B1 en `main`.

## Integración

El cierre de selección existente en `index.html` conserva el catálogo histórico
completo, la selección finca completa/parcial, las acciones canónicas y los
períodos. `multiAnalysis()` llama al mismo `buildHistoricalMultiAnalysis()`.
Su resultado se entrega directamente a `CASUR_HISTORICAL_PANORAMA.render()`.
No se copian snapshots ni fuentes del prototipo B0.

- `historical-panorama-model.js`: selectores puros de presentación y geometría
  del gráfico. Proyecta los agregados y denominadores del motor; compara las
  identidades observadas para advertir cambios de composición. No recalcula
  ponderaciones ni suma KPI por finca.
- `historical-panorama.js`: render responsive, seis KPI, períodos, cuatro
  métricas, detalle por punto, cobertura y desplegables. La métrica y el punto
  consultado son estado visual local; no cambian selección ni período.
- `css/historical-panorama.css`: estilos acotados a este dashboard. Conserva
  el shell y la navegación existente, sin agregar otro encabezado general.

Cambiar métrica no invoca nuevamente al motor: usa el análisis ya recibido.
La normalización de filas sigue cacheada en el cierre de selección de Etapa A
y se invalida cuando cambia su fuente. Un único observador del contenedor
adapta el gráfico al ancho. Los listeners se registran una vez por contenedor;
no hay polling, dependencias nuevas ni nuevos accesos a almacenamiento.

La exportación autónoma HTML/ZIP de Producción integra también los tres nuevos
assets, preservando su ejecución fuera del repositorio. No se crean reportes
PDF/PNG de B1 ni se cambian los cálculos de exportadores existentes.
El QA ejecuta la preparación de esa fuente exportada y confirma que CSS/modelo/
render se integran inline, sin referencias externas pendientes a esos assets.

## Semántica

1. TCH/KATM/edad y sus bases válidas proceden del motor. Un 100% de cobertura
   válida describe los registros disponibles, no todo el universo histórico.
2. Toneladas: acumulado registrado, dos decimales. Si faltan toneladas en
   alguna fila se identifica como parcial. Sin una base válida se muestra N/D;
   un cero realmente observado sigue siendo cero.
3. Área: media por zafra efectiva seleccionada. En una única zafra coincide
   con su área cosechada; en varias, se acompaña del acumulado ha-zafra. El
   detalle conserva también la media de zafras observadas. No es área física.
4. Cobertura histórica: suertes con algún registro / suertes seleccionadas.
   Se distingue de cobertura por indicador y por zafra. Los faltantes se
   consultan en «Registros y cobertura por zafra».
5. TCH y KATM usan la referencia ponderada del período. Toneladas y área
   omiten referencia, evitando presentar el acumulado como valor por zafra.
6. Personalizado distingue `ready`, solicitud sin registros y ninguna zafra
   marcada. La UI conserva las solicitudes no disponibles y permite quitarlas.
   Los huecos se mantienen en el eje y no se conectan ni se dibujan como cero.
7. Con una zafra solo hay un punto, sin segmento de tendencia. En móvil el eje
   usa hasta cuatro etiquetas; los puntos siguen accesibles por toque/teclado.
   El detalle muestra inicialmente la última zafra disponible; tocar/enfocar
   otro punto consulta esa zafra sin filtrar el análisis global.
8. La advertencia de composición compara identidades de suertes, no solo sus
   cantidades. No atribuye causas agronómicas ni habilita filtros de riego.
9. Km permanece como referencia vigente, dentro de calidad, sin etiqueta de
   distancia histórica.

## Conciliación oficial

Dolores 256 completa + Rancho Peirano 98301/98302, 17 suertes elegibles:

| Período | Área acumulada | Área principal | Toneladas | TCH | KATM | Edad | Cobertura edad |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Última 25/26 | 188.78 ha | 188.78 ha | 7,659.24 | 40.57 | 103.90 | 11.80 | 123.00/188.78 ha = 65.16% |
| Últimas 3 | 566.52 ha-zafra | 188.84 ha/zafra | 27,713.49 | 48.92 | 108.56 | 11.60 | 500.74/566.52 ha = 88.39% |

Ambos períodos tienen 11/17 suertes con algún registro. En las tres zafras la
población observada cambia de 10 a 11 suertes; se muestra advertencia.

## Pruebas y QA

Comandos desde la raíz del repositorio, ejecutados el 22 de octubre de 2026:

```powershell
npm --prefix modules/produccion test
npm --prefix modules/tch run validate
node --test tests/*.test.mjs
node --check modules/produccion/js/historical-panorama-model.js
node --check modules/produccion/js/historical-panorama.js
node --check modules/produccion/tests/historical-panorama.test.mjs
node --check modules/produccion/tools/qa-historical-panorama.cjs
git diff --check
```

- Producción: 22 controles estáticos (incluidos scripts inline) + 107/107 tests.
- TCH: validación estática + 91/91 tests.
- Shell/GEO en Node: 48/48 tests, incluidos hashes GEO y conservación de LKG/IDB.
- Casos nuevos: áreas desiguales, faltantes y cero observado; medias de área;
  selección parcial; cambio de identidades con igual cantidad; tres estados
  de período; referencias; huecos; una zafra; 15 zafras a 310 px; inmutabilidad;
  conciliación oficial y dependencias de la exportación autónoma.
- QA Chromium aislado: módulo directo y shell con un solo iframe a 1440×900
  y 390×844; valores DOM contra el motor, cuatro métricas, cinco períodos,
  personalizado no contiguo, foco/teclado, scroll estable y ausencia de overflow.
  Consola online limpia. Verificación adicional con la finca 993, fuera del
  ejemplo B0, mediante el catálogo real.
- Reapertura de una página nueva offline después de precarga en el contexto
  del shell: conserva recursos y datos suficientes para reconstruir la selección
  y mostrar 48.92 TCH / 27,713.49 t en ambas resoluciones; sin errores de ejecución.
  No se afirma reinicio físico del teléfono ni actualización desde una versión
  productiva instalada: es un contexto descartable con el SW raíz existente.

Guion opcional de navegador: `modules/produccion/tools/qa-historical-panorama.cjs`.
La entrada anterior `qa-multifinca-browser.cjs` delega al mismo guion.
Playwright se usa desde el runtime externo del entorno; no se instala en el
proyecto. Variables: `CASUR_PREVIEW_URL`, `CASUR_QA_OUT`,
`CASUR_CHROME_EXECUTABLE`, y `NODE_PATH` si corresponde.

Evidencias locales: `C:\Users\ctije\Videos\CASUR_Panorama_B1_QA`.
El JSON contiene números y resultados; los PNG `directo` muestran el dashboard
completo. Los PNG `shell`, `grafico_shell` y `cobertura_shell` son capturas reales
del viewport: no se captura un elemento más alto que su iframe, para evitar
bandas recortadas que no representan la UI.

## Preview local

Desde PowerShell:

```powershell
Set-Location 'C:\Users\ctije\Videos\Negocios_de_Cana_CASUR_APP'
git branch --show-current # debe ser codex/historico-panorama-b1
py -m http.server 4195 --bind 127.0.0.1
```

Mantener esa terminal abierta. Si el servidor ya está activo en 4195, basta
abrir `http://127.0.0.1:4195/#/modulo/produccion`.
Módulo directo: `http://127.0.0.1:4195/modules/produccion/`.

1. Abrir Histórico → Selección múltiple.
2. Buscar `256`, pulsar «Agregar finca completa».
3. Buscar `983`, marcar 98301 y 98302.
4. Pulsar «Analizar selección». Se muestra Panorama.
5. Elegir período, métrica o punto; desplegar calidad para conciliar bases.

El preview es local, no HTTPS publicado. Usar una ventana privada para revisar
los assets de la rama sin una caché anterior del mismo localhost.

## Límites y revisión pendiente

- Móvil validado con viewport simulado, no teléfono físico.
- Comparar y Explorar pertenecen a B2/B3; no se muestran botones ficticios.
- No hay exportación ejecutiva nueva; siguen vigentes los exportadores previos.
- No se cambian versiones, datasets, GEO, GPS, IndexedDB, LKG ni SW. El código
  de los assets nuevos se cachea por la estrategia existente bajo demanda;
  todavía no se valida una actualización de la PWA instalada desde producción.
  Revisar versionado/invalidation antes de una publicación autorizada.
- Suite Python del pipeline SHP no ejecutada: el pipeline está fuera del diff
  y el entorno local no tiene `geopandas`. Las regresiones GEO Node sí pasan.
- Si Etapa A sigue abierta al revisar, mantener el destino del PR B1 en su rama.
  Reconsiderar la base hacia `main` solamente después de integrar A y con revisión.

B1 finaliza aquí. No se inicia B2/B3, no se hace merge y no se despliega.
