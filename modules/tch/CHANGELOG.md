# CHANGELOG

## 2.7.2 — 2026-08-24

- La fecha efectiva del TCH estimado pasa a ser obligatoria antes de seleccionar el Excel.
- La aplicación compara la fecha declarada con la fecha detectada en el encabezado o nombre del archivo.
- Si ambas fechas difieren, la actualización queda bloqueada hasta que el usuario corrija la declaración.
- La trazabilidad registra explícitamente la fecha declarada junto con archivo, hoja y columna.
- La edición manual protegida del TCH también exige su fecha efectiva y deja de asignar automáticamente la fecha del día.

## 2.7.1 — 2026-08-24

- Se separa la fecha de emisión del TCH estimado (`17-jul-2026`) de la fecha de actualización del cronológico (`24-ago-2026`).
- El importador general ya no usa automáticamente el día de carga como fecha del estimado.
- Si el encabezado o archivo de estimaciones declara una fecha, se registra; si no la declara, se conserva la fecha previa cuando el valor no cambió o se muestra `Fecha del estimado no indicada`.
- La ficha de suerte ahora dice `Estimado al 17-jul-2026`, evitando la etiqueta ambigua `Fuente 24-ago-2026`.

## 2.7.0 — 2026-08-24

### Etiqueta fotográfica gerencial
- La fotografía se conserva completa y sin superposiciones; toda la información se dibuja en un panel blanco independiente.
- Orientación horizontal/vertical, fuente, columnas y altura se ajustan dinámicamente; la observación se exporta completa.
- Código, hacienda/productor y suerte forman un encabezado único. Los resultados técnicos se presentan en bloques y se usa exactamente `TCH ESTIMADO Z26/27`.
- Campos vacíos, no evaluados o sin estimación se omiten sin dejar espacios. Categorías con valor personalizado y descripciones técnicas opcionales.

### Visitas, filtros y biometría vinculada
- El buscador normaliza mayúsculas, acentos y varios términos; cubre hacienda, código, suerte, técnico, motivo, condiciones y observación.
- Fechas, productor, Excel y ZIP quedan dentro de `Filtros y exportación`, contraído por defecto.
- Las visitas pueden reabrirse, corregirse y actualizarse; conservan ID/fecha de creación y registran revisión/fecha de actualización.
- Las biometrías guardadas también pueden reabrirse, corregir sus puntos y recalcularse conservando el mismo ID.
- `Biometría de la app` permite seleccionar una biometría de la suerte o iniciar una nueva y volver automáticamente a la visita con el TCH vinculado.

### Cronológico y consulta
- Maestro actualizado desde `Cronologico_Maestro_CASUR_2026-08-24.xlsx`: 1,053 suertes únicas, 10,030.65 ha, 262 de Productores y 245 TCH estimados Z26/27.
- Importador flexible que prefiere `REPORTE`, detecta la fila de encabezado y reconoce nombres oficiales o equivalentes.
- Se incorporan número de riegos, estado, observación y toneladas estimadas Z26/27; la tenencia textual se convierte a CA/CV/PR.
- `Consulta` reemplaza el módulo de avance: muestra ficha cronológica, TCH ESTIMADO Z26/27, biometrías y visitas por suerte.

### Calidad
- 22 pruebas automatizadas y validación estática de la PWA, el cronológico oficial y el nuevo modelo de etiqueta.

## 2.6.0 — 2026-08-24

### Estimado oficial 26/27
- Integración de 262 suertes de Productores desde `Productores_V3`; 245 valores y 17 vacíos oficiales.
- Vinculación sin ambigüedad por Código hacienda + Suerte normalizada, con trazabilidad de archivo, hoja, columna y fecha.
- Importador protegido que valida duplicados y claves desconocidas antes de aplicar solo el campo 26/27.
- Nueva jerarquía visual y comparativos 26/27 en biometría, PNG ejecutivo, visitas y XLSX.

### Evidencias fotográficas
- Panel de datos externo a la foto, sin franjas oscuras, sin hora ni título redundante.
- Fecha `dd-mmm-aaaa` y contenido dinámico: no imprime valores vacíos, “No evaluado” ni TCH inexistente.
- Guardado separado de la exportación; descarga PNG y compartir por menú del dispositivo desde el historial.
- ZIP masivo configurable por filtro o selección, con etiquetadas, originales y/o Excel.
- Nuevas fotos en Blob con compatibilidad de lectura y respaldo para Base64 legado.
- Metadatos locales preparados para futura sincronización, sin activar servicios de nube.

## 2.5.1 — 2026-08-21

### Corrección de fotografías en visitas
- Se copia la selección de cámara o galería antes de limpiar el input, evitando que Android entregue un `FileList` vacío.
- Se agrega una segunda ruta de decodificación con `FileReader` para WebView/navegadores que fallen con URL temporales.
- Se elimina el máximo artificial de tres fotos; la visita admite todas las necesarias y sigue exigiendo al menos una.
- Se muestra el progreso de preparación y se bloquea Guardar únicamente mientras las imágenes se están procesando.
- Si IndexedDB no puede guardar, la visita y sus fotos permanecen en pantalla para reintentar.
- Caché PWA incrementada a v2.5.1 para forzar la actualización en el teléfono.

