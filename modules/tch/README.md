# Estimador TCH CASUR — v2.7.2

PWA estática para GitHub Pages orientada a trabajo de campo de Negocios de Caña CASUR.

## Mejoras principales v2.7.2

- Antes de seleccionar el Excel de estimados, el usuario debe declarar obligatoriamente su fecha efectiva.
- Si la fecha declarada contradice la fecha detectada en el encabezado o nombre del archivo, la aplicación bloquea la actualización.
- Una modificación manual del TCH también exige indicar su fecha efectiva; ya no se asigna automáticamente la fecha del día.

- Corrige la trazabilidad temporal: el TCH estimado conserva su fecha real `17-jul-2026`; `24-ago-2026` identifica únicamente la actualización del cronológico maestro.
- Una importación del cronológico sin fecha explícita del estimado nunca reemplaza esa fecha con el día de carga.

- Cronológico oficial `REPORTE` del 24-ago-2026 incorporado: 1,053 suertes únicas, 10,030.65 ha, 262 de Productores y 245 TCH estimados Z26/27.
- Importador de maestro con detección de hoja, fila de encabezado y aliases de columnas; reconoce los encabezados oficiales y variantes equivalentes.
- Ficha de suerte con jerarquía clara: zafra 25/26, estimado 26/27 e histórico promedio.
- Comparativos de biometría, PNG ejecutivo y Excel frente al estimado 26/27.
- Etiqueta fotográfica gerencial: fotografía completa, panel blanco externo, jerarquía por bloques, observación completa y denominación exacta `TCH ESTIMADO Z26/27`.
- `Guardar visita` ya no genera ZIP. Cada PNG puede descargarse o compartirse desde el historial.
- Filtros y exportación en un desplegable compacto; búsqueda normalizada por hacienda, código, suerte, técnico, motivo y observación.
- Visitas completamente editables; los PNG se regeneran a partir de la información corregida.
- TCH de visita enlazable con una biometría guardada o con una nueva biometría iniciada desde la visita.
- El antiguo módulo de avance se sustituye por consulta del cronológico, TCH estimado Z26/27, biometrías y visitas por suerte.
- Nuevas fotos almacenadas como Blob; datos antiguos en Base64 siguen siendo compatibles.

## Módulo principal: Visitas de campo

- Selección desde el Maestro General.
- Captura libre de las fotografías necesarias desde cámara o galería, optimizadas antes de guardarse.
- Corrección Android/WebView: la selección se copia antes de limpiar cámara o galería para que las imágenes sí lleguen a la visita.
- GPS, técnico, motivo y condición agronómica.
- TCH opcional identificado como visual, aforo o biometría; una visita puede guardarse sin estimar TCH.
- PNG etiquetado con panel externo compacto y solo con los datos realmente registrados.
- Descarga directa y opción Compartir mediante Web Share; ZIP únicamente para agrupación masiva.
- Conservación de originales limpios para preparar el futuro conjunto de datos de visión artificial.
- Historial Excel de visitas e índice de fotografías.
- Persistencia local en IndexedDB y funcionamiento sin conexión después de instalar la PWA.

La carpeta `docs/` incluye la arquitectura propuesta para biometría con YOLO/visión por computadora. No se presenta como medición automática hasta entrenar y validar un modelo con datos reales CASUR.

## Base agronómica y compatibilidad

- Maestro General construido desde la hoja `REPORTE` del cronológico.
- 1,053 suertes operativas y 10,030.65 ha según el cronológico oficial del 24-ago-2026.
- Se incluyen Zonas 1-Sur, 2-Centro, 3-Norte y 5-Productores.
- Zona 0 / Sucuya queda excluida del maestro operativo.
- `Tn`: `CA=Arriendo`, `CV=Compra Venta`, `PR=Propio`.
- Productores (Zona 5) continúa como prioridad visual, pero el buscador cubre todo el maestro sin selector obligatorio de zona.
- Biométría inicia con P01 y permite agregar libremente P02, P03, etc.
- Solo se muestra un punto a la vez mediante navegación horizontal.
- Fórmula oficial: `TCHe = D²(mm) × H(m) × POB × 0.007854 / DistSurco(m)`.
- Compatibilidad de lectura con biometrías v2.3 almacenadas en cm.
- Pesaje opcional integrado por punto, desactivado por defecto y activable manualmente cuando se requiera; nunca sustituye ni se promedia automáticamente con el TCH proyectado.
- Flujo Medición → Cálculo; TCH proyectado es el resultado visual principal.
- Edición de mediciones y validación opcional.
- Se permite guardar 1 o 2 puntos con advertencia de representatividad.
- El almacenamiento IndexedDB y los pesajes históricos separados se conservan.
- Exportación XLSX ampliada con Maestro General, tenencia, H(m), D(mm), TCHe, peso opcional y validación.

## Desarrollo local

En Windows, descomprimir el ZIP y ejecutar:

`PROBAR_LOCAL.bat`

La aplicación abrirá en `http://127.0.0.1:4173/`.

También puede ejecutarse:

```bash
node tools/local-server.mjs
```

o:

```bash
python -m http.server 4173
```

## Pruebas

```bash
npm test
npm run validate
```

## Publicación

Destino previsto, una vez aprobada la versión:

`MonTeALTOC7/Estimado_TCH_APP_CT`

La v2.7.2 consulta primero `data/suertes.json` y mantiene `data/productores.json` como compatibilidad para Zona 5.

No contiene claves privadas ni requiere ChatGPT para funcionar.

### Cambios de campo v2.4.1
- Guía visual compacta accesible desde Inicio y desde Puntos de muestreo.
- Selectores de distancia entre surcos y longitud de tramo con opción `Otro`.
- Pesaje opcional activable manualmente por punto, sin restricción por edad.
- Edad de referencia para proyección diferenciada de la fecha real de cosecha.
