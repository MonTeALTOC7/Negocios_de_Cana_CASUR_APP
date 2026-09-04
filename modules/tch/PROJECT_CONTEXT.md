# PROJECT CONTEXT — Estimador TCH CASUR

## Estado actual

Versión de trabajo: **v2.7.2**.

Versión: **2.7.2**
Destino normal: repositorio existente `MonTeALTOC7/Estimado_TCH_APP_CT`.
Publicación: GitHub Pages / Android PWA.

## Regla máxima

Conservar lo que funciona y modificar únicamente lo necesario. La instrucción más reciente del usuario prevalece.

## Maestro General

Fuente oficial de actualización: hoja `REPORTE`.

Universo operativo validado:
- La distribución por zona se toma del cronológico oficial vigente.
- 5-Productores: 262
- Total: 1,053 suertes
- Área: 10,030.65 ha

Zona 0 / Sucuya se excluye completamente.

Tenencia:
- CA = Arriendo
- CV = Compra Venta
- PR = Propio

Zona 5 Productores sigue siendo prioridad de presentación, pero no existe filtro obligatorio por zona. El buscador debe encontrar cualquier suerte operativa.

## Biometría

Flujo:
1. Selección de suerte.
2. Medición por puntos.
3. Cálculo/proyección.
4. Guardado/exportación.

Inicia con P01. Se agregan puntos libremente. No existe selector 3/5/10.

Fórmula:
`TCHe = D²(mm) × H(m) × POB(tallos/m) × 0.007854 / DistSurco(m)`.

El TCH proyectado por biometría siempre es el resultado principal.

Pesaje por tallo:
- opcional;
- desactivado por defecto y activable manualmente cuando el técnico decida pesar;
- captura número de tallos + peso total;
- calcula peso promedio y TCHpeso;
- funciona únicamente como contraste;
- no se promedia automáticamente con TCHe.

## Compatibilidad

No borrar IndexedDB. Stores actuales:
`master`, `biometries`, `weighings`, `harvests`, `visits`, `audit`, `settings`.

## TCH estimado 26/27

- Fuente auditada: `Productores_V3`, columna `TCH_Est_170726`.
- Vinculación canónica: `CodHacienda + Suerte normalizada`.
- 262 filas vinculadas; 245 con TCH y 17 vacías en la fuente.
- Fecha real de emisión del estimado: 17-jul-2026. La actualización del cronológico al 24-ago-2026 no modifica esta fecha.
- Toda actualización del estimado exige una fecha declarada por el usuario; una contradicción con la fecha detectada bloquea la aplicación.
- La actualización es protegida, independiente y solo modifica la referencia 26/27.

## Visitas de campo v2.7.2

- Módulo principal independiente de la biometría.
- Requiere suerte, técnico, al menos una fotografía y GPS para guardar evidencia georreferenciada; no existe máximo artificial de fotos.
- El TCH es opcional y su fuente se registra explícitamente.
- Guardar no descarga ZIP. El historial permite descargar/compartir cada PNG y descargar el original.
- El ZIP se reserva para exportación masiva filtrada o seleccionada.
- Las nuevas fotografías se optimizan y guardan como Blob; Base64 legado continúa legible.
- El PNG mantiene la fotografía intacta y agrega un panel externo dinámico sin campos vacíos.
- Los campos categóricos permiten `Sin registrar`, opciones predefinidas y valor personalizado.
- Una visita guardada se puede editar completa y sus PNG se regeneran sin duplicar el registro.
- `Biometría de la app` permite elegir un registro existente o iniciar una nueva biometría vinculada.
- Los filtros y exportaciones masivas permanecen contraídos hasta que el usuario los necesite.

## Consulta operativa

El acceso inferior `Consulta` reemplaza el antiguo consolidado de estimados y avance. Permite buscar cualquier suerte y revisar su ficha cronológica, TCH ESTIMADO Z26/27, biometrías y visitas vinculadas.
Las biometrías se visualizan en Consulta e Historial y pueden reabrirse para corregir puntos y recalcular el mismo registro.

Los campos legacy `lengthCm` y `diameterCm` siguen siendo legibles. Los pesajes antiguos del store `weighings` permanecen disponibles.

## Entrega

Después de cambios, entregar ZIP completo. No publicar a GitHub sin aprobación explícita.

## Ajustes v2.4.1
- Guía de biometría compacta y visual, sin fórmula fija ocupando Inicio.
- Jerarquía de color CASUR/navy en ficha de suerte.
- Surcos rápidos: 1.50, 1.65, 1.75, 1.80, 2.20; otros mediante edición.
- Tramos rápidos: 3, 5, 10 m; otros mediante edición.
- Pesaje opcional libre, siempre inicia en No y solo aparece al seleccionar Sí.
- `Edad de referencia para proyección` sustituye el concepto de `edad objetivo de cosecha`.
