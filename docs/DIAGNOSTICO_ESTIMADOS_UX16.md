# UX16: diagnóstico técnico de Estimados Z26/27

Fase registrada el 25-Nov-2026, solo diagnóstico. Base: candidata `7ee4dd3` (PR #73), generación `2026.11.22-aforo.1102`, aforo **12-Oct-2026** y consolidación **22-Nov-2026**.

**No se implementa** hasta cerrar UX14 y UX15. No se implementan los tres rediseños a la vez.

## 1. Situación actual

Estimados Z26/27 **no es una vista registrada del shell**. Las vistas son Resumen, Cronológico, Histórico, Zonas y Análisis (`maestro-ux.js`, `views`). Hoy es el **objetivo «Estimados Z26/27» del explorador contextual** del Cronológico, en los niveles General y Finca. Además aparece como pestaña en Resumen y como KPI de la ficha de suerte.

| Elemento | Comportamiento actual | Motor |
|---|---|---|
| Resumen del aforo | Área con estimado, toneladas, TCH y suertes con estimado; notas de Semilla y de Molienda sin estimado | `CASUR_CRONO_PARTICIPATION.summary` |
| Escenario optimista | AF/AG en un desplegable cerrado, con diferencia frente al oficial | `forecastOptimistic` |
| «Analizar TCH por» | Zona, Riego (los siete tipos), Tipo de suelo, Tenencia, N.º de cortes, Variedad y Destino | `agronomicGroups` |
| Modos | TCH por grupo, TCH por zona y Ranking de fincas (toneladas, TCH o área) | mismo motor |
| Desglose | Grupo → suertes (directorio) | `scopedFarmDirectory` |
| Ficha de suerte | TCH estimado con «Último Aforo 12-Oct-2026»; «Fecha para cosecha 26/27» (BE, tipo de corte BF) y alerta de programación | `casur-enhancements.js` |

## 2. Datos disponibles por suerte (generación 1102)

| Campo | Contenido |
|---|---|
| AD/AE | `tchEst2627`, `tonEst2627` y `millingEstimatedTons`: escenario **oficial** |
| AF/AG | `forecastOptimistic.tch` y `.tons`: escenario **optimista**, nunca garantizado |
| P | `tch`: TCH anterior **según el aforo**. No equivale al ejecutado Z25/26 (coincide en 811 de 884 suertes) |
| BE/BF | `plan.date.iso` y `plan.cut`: **plan de cosecha**, no aforo |
| Edad proyectada | `plan.calculatedAge`, edad al BE en meses |
| Atributos | NC (`corte`), variedad, textura, `tipoRiego`, destino, zona, siembra y último corte |
| Histórico | `lotCompact` con área, toneladas, TCH y KATM por zafra (Z16/17–Z25/26), y riego **actual** del lote |

## 3. Evidencia cuantitativa (observada, sin hipótesis)

- **Cobertura:** las 946 suertes de Molienda tienen AD. Las 49 de Semilla no aplican.
- **Plan BE por mes:**

  | Mes | Suertes | Toneladas |
  |---|---|---|
  | Dic-2026 | 206 | 131,267 t |
  | Ene-2027 | 169 | 108,955 t |
  | Feb-2027 | 233 | 142,176 t |
  | Mar-2027 | 198 | 109,396 t |
  | Abr-2027 | 140 | 69,863 t |

  BF: 787 suertes con corte mecánico y 159 manuales.
- **Población equivalente** (suertes con AD y con cosecha Z25/26, por riego actual):

  | Sistema | Suertes | TCH Z25/26 ejecutado | TCH estimado Z26/27 | Brecha |
  |---|---|---|---|---|
  | Riego | 716 | 66.13 | 63.26 | −21,711 t |
  | Secano | 128 | 60.21 | 39.06 | −16,159 t |
  | Ventana (por confirmar) | 40 | 59.99 | 76.59 | +4,244 t |

- **Bajo rendimiento estimado:** 198 suertes con AD < 45 TCH, en 1,724.91 ha. Incluye 31 suertes con AD ≤ 15, de las cuales 24 son Secano de 1-Sur (auditoría pendiente con Campo).
- **Edad proyectada al BE:** entre 7.0 y 29.5 meses. 51 suertes quedan por debajo de 10 meses y 4 por encima de 16. Hay 1 alerta de programación vigente (6/04).

## 4. Brechas funcionales

1. **Riego y secano:** «Riego» se trata como una dimensión de siete tipos. No existe el sistema productivo Riego, Secano, Ventana y Sin dato como filtro transversal.
2. **Comparación histórica:** no hay comparación con el ejecutado Z25/26 sobre **poblaciones equivalentes**. La comparación actual es implícita con la columna P.
3. **Brechas:** no hay brecha en toneladas ni en TCH por suerte, finca o zona, ni ranking de caídas o recuperación.
4. **Plan de cosecha:** BE/BF solo se ven por suerte. No hay calendario mensual, mezcla mecánico/manual por mes ni edad proyectada al BE por grupo.
5. **Riesgos:** no hay alertas agregadas de bajo rendimiento estimado, edad fuera de rango ni AF < AD.
6. **Rankings:** solo hay ranking de fincas, sin prioridades por suerte ni filtros combinados.
7. **Navegación:** no hay enlaces desde Análisis por Zona ni desde Análisis que conserven el ámbito.

## 5. Propuesta UX16: seis familias

| Familia | Contenido | Fuentes |
|---|---|---|
| Resumen ejecutivo | KPI oficiales (AD/AE), cobertura y escenario optimista separado | 1102 |
| Desempeño productivo | TCH estimado frente a ejecutado Z25/26 en población equivalente, por zona, finca, variedad, suelo, NC, riego y destino | 1102 + Histórico |
| Potencial y brechas | Brecha oficial frente a histórico y frente a optimista, en toneladas y TCH, rotulada como escenario | AD/AE, AF/AG y Z25/26 |
| Riesgos agronómicos | Alertas **observadas**: AD < 45, AD ≤ 15, edad al BE fuera de rango, AF < AD y alertas de programación | 1102 |
| Plan de cosecha | Calendario BE por mes y semana, mecánico frente a manual (BF), toneladas por mes y edad proyectada | BE/BF |
| Rankings y prioridades | Suertes y fincas por brecha, por TCH estimado y por toneladas, siempre dentro del sistema (Riego o Secano) | motores oficiales |

**Reglas de la fase:**
- Riego y Secano siempre separados; Ventana pendiente; Sin dato explícito.
- AD/AE es el escenario oficial y AF/AG el optimista.
- BE/BF corresponden al plan de cosecha.
- Se distinguen **dato observado**, **estimado**, **alerta** e **hipótesis**. No se inventan causas, costos ni labores.
- Fechas en `DD-MMM-AAAA`.
- Se reutilizan el agregador por sistema de UX14 y los motores oficiales, sin cambiar datos.

**Dependencias:** UX14, que aporta el agregador por sistema y los enlaces contextuales, y UX15, que aporta las familias y los rankings compartidos.
