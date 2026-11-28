# Visitas de Campo 1.2 — identidad funcional propia

Candidata **App Maestra 1.7.0 · Visitas de Campo Productores de Caña 1.2.0** · Draft PR #79 · base `main` `21a9004`.

Sin cambios en:
- El Maestro de Suertes V1.8.3.
- El Estimador TCH 2.8.1 y sus cálculos.
- La generación 1102 y los datos oficiales.
- SIAGRI.

Visitas nunca se publicó en producción. La 1.2.0 reemplaza a la 1.1.0 en la misma candidata y conserva todo lo que ya funcionaba:
- Maestro Central, GPS y selección manual.
- Hallazgos opcionales, fotos originales y autoguardado.
- Respaldos, restauración, expedientes, seguimiento e informes.
- PWA independiente y funcionamiento sin conexión.

## 1. Propuesta de valor

Visitas es la herramienta del técnico para **atender al productor de caña**. Registra qué se observó, qué se recomendó,
solicitó o acordó, y qué se ejecutó y verificó, con evidencia fotográfica y un expediente técnico consultable.

- **El centro es el productor**, no el mapa. El mapa es una herramienta transversal: sirve para ubicar, elegir una suerte
  o ver hallazgos georreferenciados.
- **La gestión es el trámite técnico.** Cada problema avanza por cuatro etapas visibles:
  1. **Observado.**
  2. **Recomendado.**
  3. **En ejecución.**
  4. **Verificado.**
- **Los números describen la gestión, no el impacto.** Indican qué está abierto, pendiente o vencido. No se presentan
  conteos de registros como resultados agronómicos.

El uso de CASUR Maps como referencia está concluido. Visitas no reutiliza su código, CSS, iconografía distintiva,
composición visual ni navegación.

## 2. Identidad visual

Se conserva la paleta **Petróleo** de CASUR. Sobre ella, Visitas tiene elementos propios:

| Elemento | Visitas 1.2 |
|---|---|
| Cabecera | Clara (blanca) con filete Petróleo superior. Subtítulo «Atención técnica al productor · CASUR». Indicador GPS como etiqueta rectangular |
| Botón Registrar | Rectángulo redondeado Petróleo integrado en la barra, con su etiqueta |
| Familias de hallazgo | Cinco familias con color propio (tabla siguiente). Cada categoría hereda el color y el icono de su familia en botones, listas, cronología, fotos etiquetadas y fichas |
| Avance del trámite | Barra de cuatro etapas: Observado → Recomendado → En ejecución → Verificado |
| Productor | Monograma (iniciales) y expediente con pestañas fijas |
| Documentos | Pie documental blanco bajo la foto y ficha vertical de seguimiento técnico |
| Iconografía | Set de trazo propio. En 1.2 se redibujaron: malezas, plagas, riego, estrés hídrico, desarrollo, despoblación, cosecha y seguimiento. Se agregaron: productores, gestión, evidencias, comparación, cronología, reloj, alerta, archivo, cerrar, editar, volver e imprimir |

Familias de hallazgo:

| Familia | Color | Categorías |
|---|---|---|
| Cultivo | Verde `#3E7B4F` | Desarrollo, malezas, fertilización, despoblación, resiembra, siembra, renovación, semilleros |
| Sanidad | Terracota `#A3472A` | Plagas, enfermedades |
| Agua | Azul `#2A6496` | Riego, estrés hídrico, drenaje |
| Labores y cosecha | Ocre `#9A6A0E` | Labores, cosecha, madurantes, caminos |
| Gestión | Petróleo `#1B4D5C` | Atención al productor, seguimiento, otros |

## 3. Arquitectura de navegación

| Superficie | Secciones |
|---|---|
| Móvil, barra inferior | **Inicio · Productores · Registrar · Gestión · Más** |
| Móvil, «Más» | Mapa, Evidencias, Mis visitas, Nueva visita, Informes, Datos y respaldos |
| Escritorio, barra lateral | **Trabajo:** Inicio, Productores, Registrar, Gestión. **Consultas:** Mapa, Evidencias, Mis visitas, Informes. **Sistema:** Datos y respaldos |

