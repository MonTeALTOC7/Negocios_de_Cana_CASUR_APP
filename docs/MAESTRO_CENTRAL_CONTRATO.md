# Maestro Central — matriz de autoridad y contrato de lectura

Complementa `MAESTRO_CENTRAL_DIAGNOSTICO.md` y usa sus mismas marcas ([C], [P], [H], [GPT], [CL], [R]). El PoC ejecutable
es `tools/poc/maestro-central-contract.mjs`, con sus pruebas en `….test.mjs`. **No se usa en el runtime publicado.**

## 1. Principio rector

El Maestro Central **no es una tabla**: es una **identidad permanente con capas**. Cada capa tiene su autoridad, su fuente,
su versión y su ciclo de actualización. Una actualización de una capa nunca borra ni recalcula las demás. Las capas
operativas de los módulos (riegos, insumos, biometrías, estimaciones propias de TCH, labores, inventarios, visitas, fotos
y configuraciones) **no son parte del maestro**: lo referencian por la identidad.

```
identidad (hacienda|suerte)  ← permanente; nunca se borra
 ├─ catálogo/atributos       ← Cronológico SIAGRI (tipo A)
 ├─ estado operativo         ← Cronológico + decisiones operativas trazadas
 ├─ aforo/estimado           ← Aforo oficial (tipo B)
 ├─ plan de cosecha          ← Plan (tipo C)
 ├─ histórico ejecutado      ← Histórico (tipo D)
 └─ geometría                ← GIS (tipo E)
```

## 2. Matriz de autoridad por variable

| Variable | Autoridad (única) | Tipo de actualización | Puede faltar | Regla si falta | Quién **no** puede sobrescribirla |
|---|---|---|---|---|---|
| Identidad `{farmCode, lot}` | Catálogo acumulado (unión histórica) | A, con alta explícita | No | — | Nadie. Las identidades nunca se borran: pasan a `absent` o a baja |
| Nombre de hacienda, zona, tenencia, ERP | Cronológico SIAGRI | A | Sí | Se conserva la anterior, marcada `inherited` | B, C, D, E y los módulos |
| Variedad, textura, surco, corte, fechas de siembra y de último corte | Cronológico SIAGRI | A | Sí | Igual | B, C y los módulos |
| Tipo de riego (categoría original) y nº de riegos del maestro | Cronológico SIAGRI | A | Sí | Igual | Riego. Su presupuesto e intervalo son operativos y propios |
| **Área física o catastral** (nueva) | Cronológico SIAGRI. El GIS es referencia, no autoridad | A | Sí | Última no nula conocida, con su versión de origen. **Nunca 0 por ausencia** | B y C. Hoy el aforo pone 0 (P5) |
| Área en inventario del aforo (`inventoryArea`) | Aforo oficial | B | Sí | Pendiente; no es 0 | A y los módulos |
| Área de molienda y participación | Derivada de `participation()` sobre los estados y `inventoryArea` | Calculada | — | — | Nadie la edita; se recalcula solo con la regla oficial |
| Estado operativo (Molienda, Semilla, Sin Caña, Baja rentabilidad, Baja definitiva, Investigación) | Fuente de la generación + `operationalDecision` trazada | A o B | Sí | `unknown`; no `inactivo` | Los módulos |
| Presencia en la fuente (`present` / `absent`) | Comparación de la generación con el catálogo | Calculada | — | — | — |
| Renovación, pérdida parcial o total | **Sin autoridad hoy** (P6) | Futuro: evento explícito y trazado | Sí | `null` (desconocido) | — |
| Linaje de particiones (`parent`) | **Sin autoridad hoy** (P6) | Futuro: alta explícita en A | Sí | `null` | — |
| TCH estimado y t estimadas de la zafra en curso (AD/AE) y optimista (AF/AG) | Aforo oficial | B | Sí | `estimate: missing`. **Sigue en el área activa** | A, C, D y el Estimador TCH. El estimado propio de TCH es otra capa, de TCH |
| Fecha de cosecha, corte del plan, línea (BE/BF) | Plan de cosecha | C | Sí | Sin plan | A, B |
| TCH, t y área ejecutados por zafra | Histórico | D | Sí | Sin dato («—»); no 0 | A, B, C |
| Geometría y su identidad GIS | GIS oficial (`casur-master-geometry` v2) | E | Sí | Sin polígono; la suerte sigue en el catálogo | Las importaciones de los módulos. Visitas puede proponer polígonos, nunca reemplazar los oficiales |

**[C]** El aforo vigente es el de 12-Oct-2026, en la generación 1102. Con esta matriz, una actualización ordinaria del
cronológico (A) conserva las capas B, C y D de la 1102 por identidad, hasta que llegue un aforo oficial nuevo.

## 3. Versionado por capa, compatible con la generación conjunta

Hoy la generación `2026.11.22-aforo.1102` declara `sourceProfiles: ["cronologico","estimados","plan"]`: una fuente única
alimentó tres capas. La propuesta conserva `dataVersion` como identificador de la **generación conjunta** (el que usan el SW,
el gate LKG, `integrity.json` y la Release Gate). Añade un sello por capa:

```json
"layers": {
  "catalogo":  {"version": "2026.11.22-aforo.1102", "source": "AFORO_26-27", "sourceDate": "2026-10-12", "sha256": "2e3c…"},
  "aforo":     {"version": "2026.11.22-aforo.1102", "season": "26/27", "sourceDate": "2026-10-12", "sha256": "2e3c…"},
  "plan":      {"version": "2026.11.22-aforo.1102", "sourceDate": "2026-11-22", "sha256": "3277…"},
  "historico": {"version": "<versión del historico.json vigente>"},
  "gis":       {"version": "2026-07-24-maestro-26-27-r2"}
}
```

