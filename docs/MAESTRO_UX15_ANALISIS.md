# UX15: Análisis en seis familias (Issue #66, segunda etapa)

**Rama:** `claude/ux15-analisis`.
**Base:** `claude/ux14-analisis-zona` (PR #76, `f69b989`), que a su vez se apoya en la candidata del PR #73. Cuando #73 y #76 lleguen a `main`, el PR se reapunta sin cambiar el código.

No cambian los datos (generación 1102), los motores, las versiones (App 1.6.2 y Producción V1.8.3, candidatas sin publicar), `index.html` ni SIAGRI.

## Enfoque

`installAnalisisUx15()` en `modules/produccion/js/maestro-ux.js`, con estilos en `maestro-ux.css`. Es una capa de presentación sobre la sección Análisis existente:

- **No se reconstruye ningún panel.** Los 13 paneles ejecutivos y sus motores siguen en el DOM.
- **Navegación agrupada.** Los paneles se ordenan en seis familias.
- **Paneles nuevos.** Solo se agregan donde aportan Riego/Secano o comparabilidad, y usan las mismas funciones del tablero de zona de UX14.

## Familias

| Familia | Paneles existentes | Aporte UX15 |
|---|---|---|
| **Resumen** | Resumen | Tablero con Total / Riego / Secano, KPI Z25/26, franja histórica, composición, tendencia y referencia corta a Estimados |
| **Desempeño** | Tendencia TCH, TCH × KATM, Mejores desempeños, Caídas | Comparabilidad por zona: TCH de la última zafra frente a su histórico, por sistema |
| **Decisiones** | Decisiones, Prioridades, Oportunidades, Renovación | «Recuperación»: mayores caídas observadas por finca, dentro del sistema |
| **Composición** | Variedades, Zonas | Acceso al Análisis por Zona (composición territorial por sistema) |
| **Técnica** | Vista técnica | Sin cambios |
| **Maquila** | Maquila | Nota: Maquila es independiente y no entra en los totales de producción propia |

**Navegación por ancho:**
- **Escritorio (≥ 700 px):** pestañas de familia.
- **Android:** un selector compacto.
- Dentro de cada familia, solo se muestran las pestañas de sus paneles. Si la familia tiene un único panel, la fila de pestañas se oculta.

## Resumen

- **Selector de sistema.** Total / Riego / Secano, con Ventana «por confirmar» como chip cuando tiene registros. Es el mismo ámbito que Zonas (`CASUR_ZONE_SCOPE`): lo elegido en Análisis se conserva en Cronológico, Histórico y Estimados.
- **KPI Z25/26.** TCH, área cosechada, toneladas y KATM.
  - **Total:** suma del motor oficial de zonas. Coincide exactamente con los KPI ejecutivos anteriores: 63.94 · 9,735.96 ha · 622,474 t · KATM 98.65.
  - **Riego y Secano:** las mismas suertes oficiales, por **riego actual del lote**. Se rotula siempre así.
- **Franja.**
  - TCH histórico (76.87), últimas 3 (68.19) y Δ frente al histórico (−12.93), rotulado como diferencia observada sin causa.
  - Edad a cosecha Z25/26.
  - Potencial (motor ejecutivo oficial, solo en Total), rotulado como estimación técnica.
- **Composición.** Área y toneladas Z25/26 por sistema.
- **Tendencia.** Líneas por zafra para TCH, área, toneladas o KATM: Total oficial más las series Riego, Secano y Ventana, con su cobertura informada.
- **Referencia Z26/27.** Una sola línea con el aforo (fecha de los metadatos), el TCH y las toneladas estimadas del sistema, más «Ver Estimados», que abre el explorador con el ámbito «Sistema». **No hay tablas ni análisis de Estimados:** eso es UX16.
- **Fila anterior de 8 KPI.** Se oculta porque sus datos están en el tablero; se conserva en el DOM.

## Desempeño: comparabilidad por zona

- **Columnas:** área y TCH de la última zafra, TCH histórico, TCH de las últimas 3 y Δ frente al histórico, por zona y dentro del sistema elegido.
- **Total:** igual a `zoneAnalysis` en cada zona.
- **Riego y Secano:** iguales al Histórico de Zona (UX14-B).
- **Zonas solo históricas:** se rotulan «sin 25/26».
- **Navegación:** al tocar una zona se abre su Histórico con el mismo sistema. «← Volver a Análisis · Desempeño» devuelve a la misma familia.

## Decisiones: recuperación por sistema

- **Población:** fincas con ≥ 10 ha cosechadas en Z25/26 y TCH por debajo de su propio histórico, dentro del sistema elegido.
- **Orden:** por Δ TCH. Se muestran 10, con «Mostrar todas».
- **Cálculo:** Δ t = (TCH Z25/26 − TCH histórico) × área Z25/26.
- **Rotulación:** es una **diferencia observada frente al propio histórico**, no una pérdida atribuida ni una causa. No se inventan causas.
- **Navegación:** al tocar una finca se abre su ficha histórica, con retorno a Análisis · Decisiones.

## Relación con UX16

UX15 no reproduce Estimados.

- **Estimados Z26/27** (brechas, población equivalente, descomposición de variaciones, plan BE/BF y riesgos) sigue registrado en `docs/DIAGNOSTICO_ESTIMADOS_UX16.md`, Issue #75.
- **Desde UX15:** la referencia de una línea y el enlace con el sistema.
- **Para UX16:** UX15 deja las familias y la navegación contextual, que UX16 reutilizará.

## QA

`tools/qa-maestro-ux15.cjs`: **15/15 PASS**.

- **Familias:** las seis cubren los 13 paneles, cada uno una sola vez, y todos se conservan.
- **Resumen Total:** igual a los KPI ejecutivos oficiales y a la suma de `zoneAnalysis`. La fila anterior queda oculta, pero presente en el DOM.
- **Resumen por sistema:**
  - Riego y Secano iguales al Histórico de Zona general.
  - Riego + Secano + Ventana + Sin dato = Total.
  - Maquila excluida.
- **Tendencia y referencia Z26/27:**
  - Tendencia con Total oficial y series por sistema; las 4 métricas.
  - Referencia Z26/27 igual al tablero de zona; Estimados recibe el ámbito «Sistema» con las mismas cifras.
- **Desempeño:** paridad con `zoneAnalysis` (Total) y con el Histórico de Zona (Riego). Navegación y retorno.
- **Decisiones:**
  - Solo caídas, ≥ 10 ha, orden por Δ y Δ t = Δ TCH × área.
  - Rotulación sin causas.
  - Navegación a la ficha y retorno.
- **Composición y Técnica:** Composición abre Zonas con retorno; Técnica y los paneles anteriores quedan intactos.
- **Responsive:** 360, 390, 768, 1280 y 1536 px sin desbordamiento horizontal y sin errores de página. Selector compacto en Android y pestañas en escritorio.

## Pendiente

- **Exportación PDF/PNG de las familias de Análisis:** requiere un tipo nuevo en el motor de `index.html` protegido. Solo se propondría con autorización, igual que en UX14-C.
- **GIS de Zona:** registrado como mejora posterior (UX14).
