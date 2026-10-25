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
  El detalle de propuesta/tipo se incluye como texto en Observación, sin otra tabla.
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

Producción: 22 controles + 197 tests; Shell/GEO 63; TCH validate/test 91 cada uno.
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
