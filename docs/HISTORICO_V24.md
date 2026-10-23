# V2.4 - gráficos históricos y presentación gerencial

Base PR #31: 62591ceb84068e1208708cb370163ab826a0a32d. Rama hija; no merge ni despliegue.

## Alcance

Tratamiento de presentación exclusivo para gráficos multifinca y sus anexos. Las fichas individuales conservan el renderizador anterior. Serie completa verde, sin atenuación temporal, con interrupciones ante valores ausentes o saltos de zafras. Referencia ponderada y tooltip existentes conservados.

Etiquetas determinísticas: medidas Canvas de la fuente Arial, cajas de texto, candidatos superiores/inferiores y desplazamientos pequeños; penalización por intersección con marcadores, segmentos y etiquetas previas. No altera posiciones de puntos ni omite valores observados. Usa límites SVG, no índices alternados. La prueba focal contrasta cajas SVG reales y la invariancia entre últimas cinco/tres zafras.

Fincas seleccionadas: unidades horizontales con borde discreto, abreviación anterior intacta. Contenedor CASUR y tarjetas con borde superior; período con borde izquierdo.

Corrección posterior aprobada por el usuario: PDF ejecutivo y completo conservan los colores sólidos originales de la aplicación, incluidas las leyendas. Caso A: Dolores verde #0b7f3a y Peirano azul #005baa. Se retiró printFarmPatterns sin otros consumidores. Sin cambios de datos, escala u orden de barras. qa-gerencial-v2.cjs rechaza patrones, degradados y rellenos no sólidos en ambos informes.

## Validación

- `npm test --prefix modules/produccion`: 22 controles + 128 tests.
- `npm run validate --prefix modules/tch`: 91 tests.
- `node --test tests/*.test.mjs`: 48 tests.
- `node modules/produccion/tools/qa-v24.cjs`: invariancia de serie, colores, etiquetas y cambio de referencia en 1440x900 y 390x844.
- `qa-gerencial-v2.cjs`: escenarios A, B, una/tres/cinco fincas y personalizado; conciliación de KPI y TAH, PDF reales y auditoría de paginación.
- `qa-multifinca-recovery.cjs`: PDF/PNG individuales, suerte, multifinca, Cronológico, shell y recarga offline precargada.
- Sintaxis JS/HTML inline y `git diff --check`.

Caso A conserva 204.26/61.20/108.63/6.65 y 187.41/53.57/105.66/5.66; Km 36.10. Caso B: 188.84/48.92/108.56; TAH 5.310840138 aproximadamente; Km 36.10.

Evidencia local en C:/Users/ctije/Videos/CASUR_V24_QA. Entrega en `definitivo/`; `final/` conserva la primera tanda diagnóstica donde se detectó la especificidad de estilos antiguos de exportación, posteriormente corregida. Las siete páginas definitivas del caso A fueron inspeccionadas a color y en grises: ejecutivo 2, completo 5, sin recortes ni páginas vacías nuevas. Paginador original intacto.

## Límites y siguiente fase

Impresión física pendiente del usuario; grises es simulación digital. Por preferencia expresa del usuario se mantienen colores sólidos, aunque puedan aproximarse al imprimir en monocromo. El conjunto de candidatos de etiquetas es acotado: nuevas series mucho más densas requieren repetir QA visual. No se implementa cartografía ni se modifica GEO. El visor compartido existente queda fuera de este cambio.
