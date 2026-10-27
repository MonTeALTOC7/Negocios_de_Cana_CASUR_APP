# PR #45 · B2 integrada: aforo y cosecha propuesta

Rama `codex/estimados-plan-consulta-b2`, base #44. Corrección incremental
sobre `ac54ec82ebbeea7ca4f5508ef3089771c7014fcd`, sin rehacer B2.

## Definición vigente y diagnóstico

La autorización más reciente permite BP/BQ como fecha propuesta y tipo de
corte. Los encabezados que incluyen «Plan 600K/601K» son equivalentes de
campos, no una autorización para incorporar sus metas o toneladas propuestas.

Había dos causas de que BP no apareciera:

1. El mapeo reconocía `Fecha propuesta (Plan 601K)` y `Fecha propuesta`,
   pero no `Fecha propuesta de Cosecha` del archivo restaurado.
2. La presentación excluía expresamente BP/BQ por el alcance anterior y
   sustituía la propuesta por último corte; además descartaba fechas pasadas.

Ahora los alias de `proposedDate` incluyen los encabezados de ambas fuentes,
con normalización de espacios, saltos de línea, acentos y mayúsculas. Se
reutilizan `plan.date` y `plan.cut`, sin un motor adicional. No se depende de
las letras BP/BQ: se prueba el reordenamiento de columnas. Las ambigüedades
continúan requiriendo mapeo explícito; no se escoge silenciosamente una columna.

El campo redundante `harvestDate` añadido en el ajuste anterior se retira del
importador; toda propuesta utiliza el contrato existente `plan`.

## Fuente restaurada e integridad

Archivo inspeccionado en modo lectura:
`C:/Users/ctije/OneDrive - CASUR/Respaldo/ctijerino/Documents/Estimados_para_APP_Z2627.xlsx`.
Hoja `Estimados_2627`.

- SHA-256 **actual verificado**: `aa9ab25b863dc399d5a6d445c0efe7907ca8956ef868429f308a404a46267fc6`.
- SHA comunicado en el adjunto: `76dc5ca15a97a180018d0119cc6489dae432c2b7a0c57897c53b2b1b93ace6b8`.
  No coincide con los bytes locales; no se afirma haber verificado esa copia
  ni se incluye ese SHA no inspeccionado en la lista autorizada.
- Extracción original auditada: `82cd45c03b8c80ddda6ebc6078289df4f63b6a380403da6f103f2a52fa30e069`.
- Comparación con la auditoría preservada: 1.046 filas / 78.450 celdas.
  Identidad, área, clasificación, destino, AD, AE y valores BP/BQ sin diferencias.
- Cambiaron los encabezados BP (`Fecha propuesta de Cosecha`) y BQ
  (`Tipo de Corte`). Hay 948 valores diferentes en BT y 948 en BV; son
  columnas auxiliares no consumidas por este importador ni por los indicadores.
- `source-correspondence.json` registra la comparación. No se modifica Excel.

El SHA actual se agrega explícitamente después de esta auditoría. Se mantienen
los guards de SHA exacto, zafra, generación, identidad y valores esperados de
área/clasificación/destino/TCH. Ningún archivo se autoriza por su nombre.
Las pruebas rechazan hashes alterados y diferencias de área esperada.
Los snapshots de Aforos previamente auditados conservan compatibilidad.

## Caso Pansaco 99336 · fila 1020

| Campo | Origen | Original | Presentación / uso |
|---|---|---|---|
| Área | E · Area Ha | 8,91 | 8,91 ha |
| Estimado | AD · actTCH_2627 | 65 | 65,00 TCH |
| Toneladas | AE · Toneladas | 579,15 | 8,91 × 65 = 579,15 t |
| Fecha propuesta | BP · Fecha propuesta de Cosecha | serial 46380 | ISO 2026-12-24; 24-dic-2026 |
| Tipo de corte | BQ · Tipo de Corte | CORTE MECANICO | Corte mecánico |
| Último corte real | O · F. Ult. Cte | serial 46024 | ISO 2026-01-02; 02-ene-2026 |

