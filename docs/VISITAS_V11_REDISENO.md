# Visitas de Campo 1.1 — rediseño integral

> **Reemplazado por 1.2** (`docs/VISITAS_V12_IDENTIDAD.md`): la navegación, el inicio, el registro, el expediente y las
> evidencias de este documento corresponden a 1.1. Se conserva como historia de la candidata.

Candidata **App Maestra 1.7.0 · Visitas de Campo Productores de Caña 1.1.0** · Draft PR #79 · base `main` `21a9004`.

Sin cambios en:
- El Maestro de Suertes V1.8.3.
- El Estimador TCH 2.8.1.
- La generación 1102.
- SIAGRI.

Visitas 1.0.0 nunca se publicó en producción; 1.1.0 la reemplaza en la misma candidata.

## 1. Criterio

Máxima automatización, mínima digitación y libertad total del técnico. El GPS **asiste**, nunca restringe: sin permiso,
sin señal, con baja precisión o desde la oficina, todo funciona con selección manual. Un registro puede ser solo
«finca · categoría» o tan completo como el técnico quiera. Nada se completa con valores supuestos.

## 2. Referencias externas

Durante 1.1 se estudiaron otras herramientas solo como referencia funcional. No se copió código ni estilos, y no se usan
datos ajenos (cronológico ni geometría). Ese uso como referencia está **concluido**. Desde 1.2, Visitas tiene identidad,
navegación y evidencias propias: ver `docs/VISITAS_V12_IDENTIDAD.md`.

## 3. Navegación

- **Móvil:**
  - Barra inferior: Inicio, Mapa, **Registrar** (botón central), Bitácora y Más.
  - «Más» agrupa Mis visitas, Nueva visita, Seguimiento, Informes y Datos.
  - La cabecera es compacta, con un indicador GPS que muestra la finca y la suerte detectadas.
- **Escritorio:** barra lateral con todas las secciones. El mapa ocupa el área principal y la ficha de la suerte va en un
  panel lateral.
- **Dentro de la App Maestra:** se oculta la cabecera propia.

## 4. GPS y GIS

Se distinguen cinco datos que nunca se mezclan:
1. Ubicación del dispositivo.
2. Suerte detectada.
3. Finca y suerte objeto del registro.
4. Ubicación de cada foto o hallazgo, con su procedencia.
5. Selección manual.

| Estado | Condición |
|---|---|
| Buscando | Primera lectura pendiente |
| Ubicación confiable | Dentro de un único polígono, precisión ≤ 25 m, sin rival a < 12 m, 3 lecturas seguidas |
| Ubicación aproximada | Precisión insuficiente, borde o varios polígonos; también mientras la geometría se está preparando |
| Fuera de suerte | Lecturas precisas fuera de los polígonos |
| Sin señal | Más de 30 s sin lecturas |
| Ubicación sin permiso | El navegador denegó el permiso |

Reglas de funcionamiento:
- **Batería:** `watchPosition` solo corre con la app visible; se detiene al ocultarla y se reanuda al volver. Si el permiso ya
  estaba concedido, se activa solo; la opción se puede desactivar en Datos.
- **Centroide:** el de una suerte nunca se usa como posición del técnico.
- **Cambios de lugar:**
  - Al pasar a otra suerte de la misma finca, se incorpora a la visita del día sin modificar los registros anteriores.
  - Con otra finca, el nuevo registro abre la visita de esa finca; la anterior no se cierra sola.
- **Mapa:** usa `shared/geo` (`createCasurMap`) con:
  - Etiquetas de número de suerte en la finca.
  - Suertes de la finca resaltadas y la suerte detectada en azul.
  - Posición y círculo de precisión.
  - Hallazgos georreferenciados.
  - Ficha de la suerte con «Registrar aquí» y «Agregar a la visita».
  - Satélite e híbrido con conexión; polígonos oficiales sin conexión.

## 5. Automatización agronómica

La ficha compacta toma del Maestro Central (MC01) los datos de la suerte a la **fecha de la visita**:
- Área, variedad, textura y riego original.
- Edad, ciclo (planta o soca) y corte.
- TCH de la zafra anterior y TCH estimado del aforo oficial, con zafras resueltas dinámicamente.
- Estado, destino, siembra, último corte y cosecha programada.

No se confunde el aforo oficial con el estimado propio del Estimador TCH.

