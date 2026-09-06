# ANÁLISIS DE DATOS — Insumos CASUR

## Archivo SIAGRI: `registro_de_programacion_de_labores_21-agosto_2026.xlsx`

### Hojas encontradas
| Hoja | Filas | Uso |
|------|-------|-----|
| TD | 29 | Tabla dinámica resumida — no usada |
| REPORTE (2) | 548 | Solo Zona 5 Productores, formato alternativo — no usada (datos ya en REPORTE) |
| **REPORTE** | **9,877** | **Fuente principal — todas las zonas** |

### Mapeo de columnas — Hoja REPORTE

| Col | Columna original | Campo normalizado | Tipo | Uso | Validación |
|-----|-----------------|-------------------|------|-----|------------|
| 0 | Ejercicio | ejercicio | Texto | Año fiscal | `2026` |
| 1 | Semana | semana | Entero | Semana del año | 1-53 |
| 2 | Fecha Inicio | fecha_inicio | Fecha | Fecha de reserva/programación | `YYYY-MM-DD` |
| 3 | Fecha Final | fecha_final | Fecha | Fecha final de la semana | `YYYY-MM-DD` |
| 4 | LABOR | labor | Texto | Código de labor | 3-4 caracteres |
| 5 | Nombre Labor | labor_nombre | Texto | Descripción de la labor | — |
| 6 | Unidad de Medida | unidad_medida | Texto | Siempre `HA` en este reporte | Normalizar variantes |
| 7 | Unidades | area | Decimal | **Área en hectáreas del evento** | >0, comparar con Maestro |
| 8 | Hacienda | hacienda | Texto | Código numérico de hacienda | Limpiar `.0` de Excel |
| 9 | Nombre Hacienda | productor | Texto | Nombre del productor/razón social | — |
| 10 | Zona | zona | Texto | Código de zona | 1,2,3,5 |
| 11 | Nombre Zona | zona_nombre | Texto | Nombre de la zona | Sur, Centro, Norte, Productores |
| 12 | Suerte | suerte | Texto | Código de suerte (puede incluir letras) | Preservar letras, normalizar |
| 13 | Producto | producto_codigo | Texto | Código SAP del producto | — |
| 14 | Desc. Producto | producto_desc | Texto | Nombre comercial del producto | — |
| 15 | Dosis | dosis | Decimal | Dosis por hectárea | ≥0 |
| 16 | Cantidad | cantidad | Decimal | Cantidad total del producto | ≥0 |
| 17 | Usuario | usuario | Texto | Código de usuario SIAGRI | — |
| 18 | Fecha ejecuccion | fecha_ejecucion | Fecha | Fecha de ejecución en campo | Fix años `0206`→`2026` |
| 19 | Suspendida? (0=No) | suspendida | Booleano | 0=No, 1=Sí | — |
| 20 | Documento | documento | Entero | Número de documento/reserva SIAGRI | Clave de agrupación |
| 21 | Bodega | bodega | Texto | Código de bodega | — |
| 22 | Nombre Bodega | bodega_nombre | Texto | Nombre de la bodega | — |
| 23 | Con Reserva? | con_reserva | Texto | SI/NO | — |
| 24 | Ejecutado? | ejecutado | Texto | SI/NO | — |

### Fechas con error de tipeo
4 registros con año `0206` en lugar de `2026`. Corregidos automáticamente.

### Zonas encontradas
| Código | Nombre | Filas |
|--------|--------|-------|
| 1 | Sur | 3,216 |
| 2 | Centro | 2,912 |
| 3 | Norte | 3,160 |
| 5 | Productores | 588 |

Sucuya (código 16): **0 filas** encontradas en este reporte.

### Labores encontradas (15)
AAM, AIN, APZ, CAP, CMC, CMM, CQM, CQP, FCC, FFM, FRR, FTS, MAN, MEC, VIP

### Productores Zona 5 (24 distintos)
Alfonzo Rivas, Alfredo José Siezar Morales, CRISTIAN VALERIA CASTRO JIMENEZ, Claudio Alberto Reyes Ruiz, Eddy Obregón Pérez, Edgard Holman, Eduardo Castillo Martinez, Eduardo José Betanco Pérez, El Garabato, Emperatríz Alemán de Pérez, FRANCISCO ESPINOZA BALTODANO, Franklin Maleaños Urtecho, Freddy Sovalvarro, Johanna Azucena Hurtado Canda, José Andrés Pérez Alemán, Juan Carlos Aviles, Leyla Román de Arguello, Misael Villarreal Navarrete, NORMA LUICIA CASTRO JIMENEZ, Nydia Betanco Pérez, Pansaco, Rolando Chavarria, Salvador Marenco Castillo, Veronica de Los Angees Mendez Alvarado

---

## Archivo Maestro: `Cronologico_Maestro_CASUR_2026-08-22__1_.xlsx`

### Hojas
| Hoja | Filas | Uso |
|------|-------|-----|
| REPORTE | 1,054 | Maestro completo todas las zonas |
| Productores | 263 | Solo Zona 5 Productores |

### Columnas del Maestro
| Col | Columna | Tipo | Uso |
|-----|---------|------|-----|
| 0 | Hac-Sue | Texto | Llave visible |
| 1 | Cod | Texto | Código hacienda |
| 2 | Hacienda | Texto | Nombre hacienda/productor |
| 3 | Suerte | Texto | Código suerte |
| 4 | Area | Decimal | Área en hectáreas |
| 5 | Variedad | Texto | Variedad de caña |
| 6 | Edad | Decimal | Edad de la plantación |
| 7 | TCH_Z2526 | Decimal | TCH zafra 25-26 |
| 12 | Textura | Texto | Textura del suelo |
| 13 | F. Ult. Cte | Fecha | Fecha último corte |
| 14 | F. Siembra | Fecha | Fecha de siembra |
| 18 | Destino | Texto | Destino (Molienda, Semilla, etc.) |
| 19 | Tenencia | Texto | Tipo de tenencia |
| 20 | Tipo_de_Riego | Texto | Tipo de riego |
| 23 | ZONA | Texto | Zona con formato "5-Productores" |
| 24 | Estado | Texto | Estado del registro en el Maestro |

### Deduplicación
Se priorizan los datos de la hoja `Productores` para zona 5 cuando hay duplicados por llave `hac_sue_key`.

Maestro final: **1,053 suertes** (deduplicadas, excluyendo Sucuya).
