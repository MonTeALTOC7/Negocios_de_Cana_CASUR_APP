# Estándar editorial de informes PDF/PNG — minimalismo informativo ejecutivo

**Norma permanente del repositorio** (vigente desde el 27-Nov-2026). Se aplica a todo informe que la aplicación
exporte a PDF o PNG: Cronológico y Histórico de Finca y de Suerte (motor de informes,
`modules/produccion/js/report-engine.js` + `report-models.js`) y, desde R3, a los informes múltiples y de Zona.
Todo cambio a un exportador debe cumplirla y mantener verde su prueba editorial (`tools/qa-informes.cjs`).

## 1. Destinatarios

Los informes son para productores, gerencia y administradores de finca. No son auditorías del software. Cada dato
impreso debe tener utilidad para decidir; lo demás se omite.

## 2. Qué se imprime

- **KPI:** solo etiqueta, valor y unidad. Sin texto debajo del valor.
- **Encabezado (uniforme en todos los exportadores):** a la izquierda, logo, título del informe, finca (o finca y
  suerte) y los datos de identificación necesarios: código, zona, tenencia, variedad o tipo de riego cuando
  corresponda, y el período de zafras en los históricos. A la derecha, siempre «Negocios de Caña · CASUR» y debajo
  «Consulta: DD-MMM-AAAA · hora». Los cronológicos no muestran la fecha de aforo.
- **Pie:** solo «Negocios de Caña · CASUR» y «Página X de Y».
- **Fechas:** DD-MMM-AAAA (p. ej. 12-Oct-2026).
- **Nombres de archivo:** `Cronologico_{Finca}_{DD-MMM-AAAA}`, `Cronologico_{Finca}_Suerte_{NN}_{DD-MMM-AAAA}`,
  `Historico_{Finca}_{DD-MMM-AAAA}` e `Historico_{Finca}_Suerte_{NN}_{DD-MMM-AAAA}`, con la extensión `.pdf` o `.png`.
  El nombre no lleva tildes y los espacios se sustituyen por «_».

## 3. Qué no se imprime

- Textos explicativos bajo los KPI, fórmulas o explicaciones de cálculo, párrafos de relleno y advertencias
  metodológicas innecesarias.
- Referencias a columnas de Excel (AD, AE, AF, AG, BE, BF, P…), nombres de archivos fuente, versiones,
  generaciones, fechas de consolidación y cualquier otro metadato interno.
- Expresiones técnicas internas: «estimado utilizable», «motor oficial», «universo de molienda», «columna del aforo»,
  «plan de cosecha; no es aforo», «ponderado por…», «fuente…» y similares.
- Información duplicada: un mismo dato no se repite en el KPI, el encabezado, la ficha y la tabla.
- Indicadores sin utilidad ejecutiva y clasificaciones artificiales. Se muestran las categorías originales de la
  fuente (por ejemplo, el tipo de riego original).
- Características vigentes presentadas como registros históricos por zafra.

Los textos eliminados **no se sustituyen** por otras explicaciones.

## 4. Dónde vive la trazabilidad

La procedencia de cada cifra (columna, archivo, motor o regla de cálculo) se documenta en el código, en las pruebas y
en la documentación técnica, nunca en el informe:

- Comentarios de cabecera de `modules/produccion/js/report-models.js`: fuente de cada indicador.
- `tools/qa-informes.cjs`: paridad de cada indicador visible con el panel oficial y con los motores; prueba editorial
  que rechaza los patrones prohibidos de la sección 3.
- `docs/EXPORTADORES_R1_R2.md`: decisiones del motor y de las plantillas.

## 5. Integridad de datos (sin cambios)

- No se modifican los datos oficiales, SIAGRI ni los motores agronómicos.
- No se inventan valores. Un dato ausente se muestra como «—»; no se sustituye por otra fuente.
- El TCH anterior Z25/26 es el ejecutado del Histórico. No se confunde con la columna TCH del aforo.
- Las suertes inactivas se listan aparte y no suman a las cifras productivas.

## 6. Presentación

Paleta Petróleo y tipografía Inter. Diseño ejecutivo compacto, con encabezados proporcionados, pocos bordes y cajas,
jerarquía clara y cifras alineadas. Los gráficos son coherentes entre informes, las tablas legibles y la paginación
equilibrada, sin páginas casi vacías ni iconos decorativos.