**Etapa fenológica probable por edad.** Rangos preliminares para un ciclo de ~12 meses; el equipo agronómico de CASUR debe
validarlos:

| Ciclo | Germinación / brotación | Macollamiento | Gran crecimiento | Maduración probable |
|---|---|---|---|---|
| Planta | 0–35 d | 36–120 d | 121–270 d | > 270 d |
| Soca | 0–30 d | 31–100 d | 101–260 d | > 260 d |

- Se presenta como «probable por edad». El técnico puede corregirla, y se conservan el cálculo y la corrección.
- No se asigna etapa sin fecha agronómica o a suertes sin caña o dadas de baja.
- No determina madurez industrial.
- En secano depende de las lluvias: por eso es «probable».

## 6. Registro de hallazgos

- **Nivel 1:** finca y suerte, fecha y hora automáticas, GPS si existe, observación, fotos y recomendación. Todo es opcional
  salvo la categoría.
- **Nivel 2 — «Detalles técnicos»:** campos específicos por categoría, todos opcionales.

Catálogo de 20 categorías, con «Fertilización» en lugar de «Nutrición». Las favoritas y recientes aparecen primero y
«Más» muestra el resto.

Severidad:
- Se registra solo si el técnico la evalúa.
- La sugerida se muestra como ayuda y no se guarda.
- Una condición no evaluada no se interpreta como ausencia del problema.

## 7. Fotografías

**Originales:**
- Se guarda el original intacto, sin recomprimir, con su EXIF.
- Tiene identificador estable y SHA-256.
- La miniatura es un derivado regenerable.

**Ubicación.** La lectura GPS empieza **antes de abrir la cámara**; al volver se toma otra y se asocia la más cercana en
tiempo, hasta 2 min. La procedencia se indica siempre:

| Procedencia | Significado |
|---|---|
| `exif` | GPS escrito por la cámara en el archivo |
| `device-before` / `device-after` | Lectura del teléfono N s antes o después de la captura (no se afirma «al instante») |
| `none` | Sin ubicación verificable. Siempre es el caso de una foto de galería sin EXIF: nunca se le atribuye la ubicación actual del teléfono |

Una precisión desconocida se indica como tal; ya no aparece «±? m».

**Galería y exportación:**
- Galería con miniaturas.
- Visor a pantalla completa con deslizamiento, original o etiquetada, descarga y compartir nativo (WhatsApp) con
  alternativa de descarga.
- Cada foto se asocia a una suerte, un hallazgo, una recomendación o un seguimiento.

**Etiquetado propio (canvas):**
- Banda inferior compacta con:
  - Categoría.
  - Finca y suerte.
  - Fecha y hora, código, variedad y edad.
  - Coordenadas verificadas, técnico e ID.
  - Logo CASUR.
- Funciona con fotos horizontales y verticales.
- **Tarjeta de hallazgo** en PNG de 1080 px con vista previa antes de exportar.

## 8. Seguimiento, solicitudes y expediente (VC02)

- **Recomendaciones:** solo exigen el texto. Prioridad, responsable, fecha y observaciones son opcionales.
- **Solicitudes** de 12 tipos, con producto, cantidad y unidad, área, justificación y fecha requerida, todo opcional. **No**
  generan órdenes, despachos ni registros SIAGRI.
- **Estados con historial:** quién, cuándo y nota.
- **Evidencia de seguimiento:** fotos con rol propio, comparables con la evidencia inicial.
- **Visita de seguimiento** vinculada a la recomendación.
- **Compromisos vencidos** destacados.
- **Expediente del productor:**
  - Indicadores.
  - Problemas recurrentes.
  - Suertes con su última visita, hallazgos y fotos.
  - Seguimiento e historial de visitas.

## 9. Informes y exportaciones

- **Vista previa imprimible** (PDF del navegador) según el estándar editorial:
  - Informe de visita, con mapa vectorial, suertes, hallazgos con fotos, recomendaciones, solicitudes y compromisos.
  - Expediente del productor.
  - Consolidado por período.
- **Excel:** visitas, hallazgos, seguimiento y fotos. Escritor XLSX propio, sin dependencias.
- **GeoJSON:** hallazgos y fotos con procedencia.
- **ZIP:** respaldo (sección 10).

Sin campos vacíos, versiones internas ni valores inventados.

## 10. Estabilidad (bloque 1)