## 2.5.0 — 2026-08-20

### Visitas de campo
- Nuevo módulo principal para documentar una suerte con 1–3 fotografías, GPS, técnico, motivo, condición agronómica y observación.
- El TCH puede quedar sin estimación o identificarse como visual, aforo o biometría guardada.
- Se generan PNG etiquetados sin alterar los originales.
- Exportación ZIP organizada por hacienda/productor y visita, con originales limpios para el futuro conjunto de datos de visión artificial.
- Historial Excel con una hoja de visitas y otra de índice de fotografías.

### Persistencia y navegación
- IndexedDB sube a versión 3 e incorpora el store `visits` sin eliminar datos existentes.
- El respaldo JSON incorpora visitas y fotografías optimizadas.
- Navegación principal reorganizada: Inicio, Biometría, Visitas, Historial y Análisis; Maestro y Exportación permanecen accesibles desde Inicio.
- Caché PWA incrementada a v2.5.0.

### Investigación
- Nueva hoja de ruta técnica para medición de población, altura, diámetro y malezas mediante YOLO/segmentación, calibración física y validación contra aforo y báscula.

## 2.4.3 — 2026-08-18

### PNG ejecutivo / comparativo
- Se rediseña únicamente el bloque `Comparativo ejecutivo de productividad` del PNG.
- Se agregan brechas en TCH y porcentaje frente al histórico y a la zafra 25/26.
- Se agrega estado ejecutivo: sobre referencias, debajo de referencias, comportamiento mixto o sin referencias.
- Se incorpora una lectura corta de brecha ejecutiva sin modificar ninguna fórmula agronómica.

### PWA / actualización
- Se incrementa la caché del Service Worker a v2.4.3 para evitar que el teléfono siga usando `result-image.js` anterior.
- El registro del Service Worker solicita actualización sin reutilizar la caché HTTP del script.

## 2.4.2 — 2026-08-18

### PNG ejecutivo
- Mejora específica del bloque **Comparativo ejecutivo de productividad** dentro del PNG exportado.
- Se reemplaza el comparativo simple por una versión más ejecutiva con:
  - estado comparativo general (arriba de referencias / mixto / debajo);
  - tres tarjetas resumen: Proyección actual, Histórico promedio y Último TCH 25/26;
  - barras comparativas más legibles;
  - dos tarjetas de brecha: **vs histórico** y **vs 25/26**, mostrando diferencia absoluta en TCH y diferencia porcentual;
  - una lectura ejecutiva resumida para compartir y revisar rápidamente.
- Se amplía la altura del PNG para dar mejor aire visual sin afectar cálculos ni datos.

### Compatibilidad
- Sin cambios en fórmulas, IndexedDB, maestro, biometrías, pesajes, exportación XLSX ni lógica de negocio.
- Caché del Service Worker incrementado a v2.4.2.

## 2.4.1 — 2026-08-17

### UX / campo
- La fórmula deja de ocupar espacio en Inicio y se reemplaza por una guía rápida visual, plegada en modal.
- Datos de la suerte con jerarquía de color CASUR/navy; TCH histórico y TCH 25/26 se destacan.
- Distancia entre surcos con presets 1.50, 1.65, 1.75, 1.80 y 2.20 m; 1.40 solo puede ingresarse en `Otro`.
- Longitud de tramo con presets 3, 5 y 10 m más `Otro`; POB y texto de ayuda se actualizan inmediatamente.
- Pesaje por punto inicia siempre en `No`, puede activarse manualmente a cualquier edad y continúa siendo solo contraste.
- `Edad objetivo de cosecha` se renombra a `Edad de referencia para proyección` para no confundir el horizonte técnico con la fecha real de cosecha.

### Compatibilidad
- Sin cambios destructivos en IndexedDB, maestro, biometrías históricas, pesajes heredados, XLSX o PWA.
- Caché del Service Worker incrementado a v2.4.1.

## 2.4.0 — 2026-08-16

### Maestro
- Migración de maestro integrado a 1,054 suertes desde `REPORTE`.
- Exclusión de Zona 0 / Sucuya.
- Tenencia `CA/CV/PR`.
- Nuevo `data/suertes.json`.
- `data/productores.json` conservado como compatibilidad de Zona 5.
- Importador Excel busca `REPORTE` primero.
- Búsqueda global con prioridad de Productores.

### Biometría
- P01 automático.
- Puntos dinámicos sin selector de cantidad inicial.
- Navegación horizontal, un punto visible por vez.
- Fórmula y UI en H(m) y D(mm).
- Compatibilidad con unidades legacy v2.3.
- Pesaje opcional integrado desde 10 meses.
- TCHpeso como contraste, no como sustituto.
- Flujo de Medición a Cálculo.
- TCH proyectado destacado.
- Edición y validación opcional.
- Se permite guardar muestreos de 1 o 2 puntos con advertencia.

### Datos/exportación
- XLSX ampliado.
- Persistencia IndexedDB conservada.
- Pesajes antiguos preservados.
- Service Worker actualizado a caché v2.4.0.

### Pruebas
- 13 pruebas unitarias aprobadas.
- Validación estática verifica 1,054 suertes, 10,030.06 ha, Zona 0 excluida y tenencias.