La procedencia conserva hoja, fila, columna, encabezado, tipo, valor original,
fórmula cuando existe, versión de datos, zafra y SHA de fuente. Se registra
separadamente el número de corte, que no se utiliza como tipo de corte.

La sexta tarjeta conserva el diseño existente:
**Fecha propuesta de cosecha / 24-dic-2026 / Corte mecánico**.
Las otras cinco tarjetas y el gráfico histórico permanecen intactos.
Variedad sigue en tabla/datos. No vuelve el panel duplicado.

## Reglas de presentación

- Propuesta válida: siempre se presenta como propuesta, aunque su fecha pasó.
- Sin propuesta válida: `Fecha propuesta de cosecha · N/D`; no se sustituye
  con último corte, siembra, edad o fecha base.
- Sin tipo: conserva fecha y muestra `Tipo de corte N/D`.
- MANUAL → Manual; CORTE MECANICO → Corte mecánico.
- Otros valores: valor original + `requiere interpretación`; no se inventa equivalencia.
- Las fechas visibles propias del Cronológico usan `dd-mmm-aaaa` español,
  incluida consulta, badge, tabla y la misma vista clonada para PDF/PNG.
  Fechas internas permanecen ISO. Fechas de Histórico y GIS no se cambian.
- Fincas con fechas diferentes muestran `Varias fechas`, nunca promedios.
  La propuesta/tipo sigue en el KPI y los datos; Observación presenta solo el campo de origen.
  Selección múltiple conserva sus cálculos/estructura; el texto del resumen
  muestra la diversidad de fechas y cada fila conserva su propuesta/tipo.
- La clasificación productiva es independiente de BP/BQ. No se consumen
  `Ton propuesta`, metas, fracciones ni comparaciones contra otros planes.

## Conciliación y protección operativa

Sin cambios: 1.053 catálogo / 1.046 inventariadas / 995 activas;
9.672,13 ha inventario / 9.574,66 ha activas;
47 Semilla / 459,01 ha; 948 Molienda / 9.115,65 ha;
563.187,9696909501 t / 61,7825354957 TCH.
Pansaco: 17.452,08 t / 359,30 ha válidas = 48,57 TCH mostrado.

2003 conserva Semilla activa / 10,95 ha, fuera de molienda.
1927 conserva Molienda / 6,15 ha × 70 = 430,50 t, con destino original
Semilla preservado. Diez contradicciones siguen pendientes y solo existen
las dos decisiones expresas. Ninguna fecha activa/reclasifica una suerte.

## QA y evidencias

Salida controlada: `%LOCALAPPDATA%/CASUR/QA/work/Aforo/current`.
La entrega anterior está conservada en `archive/ac54ec8-approved`.
Los diagnósticos se guardan con motivo en `diagnostics`; no se borraron pruebas.

Producción: 22 controles + 199 tests; Shell/GEO 63; TCH validate/test 91 cada uno.
Tests focales: ambos libros, columnas reordenadas, procedencia completa,
Manual/mecánico/desconocido, propuesta pasada/ausente, tipo ausente, diferentes
fechas, fuente/zafra/generación incorrectas, compatibilidad y participación.

Chromium aislado: 10 grupos, PC 1440×900, tableta 768×1024 y móvil 390×844;
seis tarjetas, sin panel duplicado ni overflow, selección/finca y todas las
100 fincas conciliadas, semilleros/inactivos preservados, modelo de casos límite
sin persistir datos sintéticos, lectura readonly de generación archivada,
cero escrituras IDB al consultar/exportar, arranque de página offline tras
precarga, rollback, sin errores de consola y hash de entrada intacto.

PDF/PNG reales de suerte, finca y múltiple. PDF de suerte: 1 página; finca: 2;
múltiple: 1. Páginas renderizadas y revisadas. Sin recortes ni hojas residuales.
Permanece la limitación heredada del contraste del KPI área en exportación
múltiple; su builder y estilos no se alteran en esta corrección de fechas.
No se acredita teléfono o impresora físicos ni suite Python GEO local.