Dónde quedó cada sección anterior:

- **Mapa.** Pasa a «Más» y a Consultas. También se abre desde el indicador GPS de la cabecera, desde «Ver en el mapa»
  en la ficha de suerte y desde el expediente.
- **Bitácora.** Se integra en **Gestión → Hallazgos**, con los filtros Abiertos, Vencidos y Cerrados, búsqueda y el
  avance de cada problema.
- **Solicitudes y seguimiento.** Pasan a **Gestión**, en las pestañas Recomendaciones, Solicitudes, Compromisos y
  Todo el seguimiento.
- **Evidencias.** Es una sección propia y además una pestaña del expediente.
- **Informes.** Están en «Más» y en Consultas. El informe de una visita o de un productor también se abre desde la
  visita o el expediente.

Las rutas anteriores siguen funcionando: `#/bitacora` y `#/seguimiento` redirigen a Gestión sin perder registros ni
enlaces guardados.

La ruta del técnico es **productor → suerte → visita → hallazgo → seguimiento**:
- Productores → expediente (pestaña Suertes) → ficha de suerte.
- Ficha de suerte → visitas, hallazgos, evidencias y seguimiento de esa suerte.
- Hallazgo → recomendación, solicitud o compromiso → evidencia de seguimiento → verificación.

## 4. Inicio «Mi gestión de campo»

- Saludo con el nombre del técnico y período: **Hoy · 7 días · 30 días**.
- **Indicadores** (cada uno abre su lista):

  | Indicador | Regla |
  |---|---|
  | Visitas realizadas | Visitas iniciadas en el período |
  | Productores atendidos | Productores distintos visitados en el período |
  | Recomendaciones abiertas | Estado Pendiente, En gestión o Programado |
  | Solicitudes pendientes | Estado Solicitada o En gestión |
  | Compromisos vencidos | Recomendaciones, solicitudes o compromisos abiertos con fecha comprometida anterior a hoy |

- **Ubicación detectada en una franja compacta.** Muestra la finca y la suerte, el origen (GPS ± precisión o «Elegida
  manualmente»), la variedad, la edad y la etapa probable. Ofrece «Ficha» y «Cambiar». La discrepancia con el GPS se
  informa sin cambiar la selección.
- **Acciones inmediatas:**
  - Registrar visita.
  - Elegir finca.
  - Registrar hallazgo.
  - Tomar evidencia: la foto se vincula a la visita del día sin exigir un hallazgo.
  - Consultar expediente.
  - Dar seguimiento.
- **Además:**
  - Visitas en curso.
  - Agenda de compromisos: los vencidos y los que vencen en los próximos 7 días.
  - Productores atendidos recientemente.
  - Aviso de fotos sin respaldo confirmado.

## 5. Registrar

«¿Qué vas a registrar?» reúne en una pantalla los seis tipos de registro:
- Visita.
- Evidencia fotográfica.
- Recomendación.
- Solicitud.
- Compromiso.
- **Hallazgo observado**, con las categorías agrupadas por familia.

Elegir la categoría guarda el hallazgo de inmediato, con la opción «Deshacer». Los detalles técnicos siguen siendo
opcionales. «Ver todo el catálogo» muestra las 20 categorías.

Desde una visita, «Registrar» agrega el hallazgo **a esa visita**. Si la visita es retrospectiva, el hallazgo toma la
fecha de la visita y no recibe la ubicación actual del teléfono. Esto corrige un defecto de 1.1, que lo registraba en
una visita de hoy.

## 6. Expediente técnico

Encabezado:
- Monograma, código, zona y número de suertes.
- Área vigente según el Maestro (suma de las suertes que participan del área actual).
- Estado de la atención: última visita, problemas abiertos y compromisos vencidos.

