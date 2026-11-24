# Estándar institucional de fechas — App Maestra CASUR

Regla transversal para todos los módulos de la App Maestra. Registrada en el PR #71, con el formateador de Producción V1.8.3.

## Formato visible

`DD-MMM-AAAA`. Ejemplo: **12-Oct-2026**.

- Día: dos dígitos (`01`–`31`).
- Mes: abreviatura con inicial mayúscula, sin punto: `Ene`, `Feb`, `Mar`, `Abr`, `May`, `Jun`, `Jul`, `Ago`, `Sep`, `Oct`, `Nov`, `Dic`.
- Año: cuatro dígitos.
- Si se muestra la hora, va después de ` · `. Ejemplo: `23-Nov-2026 · 12:38 p. m.`.

Se aplica en módulos, KPI, tablas, fichas, informes y exportaciones (PDF, PNG y HTML). No se muestran `dd/mm/aaaa`, ISO (`2026-10-12`) ni meses en minúscula.

## Datos internos

En los datos, el almacenamiento y las comparaciones se usa ISO `AAAA-MM-DD`. La conversión ocurre solo en la capa de presentación. Los identificadores técnicos no se reformatean; por ejemplo, `2026.11.22-aforo.1102`.

## Implementación única

- Producción: `formatCronoDate`, en `modules/produccion/js/casur-enhancements.js`, expuesto como `window.CASUR_CRONO_PARTICIPATION.formatDate`.
- Cabecera de Producción: `modules/produccion/js/effective-data-date.js`, con la misma lista de meses.
- No se crean formateadores paralelos. Un módulo nuevo debe reutilizar o portar este contrato y sus pruebas.

## Fechas que no deben confundirse (Plan Z26/27)

| Concepto | Fecha | Campo |
|---|---|---|
| Aforo oficial Z26/27 | 12-Oct-2026 | `source.sourceDate`, `tchEst2627EffectiveDate` |
| Consolidación del plan y ajustes | 22-Nov-2026 | `generated`, `importedAt`, versión `2026.11.22-aforo.1102` |
| Fecha para cosecha 26/27 | BE por suerte | plan |
| Tipo de corte | BF por suerte | plan |
| Generación de una exportación | fecha de consulta | `Consulta:` / `Generado` |

## Pendiente fuera del alcance de Producción

El módulo TCH (`modules/tch/js/app.js`, `result-image.js` y `visit-evidence.js`) conserva meses en minúscula. Su estandarización se registra como mantenimiento independiente y no forma parte del PR #71.