Reproducir en perfil de prueba: abrir Cronológico y buscar 99336. Sin aforo
aplicado se muestra N/D explícito en estimado y propuesta. En Centro Maestro,
leer el original auditado, seleccionar `Estimados_2627`, sin líneas adicionales
de plan, zafra 26/27, conciliar y aprobar expresamente la generación local.
Volver a 99336. Recuperar anterior restaura la vista sin aforo; no transfiere
el contexto QA al perfil real.

Sin cambios a datasets oficiales, Maestro, motor Histórico, TCH, fórmulas,
GIS, SW, versiones, schema IndexedDB o lógica de exportadores. Solo se actualizan
hashes de los archivos runtime modificados. Sin merge, despliegue ni main.


## Pulido visual de ficha de suerte (posterior a 01245e0)

Sin cambios al importador, participación, decisiones, fechas AD/AE/BP/BQ,
cálculos o datasets. Solo se adapta la presentación de las seis tarjetas:

1. Área: conserva área y subtexto operativos.
2. `TCH anterior Z25/26`: mismo valor y referencia.
3. `TCH estimado 26/27`: mismo valor; subtexto con motivo de disponibilidad
   y fecha de procedencia del aforo en línea separada. Para 99336:
   `Aforo autorizado` / `12-oct-2026`, obtenida de `source.sourceDate`
   de la fila autorizada. No se usa fecha propuesta ni tipo de corte aquí.
4. `Edad actual`: misma fórmula y cifra.
5. `Variedad`: valor de la suerte. La distancia sigue en tabla/datos;
   las fichas de finca conservan su KPI de distancia ponderada.
6. `Fecha propuesta de cosecha`: mantiene 24-dic-2026 / Corte mecánico;
   ausencia de propuesta sigue N/D sin sustituir por corte real.

Se retiran ambos badges duplicados exclusivamente de la cabecera de suerte.
Las fichas de finca mantienen su tratamiento anterior. El selector CSS está
acotado a `#cronoContent[data-geo-scope="lot"]`: padding de 12 px,
acciones en fila con wrap y columna en móvil; margen negativo heredado eliminado
para evitar recortar nombre/botones. La cabecera PC mide 86 px de alto.
Se conservan los tres botones y el nombre/contexto, sin panel ni rediseño.
El único ajuste del estilo de exportación es `white-space:pre-line` en el
subtexto de tarjetas cronológicas para conservar las dos líneas del aforo.

QA Chromium comprueba títulos, variedad y fecha de aforo, seis tarjetas,
ningún badge duplicado de suerte, alto PC menor a 130 px y límites de nombre/
botones dentro del contenido a 1440×900, 768×1024 y 390×844. También vuelve a
validar producción global/fincas, 2003/1927, múltiple, PDF/PNG, offline/rollback
y cero escrituras IDB al consultar/exportar. Mismo origen de datos auditado.
Las entregas anteriores se conservan en `archive/01245e0-approved` y
`archive/ac54ec8-approved`; el diagnóstico de margen está en `diagnostics`.


## Ajuste de estructura posterior a 22c7b18 (vigente)

La sexta tarjeta se titula exactamente **Fecha para cosecha**. Solo cambia
la etiqueta visible: se conserva el tipo interno de propuesta, BP/BQ, ISO,
formato español, faltantes y la independencia del último corte ejecutado.

### Detalle por suerte: orden exacto en suerte y finca

1. Suerte
2. Área
3. # de Corte
4. Fecha corte/siembra
5. Destino Cultivo
6. Textura
7. Tipo de riego
8. Surco
9. Distancia (km)
10. Zona
11. Variedad
12. TCH
13. TCH est. 26/27
14. Ton. est. 26/27
15. Tenencia
16. Estado TCH 25/26
17. Estado maestro
18. Observación

Se reordenan los nodos existentes, conservando filas, clase de estado, datos,
scroll y selección. La tabla de finca aporta Destino/Tenencia desde sus mismas
filas; Edad permanece en datos/KPI, sin una columna adicional en este detalle.
La observación vacía es `—`; se retira el texto de calendario añadido allí por
presentación. No se altera la observación almacenada. Tenencias CV/CA/PR se
presentan como Compra Venta/Arriendo/Propio, conservando el código original.
La selección múltiple mantiene su tabla previa y sus cálculos, fuera de este
selector `#cronoPrintPanel`. PDF/PNG heredan el orden del DOM sin otro builder.

