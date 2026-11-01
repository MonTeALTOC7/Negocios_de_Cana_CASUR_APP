# UX09 — auditoría semántica inicial

Base: e21eeca71846cb905113565b830aa5bef72c679f. Esta matriz distingue hechos del código de aspectos aún por verificar; no autoriza modificar datos ni motores.

| Fuente / campo | Significado y etiqueta | Ámbito y agregación | N/D y componente | Estado |
|---|---|---|---|---|
| `forecast.tch` mediante `forecastForRow` | TCH estimado de zafra autorizada | Suerte; agregados: toneladas autorizadas / ha válidas de molienda | N/D si no autorizado o inválido; KPI y Estimados | Hecho |
| `plan.date` mediante `referenceDate` | Fecha **propuesta**, no ejecución | Suerte, fecha de fuente autorizada | N/D sin fecha o procedencia; planificación | Hecho |
| `participation.activeArea` | Área activa (ha) | Suerte o suma del ámbito activo | N/D según fuente; KPI | Hecho |
| `currentAgeSummary` / `currentAgeKpi` | Edad actual ponderada, no edad al corte | Suerte o ámbito; mecanismo vigente | Cobertura del cálculo original; KPI | Hecho; fecha efectiva y límites por confirmar en QA |
| `cropStage(r)` / `stage` | Etapa productiva; **no número exacto de corte** | Agrupaciones agronómicas por etapa | Sin clasificar si fuente insuficiente; Distribución/Estimados | Hecho |
| Columna cronológica `# de Corte` | Número de corte registrado | Suerte; no usar como etapa ni crear agregación nueva sin validar fuente | Tabla técnica original | Hecho; confiabilidad y nombres de fuente por verificar |
| `historical-engine` TCH/KATM | Métricas históricas por zafra | Modelo histórico oficial; KATM ponderado por toneladas | N/D sin cobertura; gráfico | Hecho |
| `estimateArea`, `estimateTons`, `coberturaEstimadoAreaPct` | Área válida molienda, toneladas autorizadas, cobertura | Ámbito de molienda elegible; semilla excluida | N/D si denominador cero; Finca/Estimados | Hecho |
| `CASUR_GEO_DATA.getLotGeometry` | Geometría oficial | Suerte, no gráfica sintética | Fallback si no hay geometría; mapa | Hecho |

Hipótesis: los KPI originales pueden reorganizarse sin alterar el DOM usado para exportación aplicando reglas de presentación. No verificado: todos los casos de fuentes personales y los datos faltantes, fecha efectiva de edad, contenido completo de los PDF y comportamiento en todos los anchos. Las fases Finca, Estimados, General y submódulos siguen pendientes de implementación y QA.

## Incremento local de implementación

Se presenta el orden de KPI de suerte TCH estimado, fecha propuesta, área activa y edad actual mediante CSS; los nodos originales permanecen para exportación. Variedad continúa en cabecera y TCH previo en información técnica. Se añadió resumen productivo de finca a partir de `summary()` y resumen de aforo con fuente. El ranking de fincas permite ordenar por toneladas, TCH o área válida sin cambiar cálculos.

Prueba local `tools/qa-maestro-ux09-smoke.cjs` (servidor loopback puerto 4401): Pansaco 359,30 ha molienda, 9,14 ha semilla; orden de cuatro KPI 99336 y tres criterios de ranking. Son comprobaciones parciales: pendientes cobertura de ausencia/semilla/cero, filtros y retorno con navegación real, drill-down completo, todos los anchos, GIS/exportaciones/PWA e integración de otros submódulos. No se afirma aprobación visual ni implementación completa.

## Continuidad de consulta

El directorio de finca conserva la cadena de búsqueda en el estado del explorador al volver desde una suerte. Prueba local de ida y vuelta Pansaco → 99336 → Pansaco con filtro retenido: PASS. Los tres criterios del ranking se contrastaron con sus valores de la tabla: PASS. La prueba cubre Chromium móvil y no sustituye la batería integral ni el control del contenido exportado.

## Seguimiento de implementación y QA

El ranking de Estimados permite abrir un directorio de suertes del subconjunto efectivamente filtrado antes de consultar la finca o suerte. En Chromium móvil se comprobó que cerrar el diálogo preserva ámbito y orden; aún falta verificar retorno desde ficha de suerte al mismo ámbito y posición.

Validaciones ejecutadas: Producción 212 PASS y 22 controles estáticos; TCH 92 PASS. `node --test tests/*.test.mjs`: 95 PASS y 1 FAIL (`sw-iframe-redirect.test.mjs`), cuyo patrón de extracción usa saltos LF mientras el archivo de trabajo Windows tiene CRLF; la función existe en el SW base. No se alteró el SW ni el test. `qa-maestro-ficha-p0` falla por esperar seis KPI visibles, cuando UX09 pide cuatro; no se ha eliminado su aserción. `qa-maestro-ux05` no ejecutó por servidor 4398 no disponible. Estas fallas no acreditan regresión funcional por sí mismas pero deben resolverse o validarse antes de CI/entrega. Falta la batería completa PC/móvil, mapas, exportadores, PWA y retorno contextual integral.

## Revisión posterior a 3fa64b7

Se normalizaron CRLF/LF al extraer el helper del Service Worker en la prueba, sin cambiar el SW: batería raíz 98/98 PASS. Se actualizó el contrato P0 para exigir seis nodos originales y cuatro visibles en orden UX09, verificar el TCH anterior secundario y conservar todas las pruebas de mapa, gráfico y descargas: PASS. La prueba del directorio del ámbito pasó; se separó su búsqueda por dimensión/categoría/finca para evitar contaminación entre contextos.

`qa-maestro-ux05` se ejecutó con el servidor 4398 y falló esperando un botón «Zona» que la interfaz UX07 reemplazó en móvil por un selector; debe actualizarse sin perder las aserciones. Pendientes: retorno desde suerte al mismo ámbito/posición, batería de interacciones y capturas integral en todos los anchos, Historico/multiselección/PWA y PR/preview. No se considera candidato terminado.