| Tema | Solución |
|---|---|
| `local-incompatible` del Maestro | Una generación local SIAGRI se adapta al contrato (`cronologicoFromReportRows`). Producción y los demás módulos leen **la misma** generación (aviso `local-reduced`: sin plan ni procedencia por celda). Solo un formato desconocido sigue siendo incompatible y se informa |
| Caché del Maestro en Visitas | Firma barata de la fuente efectiva (`currentSourceSignature`). Al volver a la app o al crear una visita, si cambió, se recarga; las visitas anteriores conservan su instantánea |
| Autoguardado | Escrituras serializadas cuyos errores se propagan. La marca de cambios pendientes se limpia **solo** tras confirmar la escritura. Hay una copia de emergencia síncrona (`localStorage`) que se recupera al volver. Si el guardado falla al navegar, se pregunta («Quedarme» conserva todo) |
| Concurrencia | `rev` por registro; una escritura con revisión vieja se rechaza (`CONFLICT`) y se recarga la versión vigente. `BroadcastChannel` avisa a las otras pestañas |
| Re-render durante la edición | Agregar fotos o terminar la lectura GPS solo vuelve a dibujar la galería; los formularios en edición no se tocan |
| Respaldos | Partes autosuficientes de uno o varios respaldos, en cualquier orden, sin duplicados. Conservan lo más reciente, informan partes faltantes y no pisan fotos con otro contenido (conflicto informado). Se rechazan archivos dañados. Restaurar de nuevo no duplica nada. Compatibles con respaldos de VC01 (se migran) |
| PWA independiente | Visitas instalada usa el control de actualización compartido (`installUpdateControl` con `scriptUrl`/`scope`): aviso, «Más tarde» y checkpoint. **Corrige un defecto de VC01:** una ventana de Visitas abierta no respondía a la coordinación del SW y bloqueaba la actualización de todas las ventanas |
| Primera apertura sin caché GIS | Se solicita `WARM_GEO` y se reintenta con espera creciente. El GPS no declara «fuera» mientras la geometría no está lista |
| Dependencia de TCH | Eliminada: el etiquetado es propio y el bundle `visitas` depende solo de `core` y `geo` |

La base local pasa a la versión 2, con el almacén `findings`. La migración desde VC01 ocurre en la misma transacción de
actualización.

## 11. QA

| Prueba | Resultado |
|---|---|
| `node --test tests/*.test.mjs` (incluye `visitas-logic`) | **180/180** |
| `tools/qa-visitas.cjs`: 7 escenarios, GPS, fotos, etiquetado, autoguardado con fallo, concurrencia, respaldos, offline, responsive 360/390/412/escritorio, App Maestra | **23/23** local · **23/23** preview HTTPS |
| `tools/qa-visitas-update.cjs`: actualización con Visitas independiente y App Maestra abiertas | **6/6** |
| `tools/qa-maestro-central.cjs` | **10/10** local · **10/10** preview |
| `tools/qa-produccion-publicada.cjs`: regresión de todos los módulos, PC y Android, offline | **18/18** |
| `tools/qa-update-162-170.cjs`: actualización real 1.6.2 → 1.7.0 | **PASS** |

Registros y capturas: `docs/evidencias-visitas-v11/`. Preview: https://pr-79.casur-maestro-ux-review.pages.dev/Negocios_de_Cana_CASUR_APP/modules/visitas/ (SHA `0511187`). Todas las pruebas usan datos sintéticos: fotos generadas con EXIF
ficticio, GPS simulado en las anclas oficiales de los polígonos y textos de prueba.

## 12. Limitaciones reales

- **Instalación diferenciada en Android:** no está confirmada en un teléfono. Chromium sin pantalla solo comprueba el
  manifiesto propio y que no haya errores de instalabilidad.
- **Cámara del sistema:** una PWA no puede leer el GPS en el instante del disparo. Se asocia la lectura más cercana, antes o
  después, y se dice cuál.
- **Fotos compartidas por mensajería:** algunos teléfonos eliminan el GPS del EXIF; esas fotos quedan «sin ubicación
  verificable».
- **Etapa fenológica:** los rangos son preliminares, pendientes de validación agronómica CASUR.
- **Detección GPS:** necesita lecturas continuas. Un teléfono quieto sigue entregándolas, pero el emulador no; las pruebas
  simulan pequeñas variaciones.
- **Sincronización con Supabase:** VC03, sin iniciar.
