# Control y Seguimiento de Insumos · CASUR

PWA (Progressive Web App) estática para el control y análisis de insumos entregados a
productores de caña. **Negocios de Caña — CASUR**. Firma técnica CT.

Procesa datos SIAGRI (Excel) y los presenta en módulos ejecutivos con drill-down,
validaciones reparables y un módulo independiente de madurante aéreo.

---

## Arquitectura

App **multi-archivo** estática (sin build, sin servidor), apta para GitHub Pages:

```
index.html      → estructura + sistema de diseño (CSS)
app.js          → toda la lógica (estado, KPIs, render, drill-down, admin)
sw.js           → service worker (offline + caché de SheetJS)
manifest.webmanifest
data/
  bootstrap.json  → datos procesados (eventos, productos, maestro, validaciones)
  metadata.json   → versión y totales
scripts/
  procesar_siagri.py → pipeline oficial Excel → JSON
icons/, logo-casur.png, favicon.svg
```

Librería externa: **SheetJS 0.18.5** (vía CDN cloudflare) — solo para el procesamiento
de Excel en el módulo Admin. Se cachea para uso offline.

---

## Módulos

| Módulo | Contenido |
|---|---|
| **Resumen** | KPIs ejecutivos clicables (drill-down), total de insumos entregados, avance de ejecución, principales insumos y hectáreas-evento por labor. |
| **Explorar** | Tabla de eventos con filtros (productor, labor, estado, búsqueda) y expansión de productos por evento. |
| **Insumos** | Total entregado y desglose por producto (cantidad, ha-producto, eventos). |
| **Productores** | Tarjetas por productor con detalle expandible: suertes, eventos, ha física, insumo total y tabla de insumos por producto. Filtros por productor y hacienda. |
| **Madurante** | Módulo **independiente** de aplicación aérea de madurante (AAM). No se cobra a productores y **no suma** en las estadísticas de insumos. |
| **Admin** | Validaciones reparables + carga de Excel SIAGRI (y Maestro opcional) procesado en el dispositivo. Clave: `151021`. |

### Reglas de negocio clave

- **Madurante aéreo (labor `AAM`)** se excluye de todas las estadísticas de insumos y
  vive en su propio módulo. No facturable.
- **Insumos entregados** = suma de `cantidad` por producto en eventos no-madurante.
- **Hectáreas-evento** = carga operativa (suma áreas de eventos; una suerte con varios
  eventos suma varias veces).
- **Superficie física** = suma del área de Maestro de las suertes únicas ejecutadas (sin duplicar).
- **Área NO se reparte entre productos**: cada producto de una mezcla cubre el área completa
  del evento. La "ha-producto" es superficie técnica acumulada, no física.
- Se excluye Sucuya (código 16).

---

## Actualizar datos (2 vías)

### A) Desde la app (Admin) — recomendado para el día a día
1. Abre **Admin** e ingresa la clave.
2. Arrastra el Excel SIAGRI (*registro de programación de labores*). Opcional: el
   Cronológico Maestro.
3. Revisa los totales y pulsa **Aplicar actualización**.
4. Descarga `bootstrap.json` y súbelo a `data/` del repositorio para que quede permanente
   para todos los usuarios.

### B) Pipeline Python (para regenerar todo)
```bash
pip install openpyxl
python3 scripts/procesar_siagri.py \
  --reporte "registro_de_programacion_de_labores.xlsx" \
  --maestro "Cronologico_Maestro_CASUR.xlsx" \
  --output "./data/"
```

Ambas vías producen el mismo esquema: `meta, events, products, maestro, validaciones`,
con los campos `es_madurante_aereo` / `es_aereo` por evento y producto.

---

## Validaciones y reparación

El módulo Admin y el KPI de alertas detectan:

- `SUERTE_SIN_MAESTRO` — suerte sin registro en el Maestro.
- `AREA_MAYOR_MAESTRO` — área del evento mayor a la del Maestro (+5%). **Reparable**:
  aplica un override del área de Maestro que resuelve la alerta.
- `FECHA_EJECUCION_ANTERIOR_A_RESERVA` — inconsistencia de fechas.
- `SUSPENDIDA_CON_EJECUCION`, `AREA_INCONSISTENTE_EN_MEZCLA`.

Cada alerta puede marcarse **revisada** o **resuelta**; las decisiones se guardan en el
dispositivo (IndexedDB).

---

## Despliegue (GitHub Pages)

1. Sube todo el contenido a la raíz del repositorio (incluye `.nojekyll`).
2. Activa Pages sobre la rama principal.
3. La app funciona offline tras la primera carga.

---

CASUR · Negocios de Caña · v2