Cada tipo de actualización produce una nueva generación conjunta que solo cambia el sello de su capa; los demás se copian.
El sufijo de `dataVersion` (`siagri`, `aforo`, `plan`…) ya existe (`2026.09.06-siagri.1415`) y sigue indicando qué capa
originó la generación. **No se renumeran las generaciones existentes.**

## 4. Contrato de lectura (v0.1, PoC)

```js
import {buildCentralView, reader} from 'tools/poc/maestro-central-contract.mjs'; // futuro: core/shared-data/maestro-central.js
const api = reader(buildCentralView(cronologico));
api.version();        // {contractVersion, dataVersion, aforoDate}
api.get('242', '1');  // misma suerte que get('242','01')
api.list(r => r.state.participatesCurrentArea);
```

Forma de un registro:

```js
{ key: '242|01',
  identity:   {farmCode, lot, lotCode, erp},              // lot siempre texto: '01', '05A'
  farm:       {name, zone, tenure},
  attributes: {area, inventoryArea, millingArea, variety, irrigationType, irrigationCount, texture, furrow, cut,
               destination, cropType, plantingDate, lastCutDate, distanceKm, observation},
  state:      {presence, operationalState, classification, participatesCurrentArea, participatesMilling,
               estimate: 'available'|'missing', renovation: true|false|null, loss: null},
  layers:     {executed: {season, tch}, forecast: {...tal cual}, plan: {...tal cual}},
  provenance: {dataVersion, source, cells, inherited, history} }
```

Garantías verificadas por las pruebas del PoC (8/8 [C]):

1. **Identidad compuesta.** `hacienda|suerte`, con la suerte canónica en texto («1» → «01», «5a» → «05A»; «S/N» se conserva).
   El código de hacienda va sin ceros a la izquierda, como en la fuente. Nunca se usa `codLote` (P7).
2. Las 1053 identidades de la 1102 son únicas, sin colisiones; 133 son alfanuméricas.
3. **Estados separados.**
   - Ausente no es baja: los 7 ausentes conservan atributos heredados.
   - Sin estimado no significa fuera del área.
   - TCH 0 no significa inactivo.
   - La pérdida queda `null`: es desconocida y no se inventa.
4. **Las capas oficiales se exponen sin recalcular.** El aforo, el plan y el TCH ejecutado son copias literales.
5. **Inmutabilidad.** La vista se congela. La fuente queda intacta, verificado comparando la serialización antes y después.
6. **Diagnóstico de solo lectura.** Compara Riego, Insumos y TCH sin mutarlos. Los campos de significado distinto se declaran
   y no se comparan.

Lo que el contrato **separa** y no mezcla nunca:

| Maestro (capas de arriba) | Operativo (de cada módulo) |
|---|---|
| Identidad, atributos, estados, aforo, plan, histórico, geometría | Riegos, presupuestos e intervalos de riego; insumos y entregas; biometrías, pesajes, cosechas y estimados propios de TCH; labores; inventarios; visitas, fotos y seguimientos; configuraciones de módulo |

Un módulo **lee** el maestro y **escribe** solo en su almacén. El único escritor del maestro es el Centro Maestro de
Actualizaciones (ver `CENTRO_MAESTRO_ACTUALIZACIONES.md`).

## 5. De dónde lee el contrato: decisión [R]

| Opción | Ventaja | Problema |
|---|---|---|
| **[GPT]** IDB `casur_master_data` como fuente compartida | Ya existe y es same-origin | Vacío en casi todos los dispositivos (P2). Su contenido depende de quién importó qué en cada equipo |
| **[CL]** Generación publicada y verificada por el SW (copia 1), con override local solo si es más nueva **y** se aplicó por el camino transaccional B | Igual en todos los dispositivos; está protegida por el gate LKG y por `integrity.json`; funciona offline | Exige que el contrato lea también los datos de Producción. Son ~4 MB, que ya están en la caché de datos |

**[R]** Adoptar la opción [CL]. La resolución de la fuente queda así:
1. Leer la generación publicada.
2. Si `casur_master_data` tiene una generación aplicada por el camino B con un `dataVersion` mayor y `contractVersion 1`,
   usarla y marcarla como «local, no publicada».
3. Nunca usar el camino C mientras no sea transaccional.

Esto reutiliza `officialSourcePriority()` y no crea una fuente nueva.

## 6. Migración de los módulos (progresiva, reversible y auditable)

1. **Equivalencia primero.** Para cada módulo, una prueba de paridad que compare su copia con el contrato campo a campo, con
   la tabla de correspondencia aprobada (H3, H4). Solo se migra cuando las diferencias están explicadas al 100 %.
2. **Lectura en sombra.** El módulo lee el contrato y su copia propia y registra las diferencias sin cambiar el
   comportamiento.
3. **Conmutación con vuelta atrás.** Una bandera por módulo cambia de fuente. La copia propia y su importador se conservan
   hasta una generación completa sin incidencias. No se borra ningún importador hasta demostrar la equivalencia.
4. **Riego** no tiene código fuente. No se parchean más los bundles minificados. Las opciones son recuperar el código de la
   aplicación v6 o mantener su maestro con un adaptador externo (`master-to-riego-adapter.js`, que ya existe) que publique
   `maestro_suertes_current` y se valide con la prueba de paridad. **Decisión del propietario.**
5. **TCH** solo se migra con un encargo específico. Su `tchEstimado2627` propio es una capa de TCH, no el aforo oficial.
