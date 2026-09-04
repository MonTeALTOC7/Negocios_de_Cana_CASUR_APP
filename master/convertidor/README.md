# Administrador del Cronológico Maestro CASUR

PWA local v1.1.0 para convertir el Excel original de SIAGRI y, opcionalmente, un estimado de producción Z26/27 en un Cronológico Maestro CASUR validado. Incorpora lectura agronómica, drill-down de indicadores, área por zona y comparación contra un cronológico anterior. El procesamiento se realiza dentro del navegador: no usa backend, Supabase, login ni envío de archivos a servidores.

## Abrir localmente

La forma recomendada es servir la carpeta con un servidor local, porque la instalación PWA y el modo offline no funcionan desde `file://`.

1. Abre PowerShell dentro de esta carpeta.
2. Ejecuta `python -m http.server 8080`.
3. Abre `http://localhost:8080/` en Chrome, Edge o Android.

Para una revisión rápida también se puede abrir `index.html` con doble clic. La carga y exportación de Excel funcionarán, pero el service worker no podrá instalarse.

## Probar

1. Abre `tests.html`; los casos sintéticos se ejecutan automáticamente.
2. En la aplicación, entra a **Importar**.
3. Carga el cronológico SIAGRI en la tarjeta obligatoria.
4. Confirma la hoja detectada y los conteos de Auditoría.
5. Opcionalmente, carga el estimado y revisa la cobertura detectada.
6. Opcionalmente, carga un **Cronológico anterior** para detectar altas, retiros y modificaciones.
7. Revisa **Auditoría**, **Comparativo**, **Validación de suertes** y **Vista Maestro**.

## Instalar la PWA

1. Abre la aplicación desde `localhost`, HTTPS o GitHub Pages.
2. Usa el botón **Instalar PWA** cuando aparezca, o el menú del navegador → **Instalar aplicación** / **Agregar a pantalla de inicio**.
3. Después de una primera carga correcta, la aplicación puede abrir sin internet.

Los archivos `.json` solicitados por la aplicación usan estrategia **network first** con respaldo en caché. Así se evita conservar indefinidamente una versión antigua del maestro.

## Generar el Excel Maestro

1. Carga SIAGRI; el estimado es opcional.
2. Revisa las alertas y decisiones manuales.
3. Abre **Exportar** y pulsa **Generar Excel**.

El archivo se llama `Cronologico_Maestro_CASUR_YYYY-MM-DD.xlsx` e incluye exactamente dos hojas:

- `REPORTE`: todo CASUR válido, excepto Sucuya.
- `Productores`: únicamente `ZONA = 5-Productores`.

Incluye filtros, encabezado congelado, anchos definidos, fechas reales con formato `dd-mmm-yyyy`, identificadores como texto y las columnas `Estado` y `Observación` al final de la estructura principal.

La columna `Edad` contiene una fórmula Excel basada en `TODAY()` para actualizarse al abrir o recalcular el libro. En renovación (`R`, `RE`, `REN`, `RENOVACION` o `RENOVACIÓN`) usa únicamente `F. Siembra`; si esa fecha falta, deja la edad vacía. En los demás casos utiliza la fecha más reciente entre `F. Ult. Cte` y `F. Siembra`.

`Tipo_de_Riego` se toma del encabezado descriptivo (`TipoRiego` o `Tipo_de_Riego`) y nunca de `CodTipoRiego` cuando ambas columnas existen.

## Generar el JSON Maestro

En **Exportar**, pulsa **Generar JSON**. Se descargará `cronologico_master.json` con:

- `schemaVersion`, versión y fecha de generación;
- archivos y hojas fuente;
- nombre real del campo TCH detectado;
- cobertura real del estimado;
- auditoría y conteos;
- registros normalizados, estados, observaciones y trazabilidad de áreas.

## Actualizar datos posteriormente

No es necesario sustituir archivos dentro de esta carpeta. Cada vez que exista un SIAGRI o estimado más reciente, se carga desde la pantalla **Importar**. La aplicación detecta encabezados y hojas; no depende de nombres fijos.

Si una aplicación interna consume un JSON publicado, sustituye manualmente el archivo correspondiente dentro de `data/` y vuelve a publicar. El service worker intentará obtener primero la versión de red.

## Publicar manualmente en GitHub Pages

1. Crea o elige el repositorio que desees.
2. Sube **el contenido** de esta carpeta a la rama/carpeta publicada.
3. Activa GitHub Pages en la configuración del repositorio.
4. No cambies las rutas relativas (`./`), pues permiten publicar en un subdirectorio.

Este paquete no crea repositorios, commits ni push automáticamente.

## Reglas principales

- SIAGRI es obligatorio; el estimado es opcional.
- Sucuya (`Cod. Hacienda = 16`) se excluye siempre. No se excluye Maquila por una regla heredada.
- `Hac-Sue = Cod + Suerte`, siempre reconstruido como texto y sin relleno artificial.
- `Cod`, `Suerte` y `Hac-Sue` permanecen como texto.
- La edad se calcula con la fecha del dispositivo y nunca usa la edad original de SIAGRI.
- El Excel exportado conserva el mismo criterio mediante una fórmula dinámica con `TODAY()`.
- En renovación sin `F. Siembra`, la edad queda vacía y el estado es `Renovación pendiente`.
- Un destino que contiene `SEMILLA` no requiere TCH ni toneladas.
- TCH o área vacíos permanecen vacíos; no se convierten en cero.
- La suerte `99347A` queda como baja definitiva, sin producción y conservada para auditoría.
- Las decisiones manuales se guardan localmente en el navegador y pueden revisarse antes de exportar.
- Las hojas se detectan por compatibilidad de encabezados y pueden cambiarse manualmente.
- Las tarjetas KPI de Inicio y Auditoría abren el detalle correspondiente (drill-down).
- El análisis por zona concilia área, suertes, haciendas, edad ponderada, TCH y alertas.
- La lectura agronómica señala edad mayor de 18 meses, cepas con 5 o más cortes, caída estimada de TCH ≥15%, riego incompleto, diferencias de área y variedad faltante. Son focos para revisión técnica; no eliminan registros automáticamente.
- El comparativo anterior/actual usa `Hac-Sue` como llave y revisa área, variedad, corte, fechas, destino, tenencia, riego, número de riegos, zona y TCH previo.

## Estructura

```text
index.html
css/
js/
  vendor/
data/
assets/
icons/
manifest.json
service-worker.js
tests.html
README.md
```

## Privacidad

Los Excel se leen en memoria y las salidas se generan en el dispositivo. La aplicación no tiene telemetría propia ni servicios remotos. Las bibliotecas de Excel están incluidas localmente para que el procesamiento continúe sin internet.
