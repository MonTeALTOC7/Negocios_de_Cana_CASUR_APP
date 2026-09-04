# Hoja de ruta — Biometría de caña con visión por computadora

## Dictamen técnico

YOLOv5 es una base viable para **detectar y contar objetos visibles**: bases de tallos,
nudos, tallos expuestos, marcadores de calibración y clases de malezas. No convierte una
fotografía monocular en centímetros reales por sí solo. La altura y el diámetro exigen una
escala física en el mismo plano, calibración de cámara o información de profundidad.

Por lo tanto, no debe incorporarse a la app un botón que prometa medir H, D y POB desde
una foto cualquiera. Primero se necesita un protocolo de captura, un conjunto de datos CASUR,
mediciones manuales pareadas y validación independiente.

La v2.5 inicia correctamente la fase 0: guarda originales limpios, GPS, suerte, condición y
fuente del TCH. Los PNG con rótulos sirven para evidencia humana; **los originales sin rótulos**
son los que deben emplearse para entrenar modelos.

## Qué resuelve cada componente

| Variable | Visión recomendada | Requisito físico | Limitación principal |
| --- | --- | --- | --- |
| POB, tallos/m | Detector o segmentación de bases de tallo + tramo conocido | Dos marcadores que delimiten 3–5 m | Oclusión y tallos ocultos en caña cerrada |
| Altura H | Segmentación/keypoints base–ápice | Vara graduada o profundidad 3D | Acame: altura vertical no equivale a longitud del tallo |
| Diámetro D | Máscara del tallo y ancho robusto en píxeles | Patrón métrico en el mismo plano y profundidad | Perspectiva, lente y hojas que tapan el tallo |
| Malezas | Detección/segmentación por grupo o especie | Fotos cenitales y laterales normalizadas | Cambios por edad, herbicida, luz y cobertura |
| TCH | Motor agronómico actual usando H, D y POB medidos | Calibración contra aforo y TCH real | Propagación de error; D entra al cuadrado |

La fórmula actual debe mantenerse como motor transparente:

`TCHe = D²(mm) × H(m) × POB(tallos/m) × 0.007854 / DistSurco(m)`.

El modelo de visión no debe aprender un TCH opaco inicialmente. Debe medir las variables,
reportar confianza y dejar que el motor calcule el TCHe. Esto facilita detectar qué variable
origina un error.

## Arquitectura recomendada

1. **Captura estandarizada en la PWA**
   - Suerte y GPS desde el Maestro General.
   - Tres tipos de foto: base/población, perfil/altura y acercamiento/diámetro.
   - Patrón visible con ID y dimensiones conocidas.
   - Registro manual pareado de POB, H y D en la misma escena.
2. **Preparación fuera del teléfono**
   - Exportar originales de la carpeta `Originales_para_IA`.
   - Anotar cajas o máscaras y puntos de referencia.
   - Separar entrenamiento, validación y prueba por hacienda+suerte+fecha, no por fotos al azar.
3. **Modelo piloto**
   - Línea base: YOLOv5n o YOLOv5s para `stalk_base` y `calibration_marker`.
   - Para diámetro y límites del tallo: YOLOv5-seg o un modelo moderno de segmentación.
   - Para altura: keypoints o máscara más patrón métrico; alternativa avanzada, profundidad ARCore.
4. **Despliegue en la app**
   - Exportar el modelo a ONNX.
   - Inferencia local con ONNX Runtime Web: WebGPU cuando exista y WebAssembly como respaldo.
   - Cachear modelo y runtime en el Service Worker para modo campo.
   - Guardar predicción, confianza, versión del modelo y corrección manual; nunca sobrescribir el dato bruto.
5. **Validación agronómica**
   - Comparar cada H, D y POB automático contra cinta, vernier y conteo manual.
   - Comparar TCHe contra aforo y posteriormente contra TCH real de báscula.
   - Calibrar por variedad, edad, ciclo, condición hídrica y acame si los sesgos son consistentes.

## Protocolo de imágenes para el piloto

### Población

- Tramo fijo de 3 o 5 m delimitado por dos marcas visibles.
- Cámara a 0.7–1.2 m de las bases y aproximadamente perpendicular al surco.
- Una foto de cada lado cuando la cobertura impida ver bases; no sumar ambos conteos sin
  correspondencia, porque duplicaría tallos.
- Ground truth: conteo manual de tallos presentes dentro del mismo tramo.

### Altura

- Vara rígida de 2–3 m con bloques de alto contraste y dimensión conocida.
- Vara en el plano de los tallos medidos; cámara lo más perpendicular posible.
- Registrar por separado altura vertical y longitud de tallo cuando exista acame.
- Ground truth: al menos 5–10 tallos representativos por punto, conservando media y dispersión.

### Diámetro

