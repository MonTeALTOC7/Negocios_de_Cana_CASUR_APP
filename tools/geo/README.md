# Pipeline geográfico CASUR

Este pipeline transforma el Shape oficial externo en la referencia geométrica
mínima que consume App Maestra. El ZIP/SHP original **no se copia ni se versiona**
en este repositorio.

## Contrato

- Fuente de identidad: `CodSuerte`, normalizada con `strip().upper()`.
- Fuente espacial: `Maestro_26_27_2472026_QGIS_SHP.zip` en EPSG:4326.
- Reparación: `shapely.make_valid()` únicamente para geometrías inválidas.
- Se conservan solo componentes `Polygon`; cada suerte se publica como
  `MultiPolygon`, sin `dissolve`, `unary_union` ni simplificación.
- Coordenadas redondeadas a seis decimales.
- Atributos publicados por feature: `lotId`, `fragmentCount` y `anchor`.
- `anchor` es un punto representativo interior del componente de mayor área,
  calculado sobre la geometría final redondeada y publicado a seis decimales.
- Orden de suertes y fragmentos determinístico; no se escriben timestamps.

La reparación se valida por geometría física antes de agrupar. El `MultiPolygon`
lógico puede conservar contactos o solapes entre fragmentos válidos y, por ello,
un validador OGC del agregado puede marcarlo como inválido. No se repara ni se
disuelve el agregado final: hacerlo fusionaría o repartiría fragmentos y rompería
el contrato de fidelidad de este Sprint.

El build actual se hizo con el SHA-256 de fuente:

`02636373feb1d3ab79ee0d83e028018c60e7798a5b09eec761297fd522d12170`

## Preparación

Desde la raíz del repositorio, en PowerShell:

```powershell
py -3.12 -m venv .venv-geo
.\.venv-geo\Scripts\python.exe -m pip install -r tools\geo\requirements.txt
```

La carpeta del entorno es local y no debe incluirse en Git.

## Build

```powershell
$source = 'C:\ruta\externa\Maestro_26_27_2472026_QGIS_SHP.zip'
.\.venv-geo\Scripts\python.exe tools\geo\build-casur-geometry.py `
  --source $source `
  --output shared\geo\data `
  --data-version 2026-07-24-maestro-26-27-r2 `
  --expected-source-sha256 02636373feb1d3ab79ee0d83e028018c60e7798a5b09eec761297fd522d12170
```

El comando publica `manifest.json` y cuatro GeoJSON por zona. El informe JSON
impreso incluye los SHA-256 y tamaños de las salidas.

## Validación

La suite siempre valida el contrato de los archivos publicados. Si se define
`CASUR_GEO_SOURCE`, además reconstruye dos veces en directorios temporales y
compara byte por byte contra la publicación:

```powershell
$env:CASUR_GEO_SOURCE = $source
$env:PYTHONDONTWRITEBYTECODE = '1'
.\.venv-geo\Scripts\python.exe -m unittest discover -s tools\geo\tests -v
```

Actualizar la fuente exige revisar primero el crosswalk contra los Maestros,
elegir un nuevo `dataVersion`, regenerar, validar y revisar el diff de GeoJSON.