En 99336: 99336 / Suerte 36; 8,91 ha; corte 8; 02-ene-2026;
Molienda; Pesado; Gravedad; 1,65; 7,37 km; 5-Productores; CP 72-2086;
67,15; 65,00; 579,15 t; Compra Venta; Medio; estado maestro de la generación
aplicada; observación vacía. El estado compartido muestra Mantener activo;
el aplicado conserva Molienda / Estimado utilizable, sin reescribir su origen.

### KPI con tamaño natural

El CSS se limita a `.single-suerte-kpis` en la ficha cronológica de suerte.
Se elimina el mínimo heredado de 104 px; padding 10×12 px, valor 22 px,
título 10,5 px, subtexto 11 px, gap 9 px y alineación al inicio del grid.
Se conserva el grid responsive y el gráfico sin cambios. Medidas PC 1440:
área/estimado 95,25 px; TCH anterior/fecha 81,50 px; edad/variedad 63,75 px.
No se encoge el gráfico, no se cambian cifras ni fórmulas. Sigue Aforo autorizado
con 12-oct-2026; distancia continúa en la tabla y no vuelve al KPI individual.

### Recuperación: diagnóstico comprobado, sin cambio a la persistencia

El `<head>` lee `casur_master_data/datasets/produccion_current` por transacción
readonly. El bridge aplica `CASUR_MASTER_OVERLAY` o el evento posterior
`casur-master-overlay`. La bandera y franja se derivan de la generación aplicada.
No es necesario elegir otra vez Excel si el snapshot ya existe en ese origen.

Prueba real con perfil persistente controlado, separado del usuario:
`%LOCALAPPDATA%/CASUR/QA/profiles/pr45-cronologico`.

- Aplicar y aprobar en http://127.0.0.1:4317.
- Offline/rollback siguen funcionando; recuperar de nuevo la generación
  aprobada mediante el control existente, cerrar TODO Chromium y reabrir
  el mismo perfil: carga automáticamente 2026.10.25-aforo.1101 y marca local.
- Mismo perfil en http://127.0.0.1:4313: carga datos compartidos 2026.09.06-siagri.1415.
- Perfil nuevo en http://127.0.0.1:4317: también carga compartidos.

Evidencia: `origin-profile-recovery.json` y `approved-after-browser-restart.png`.
No se reprodujo un fallo del cargador en el mismo origen/perfil. Un cambio de
puerto o perfil explica el retorno a compartidos observado en los previews:
son almacenes distintos. No se introduce copia entre orígenes, importación
automática, limpieza de cachés/IDB ni un nuevo sistema. El perfil QA conserva
su generación aprobada; el fallido previo se preservó en `profiles/diagnostics`.

Desde esta entrega se mantiene **4317**, sin seguir creando puertos. Para
reutilizar una aprobación del usuario, volver al mismo navegador/perfil y
puerto donde se aprobó. Una aprobación en 4316 no aparece en 4317. Si se elige
4317 por primera vez, debe aprobarse una generación allí mediante el flujo
existente. No se transfiere el perfil de QA al perfil real.

Límite: no se pudo inspeccionar el perfil IAB del usuario porque Work reportó
`Local browser use is disabled`. El diagnóstico se acredita con pruebas
reproducibles aisladas y lectura del bridge, no con inspección de ese perfil.

### QA de este ajuste

Producción 22 controles + 199 tests; Shell/GEO 63; TCH validate/test 91.
Chromium: 11 grupos con perfil QA persistente. Comparación exacta de 18
cabeceras/18 celdas en suerte compartida, suerte aplicada y finca; estimados
65/579,15 o guiones según generación; Tenencia de origen conservada; seis KPI
con altura menor a 104 px; nombre/botones sin recorte en PC/tableta/móvil;
múltiple, lectura de archivos, cero escrituras IDB en consulta/exportación,
offline, rollback y cierre/reinicio completo del navegador. Cifras globales,
2003 y 1927 sin cambios. PDF/PNG descargados y cuatro páginas revisadas.
Entrega anterior conservada en `archive/22c7b18-approved`.