- Acercamiento al entrenudo definido por el protocolo agronómico.
- Patrón de 40–60 mm o marcador ChArUco junto al tallo, en el mismo plano.
- Ground truth con vernier sobre los mismos tallos; registrar dos ejes si la sección no es circular.
- Estimar el ancho con mediana de varias filas de la máscara, no con el ancho total de una caja YOLO.

### Malezas, fase posterior

- Crear otro conjunto de datos y otra tarea. No mezclar inicialmente malezas con biometría.
- Empezar por grupos operativos: gramíneas, hojas anchas, ciperáceas y bejucos; pasar a especie
  solamente cuando la imagen permita una identificación agronómica confiable.
- Registrar cobertura manual por cuadrante para validar, no solo presencia/ausencia.

## Diseño del conjunto de datos

- Piloto útil: 1,500–3,000 imágenes bien estandarizadas, distribuidas entre fincas, edades,
  variedades, horas del día, fondos, teléfonos y condiciones. Producción normalmente requerirá más.
- Evitar que ráfagas casi idénticas del mismo punto queden repartidas entre entrenamiento y prueba.
- Unidad de separación recomendada: hacienda+suerte+fecha. Una suerte del conjunto de prueba no
  debe aportar fotos al entrenamiento de esa ronda.
- Etiquetas iniciales: `stalk_base`, `visible_stalk`, `calibration_marker`; luego malezas por grupo.
- Metadatos mínimos: ID original, suerte, fecha, GPS, variedad, edad calculada, surco, tramo,
  dispositivo, luz, acame, manual H/D/POB y TCH de referencia.
- Auditar 10–15% de anotaciones por un segundo revisor.

## Métricas y puertas de aceptación

No basta con mAP. Deben evaluarse:

- detección: precisión, recall, F1 y mAP50-95;
- conteo: error absoluto y MAPE de tallos/m;
- H y D: sesgo, MAE, RMSE y gráficos de residuales;
- TCH: sesgo, MAE, RMSE y MAPE contra aforo y báscula;
- robustez por variedad, edad, finca, luz, acame, malezas y teléfono.

Metas iniciales de ingeniería —a confirmar con CASUR, no estándares universales—:

- D: MAE ≤ 2 mm;
- H: MAE ≤ 0.15 m;
- POB: MAPE ≤ 10%;
- TCH de validación: MAPE ≤ 15% y sesgo medio dentro de ±5%.

Si una meta no se cumple, la app debe mostrar **medición asistida / requiere confirmación**, no un
resultado automático definitivo.

## YOLOv5 frente a alternativas

YOLOv5 continúa siendo práctico, liviano y exportable a ONNX, TFLite y TensorFlow.js. Existe
evidencia publicada de modelos YOLOv5 livianos para detectar nudos de caña, pero esos resultados
se obtuvieron en tareas y ambientes controlados; el propio estudio reporta degradación por luz,
proximidad de objetos y hojas. No demuestra medición de H, D y POB en caña adulta de Rivas.

La selección final debe surgir de un benchmark con el mismo conjunto CASUR:

- YOLOv5n/s para una línea base reproducible;
- una variante de segmentación liviana para diámetro y tallos superpuestos;
- un modelo moderno pequeño solo si mejora el error agronómico y el tiempo en los teléfonos reales.

Revisar también la licencia del framework/modelo antes de una distribución comercial o cerrada.

## Riesgos que no deben ocultarse

- El diámetro entra al cuadrado: un sesgo pequeño puede amplificar el TCH.
- En caña cerrada, una foto lateral ve tallos, no necesariamente toda la población.
- GPS del teléfono identifica el punto, pero no mide el tramo ni corrige la perspectiva.
- Un modelo entrenado en otra región, variedad o tipo de teléfono no queda validado para CASUR.
- Los rótulos sobre las fotos pueden convertirse en atajos espurios; entrenar solo con originales.
- Una PWA puede ejecutar ONNX en el navegador, pero ARCore Depth requiere normalmente una capa
  Android nativa o una evaluación específica de WebXR y compatibilidad de dispositivos.

## Fuentes técnicas primarias y oficiales

- Ultralytics, repositorio oficial YOLOv5 y exportación de modelos:
  https://github.com/ultralytics/yolov5
- Ultralytics, `export.py` con formatos ONNX, TFLite y TensorFlow.js:
  https://github.com/ultralytics/yolov5/blob/master/export.py
- Microsoft, ONNX Runtime Web y despliegue en navegador:
  https://onnxruntime.ai/docs/get-started/with-javascript/web.html
- OpenCV, calibración de cámara y reconstrucción 3D:
  https://docs.opencv.org/4.9.0/d9/d0c/group__calib3d.html
- Google ARCore, Depth API:
  https://developers.google.com/ar/develop/depth
- Xie et al. (2023), modelo G-YOLOv5s-SS para detección de nudos de caña:
  https://doi.org/10.1371/journal.pone.0295565
- Ubaid et al. (2024), conteo de plantas de caña con visión por computadora:
  https://pmc.ncbi.nlm.nih.gov/articles/PMC11122173/