| Pestaña | Contenido |
|---|---|
| Resumen | Situación actual por familia (problemas abiertos y suertes afectadas). Problemas recurrentes: la misma categoría en más de una visita. Próximos compromisos. Última visita y su observación general |
| Suertes | Variedad, área, estado, última visita, etapa probable y problemas abiertos. Cada suerte abre su ficha |
| Cronología | Visitas, hallazgos, recomendaciones emitidas, solicitudes, compromisos, cambios de estado (con nota y técnico) y fotografías, agrupados por mes |
| Seguimiento | Problemas por etapa (Observado, Recomendado, En ejecución, Verificado). Recomendaciones, solicitudes y compromisos por separado |
| Evidencias | Antes y después (evidencia inicial del hallazgo frente a la evidencia del seguimiento) y fotografías por suerte |

La **ficha de suerte** (`#/suerte/<clave>`) reúne:
- Ficha agronómica y etapa probable.
- Mapa vectorial de la finca con la suerte resaltada y los hallazgos georreferenciados.
- Hallazgos con su avance, seguimiento, evidencias y visitas.
- «Registrar aquí».

Se distinguen siempre:
- **Problema observado:** el hallazgo.
- **Recomendación:** no es una labor ejecutada.
- **Solicitud:** no es una entrega.
- **Ejecución y verificación:** las declara el técnico, con nota y evidencia.

No se crean órdenes, despachos ni registros SIAGRI.

## 7. Evidencias y documentos

### Foto etiquetada

La fotografía queda **entera y sin cubrir**. Debajo se agrega un pie documental blanco con:
- Banda del color de la familia.
- Categoría (o «Evidencia de la visita» o «Seguimiento») y logotipo.
- Productor y suerte, fecha y hora, código, variedad y edad.
- Ubicación: coordenadas verificables con su origen (GPS de la cámara o del teléfono), posición aproximada rotulada como
  tal, o «Sin ubicación verificable».
- Descripción completa: se ajusta en líneas, nunca se corta.
- Técnico e identificador.

El pie escala con el ancho de la foto. Las fotos pequeñas se llevan a 1080 px de ancho para que el texto sea legible.
Se probó con fotos horizontales, verticales y comentarios largos.

### Ficha de seguimiento técnico

Reemplaza a la tarjeta de hallazgo de 1.1. Es un documento vertical de 1240 px, con altura calculada según su contenido:
- **Encabezado:** logotipo, título y referencia. Productor, código, zona, suerte y técnico.
- **Avance** del trámite en cuatro etapas.
- **1 · Observación:** categoría, fecha, ficha agronómica breve, observación completa, detalles evaluados y severidad
  solo si se evaluó. Todas las evidencias, numeradas; cada foto se muestra completa dentro de su celda y su leyenda
  completa lleva fecha, ubicación y descripción.
- **2 · Recomendación y solicitudes:** texto completo, responsable, fecha, cantidad y estado.
- **3 · Seguimiento:** historial de estados del hallazgo y de sus recomendaciones, con nota y técnico; antes y después; y
  minimapa vectorial.

### Informes

- Cada hallazgo indica su **avance** y sus recomendaciones vinculadas.
- **Evidencias de la visita:** fotos vinculadas a la visita sin hallazgo.
- **Evidencias del seguimiento:** fotos vinculadas a recomendaciones, solicitudes o compromisos.
- Las fotos se imprimen completas, sin recorte, con su leyenda completa.
- Se aplica la norma editorial (`docs/ESTANDAR_EDITORIAL_INFORMES.md`).

## 8. GPS y automatización

**Ubicación de cada foto.** Se usan solo lecturas del teléfono tomadas hasta **30 s** antes o después de la captura (en
1.1 eran 2 minutos).
- Si entre lecturas hay un **desplazamiento de más de 25 m** (por ejemplo, al cambiar de lote) o la precisión supera los
  **50 m**, la posición se rotula **aproximada**, con su antigüedad y su precisión. No se presenta como coordenada
  exacta, ni en los documentos ni en los informes.
- Las fotos de galería nunca reciben la ubicación actual del teléfono.
- Siempre se puede guardar una foto sin GPS.

**Visitas retrospectivas.**
- Si el Maestro registra una siembra o un corte posterior a la fecha de la visita, la edad y la etapa quedan
  desconocidas («Sin historial suficiente para esa fecha»).
- Si la fecha es anterior a la de los datos del Maestro, la ficha muestra solo los atributos estables. Estado, destino,
  corte, estimado y cosecha programada **no se atribuyen** a esa fecha.
