# REGLAS DE NEGOCIO — Control y Seguimiento de Insumos CASUR

## 1. Agrupación de eventos

**Documento como clave primaria.** El campo `Documento` (col 20 de REPORTE) identifica la reserva/transacción en SIAGRI.

Un evento se define como la combinación:
```
event_key = Documento + Hacienda + Suerte + Labor
```

Múltiples filas con el mismo event_key son **productos de una mezcla** aplicada o reservada para la misma área.

### Regla de área en mezclas
- El área se repite en cada fila del producto dentro del mismo Documento.
- **NO** se suman las áreas entre productos.
- **NO** se dividen las áreas entre productos.
- Área del evento = área de la primera fila = área de cada fila (son idénticas).
- Área cubierta por producto = misma área del evento.
- Área-producto = suma de área cubierta por todos los productos (indicador técnico, NO superficie física).

**Ejemplo real:**
- Documento 52587, Hac 15, Sue 01, Labor CMC
- 4 productos, cada uno con área 4.78 ha
- Área del evento: 4.78 ha ✓
- Área-producto: 19.12 ha (indicador técnico) ✓
- Superficie física: 4.78 ha ✓ (NUNCA 19.12 ha)

## 2. Identificador de suertes

### Llave visible: `hac_sue`
Concatenación sin separador: `993` + `24A` = `99324A`

### Llave interna: `hac_sue_key`
Con separador pipe: `993|24A`

### Normalización
- Eliminar espacios, `.0` de Excel.
- Preservar letras en suertes (24A, 01B).
- Mayúsculas.
- Sin ceros no significativos para haciendas.

## 3. Motor de estados

| Estado | Regla |
|--------|-------|
| **SUSPENDIDA** | `Suspendida? = 1` Y `Ejecutado? ≠ SI` |
| **INCONSISTENTE** | `Suspendida? = 1` Y `Ejecutado? = SI` |
| **EJECUTADA** | `Suspendida? = 0` Y `Ejecutado? = SI` |
| **RESERVADA** | `Suspendida? = 0` Y `Con Reserva? = SI` Y `Ejecutado? = NO` |
| **SIN CLASIFICAR** | Ninguna condición anterior |

### Alertas
- `SUSPENDIDA_CON_EJECUCION`: Suspendida pero marcada como ejecutada.
- `FECHA_EJECUCION_ANTERIOR_A_RESERVA`: Fecha de ejecución < Fecha inicio.
- `AREA_INCONSISTENTE_EN_MEZCLA`: Productos con áreas distintas en el mismo evento.

## 4. Indicadores de área

| Indicador | Definición | ¿Sumar entre suertes? |
|-----------|------------|----------------------|
| Área reservada | Área de eventos RESERVADOS | Sí |
| Área ejecutada | Área de eventos EJECUTADOS | Sí |
| Hectáreas-evento | Suma del área de cada evento (no-suspendidos). Una suerte puede contar varias veces. | Sí |
| Área física atendida | Área del Maestro de cada `hac_sue_key` con al menos un evento EJECUTADO. Se suma una sola vez por suerte. | Sí |
| Área cubierta por producto | Área del evento donde participa el producto | NO sumar entre productos |
| Área-producto | Suma técnica de área cubierta × productos | Indicador técnico separado |

**"Área beneficiada"** solo se usa cuando hay evidencia de ejecución.

## 5. Unidades de medida

No se suman cantidades de unidades incompatibles.

| Variante | Normalización |
|----------|---------------|
| LT, L, LTS, LITROS | LT |
| KG, KGS | KG |
| GR, G | GR |
| SACO, SACOS, SC | SACO |
| UND, UNIDAD | UND |
| GAL, GALON | GAL |
| HA | HA |

En este reporte, `Unidad de Medida` es siempre `HA` (las cantidades de producto se derivan de dosis × área).

## 6. Exclusiones

### Sucuya (código 16)
Excluida permanentemente de:
- Indicadores, tablas, búsquedas, exportaciones
- Maestro procesado, JSON publicados
- Resúmenes, validaciones

Se registra el número de filas excluidas en cada actualización.

## 7. Alcance predeterminado

- **Vista principal**: Zona 5 – Productores
- **Otras zonas**: Sur (1), Centro (2), Norte (3) disponibles en selector
- La selección de otras zonas no contamina los KPI de Productores

## 8. Fechas con errores

Se encontraron 4 registros con año `0206` en vez de `2026`.
Corrección automática: `año + 1820`.

## 9. Privacidad

Se revisaron los datos del Excel SIAGRI y Maestro:
- No se encontraron cédulas, teléfonos, direcciones, correos ni datos bancarios.
- Los JSON públicos contienen: razón social, hacienda, suerte, producto, cantidades operativas.
- No se publica información personal identificable innecesaria.

## 10. Actualizaciones incrementales

- `event_id` basado en el orden de procesamiento (E000001, E000002...).
- Recargar el mismo archivo no duplica datos: los eventos se agrupan por `Documento + Hacienda + Suerte + Labor`.
- Para comparación con versión anterior: se usa `metadata.json` con hash y versión.
