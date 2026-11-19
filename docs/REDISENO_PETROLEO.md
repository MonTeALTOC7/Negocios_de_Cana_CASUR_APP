# Rediseño «Petróleo · Pizarra»

Sistema visual único para la App Maestra y todos sus módulos: azul petróleo,
pizarra, gris y blanco. Tema claro; el cromo de navegación usa petróleo oscuro.
Este cambio es **solo de diseño y navegación**: no modifica datos, motores de
cálculo, importadores, Service Worker ni almacenamiento.

## Qué cambió

| Área | Archivos | Cambio |
|---|---|---|
| Tokens | `shared/styles/tokens.css` | Paleta, tipografía Inter local, radios, sombras y espaciado |
| Shell | `shared/styles/app.css`, `index.html`, `app.js` | Tema claro, barra lateral en escritorio, Inicio agrupado, ruta en la barra de módulo |
| Registro | `core/module-registry/registry.js` | Campo `surface` (`campo` / `gestion`) y `homeGroups()` |
| Módulos | CSS de cada módulo | Recoloreado automático con `tools/retheme-petroleo.mjs` |
| Capa común | `shared/styles/module-theme.css` | Inter local, foco visible, cifras tabulares, movimiento reducido, modo embebido |
| Tipografía | `shared/assets/fonts/` | Inter variable (SIL OFL 1.1), 48 KB, sin red |

## Navegación

- **Escritorio (≥ 1024 px):** barra lateral fija con Inicio, los módulos agrupados
  («Trabajo de campo» y «Gestión y seguimiento») y Centro Maestro. Se puede
  contraer a iconos; la preferencia se recuerda. Con un módulo abierto, el cambio
  pasa por el mismo *checkpoint* que el selector: no se pierde trabajo pendiente.
- **Teléfono y tableta:** barra superior con regreso, selector de módulo
  (*bottom sheet*) y recarga. Inicio conserva la navegación inferior.
- **Modo embebido:** dentro del shell, Estimador TCH e Insumos ocultan en teléfono
  su cabecera de marca (duplicaba el nombre que ya muestra el shell). Abiertos por
  separado no cambian.
- El área privada sigue sin aparecer en la navegación.

## Herramienta de migración de color

```
node tools/retheme-petroleo.mjs --check   # informa, no escribe
node tools/retheme-petroleo.mjs           # aplica (idempotente)
node tools/runtime-assets.mjs --write     # regenera el manifiesto de la versión
```

Reglas: verdes y azules → petróleo; grises → pizarra; fondos claros → gris
azulado; rojos, ámbar y dorado se conservan como colores de estado; fuentes sans →
Inter; radios de 15–59 px → 12 px. Solo procesa CSS y bloques `<style>`.
**No toca JavaScript**: gráficos, mapas e imágenes exportadas conservan sus
colores de datos. Al integrar una versión nueva de un módulo, volver a ejecutarla.

## Pruebas

- `tests/` (raíz): mismo resultado que antes del rediseño.
- `modules/produccion/tests/`: se actualizaron los colores esperados del informe
  gerencial (`managerial-presentation.test.mjs`) y la prueba «byte a byte» de
  `maestro-ux.test.mjs`, que ahora exige que `index.html` sea exactamente el
  original más la migración de tema.

## Pendiente (no incluido)

- Versión de la app: no se incrementó `APP_VERSION`; hacerlo al liberar, según
  `docs/VERSIONADO_Y_ACTUALIZACIONES.md`.
- Iconos de la PWA y logotipos de módulo: se conservan los actuales.
- Colores definidos en JavaScript (gráficos e imágenes exportadas).