- La visita, el formulario y el hallazgo muestran el aviso «Registro retrospectivo».

**Etapa fenológica.** Sigue siendo una estimación por edad, rotulada «probable por edad» y corregible en campo. No hay
detalles cuantitativos obligatorios.

## 9. Release Gate

En `0511187` y `642efb8` falló `tools/check-context-hotfix.mjs` con `AssertionError: No QA/private artifacts`. La
causa era `docs/evidencias-visitas-v11/muestra-visitas.xlsx`, una muestra de Excel generada por el QA.

Corrección:
- Se retiró ese archivo. El control **se mantiene sin cambios**.
- Las muestras de Excel y los ZIP de respaldo se generan durante el QA en una carpeta temporal fuera del repositorio.
- En `docs/` solo se guardan capturas PNG, muestras JPG y PNG, PDF, GeoJSON y registros de texto.

`tools/release-gate-local.sh BASE_SHA` reproduce localmente los pasos del flujo de GitHub, para comprobarlos antes de
cada envío.

## 10. QA

Todo con datos sintéticos y perfiles aislados. Registros, capturas y muestras en `docs/evidencias-visitas-v12/`.

| Prueba | Resultado |
|---|---|
| `tools/qa-visitas.cjs` (flujo completo 1.2, móvil 360/390/412 y escritorio) | 26/26 PASS |
| `tools/qa-visitas-evidencias.cjs` (fotos vertical, horizontal y pequeña; comentario largo; fichas simple y completa) | 6/6 PASS |
| `tools/qa-visitas-update.cjs` (Visitas independiente + App Maestra, actualización coordinada) | 6/6 PASS |
| `tools/qa-maestro-central.cjs` | 10/10 PASS |
| `tools/qa-produccion-publicada.cjs` (regresión App 1.7.0, generación 1102) | 18/18 PASS |
| `tools/qa-update-162-170.cjs` | PASS |
| `node --test tests/*.test.mjs` | 181/181 PASS |
| `bash tools/release-gate-local.sh origin/main` | OK (todos los pasos del flujo) |
| Release Gate de GitHub sobre `76a5b8b` (run 46179020647) | **success** |
| Preview HTTPS `76a5b8b`: `qa-visitas` · `qa-visitas-evidencias` · `qa-maestro-central` | 26/26 · 6/6 · 10/10 PASS |

Preview: https://pr-79.casur-maestro-ux-review.pages.dev/Negocios_de_Cana_CASUR_APP/modules/visitas/

Capturas comparativas 1.1 → 1.2: `comparativo-inicio.png`, `comparativo-registrar.png`, `comparativo-gestion.png`,
`comparativo-expediente.png`, `comparativo-foto-etiquetada.png` y `comparativo-ficha.png`.

Muestras:
- Fotos etiquetadas: `muestra-foto-etiquetada-vertical-largo.jpg`, `-horizontal.jpg` y `-aproximada.jpg`.
- Fichas de seguimiento técnico: `muestra-ficha-seguimiento.png` (completa) y `muestra-ficha-seguimiento-simple.png`.
- Del flujo de QA: `qa-flujo-*.jpg`, `qa-flujo-muestra-ficha-seguimiento.png`, `qa-flujo-muestra-informe-visita.pdf` y
  `qa-flujo-muestra-ubicaciones.geojson`.

## 11. Limitaciones reales

- Los rangos de fenología por edad son **preliminares** hasta su validación por el equipo agronómico.
- «Antes y después» compara la evidencia inicial del hallazgo con la evidencia vinculada a sus recomendaciones. Las
  fotos de una visita posterior que no se vinculen al seguimiento no se emparejan solas.
- Los indicadores cuentan registros de **este teléfono**: no hay sincronización entre técnicos (no hay nube).
- La ficha de seguimiento es una imagen PNG. Para un PDF imprimible se usa el informe de la visita, con «Imprimir o
  guardar PDF» del navegador.
- La detección GPS depende de la geometría GIS preparada sin conexión. Sin ella, la selección manual sigue disponible.
