# Conciliación de zona: finca 2 · San Jerónimo (UX14-C)

Análisis del 26-Nov-2026. **No se modificaron datos ni se reasignaron fincas.** La reclasificación queda sujeta a una decisión del propietario.

## 1. Registros, fuente, vigencia y criterio

| Registro | Fuente | Vigencia | Unidad clasificada | Clasificación de la finca 2 |
|---|---|---|---|---|
| Aforo, columna 27 «ZONA» (`provenance.zone`) | `AFORO_26-27` (`Productores _Servicios_Z2627.xlsx`) | Z26/27 · aforo 12-Oct-2026 | **Suerte** | 82 suertes en `2-Centro`; **16 en `1-Sur`**: 270–283, 282A y 283A |
| Histórico por lote (`lotCompact`, campo zona del lote) | `Historico_for_html.xlsx` (V16 Ejecutiva LITE) | Z16/17–Z25/26 | **Lote**, igual en todas sus zafras | 93 lotes en `2-ZONA CENTRO`; **14 en `1-ZONA SUR`**: 270–283 |
| Motor oficial de zonas (`mainEntities` / `zoneAnalysis`, campo `zona` de la entidad) | `Historico_for_html.xlsx`, entidades por finca | Z16/17–Z25/26 | **Finca**: una sola zona, la dominante | Toda la finca en `2-ZONA CENTRO` |

**Conclusión.** No hay contradicción de datos: cada fuente clasifica una unidad distinta. El aforo y el Histórico por lote coinciden: los lotes 270–283 están en la zona Sur, y el aforo agrega 282A y 283A, que no existen en el Histórico. El motor oficial de zonas agrega por finca y asigna San Jerónimo completo a la Zona Centro.

Es la única finca de este tipo con efecto en Z25/26. Otras cuatro fincas (157, 145, 14 y 33) tienen lotes registrados en otra zona, pero sin cosecha en Z25/26; su efecto se limita a zafras anteriores.

## 2. Impacto por zona (Histórico, sin Maquila)

| Zafra | Zona | Oficial (finca → zona) | Por lote | Diferencia |
|---|---|---|---|---|
| Z23/24 | 1-ZONA SUR | 1,858.91 ha · 159,195.04 t · **85.64** | 2,047.70 ha · 178,368.73 t · **87.11** | +188.79 ha · +19,173.69 t · **+1.47 TCH** |
| Z23/24 | 2-ZONA CENTRO | 2,723.84 ha · 211,329.19 t · **77.59** | 2,535.05 ha · 192,155.50 t · **75.80** | −188.79 ha · −19,173.69 t · **−1.79 TCH** |
| Z24/25 | 1-ZONA SUR | 1,841.72 ha · 139,526.09 t · **75.76** | 2,027.51 ha · 154,849.05 t · **76.37** | +185.79 ha · +15,322.96 t · **+0.62 TCH** |
| Z24/25 | 2-ZONA CENTRO | 2,778.23 ha · 198,018.12 t · **71.27** | 2,592.44 ha · 182,695.16 t · **70.47** | −185.79 ha · −15,322.96 t · **−0.80 TCH** |
| Z25/26 | 1-ZONA SUR | 1,763.26 ha · 140,049.26 t · **79.43** | 1,952.88 ha · 156,497.44 t · **80.14** | +189.62 ha · +16,448.18 t · **+0.71 TCH** |
| Z25/26 | 2-ZONA CENTRO | 2,975.85 ha · 186,775.80 t · **62.76** | 2,786.23 ha · 170,327.57 t · **61.13** | −189.62 ha · −16,448.23 t · **−1.63 TCH** |

- **Totales:** el total CASUR no cambia (9,735.96 ha y 622,474 t en Z25/26). Solo se traslada el bloque de lotes 270–283 entre las dos zonas.
- **Lotes Sur de la finca 2 en Z25/26:** 189.62 ha · 16,448.20 t · **86.74 TCH**.
- **En el aforo Z26/27:** 189.61 ha activas = molienda · 16,281.52 t estimadas · **85.87 TCH**.

## 3. Cómo lo presenta la App (sin reasignar)

- **Cronológico de Zona:** el ejecutado Z25/26 se calcula sobre los **lotes que el aforo ubica en la zona**. La finca 2 aporta sus 16 suertes Sur a 1-Sur. Así el ejecutado y el estimado comparan la misma población.
- **Histórico de Zona:** usa la **clasificación histórica oficial por finca** (motor oficial). San Jerónimo cuenta en 2-ZONA CENTRO. Los totales coinciden exactamente con `zoneAnalysis` y con Análisis.
- **Distinción conservada:** las ayudas «i» de ambos tabs explican las dos clasificaciones y el porqué de la diferencia (+0.71 TCH en 1-Sur en Z25/26).

## 4. Decisión del propietario (opcional)

| Opción | Efecto |
|---|---|
| **A. Mantener**, recomendado mientras no exista una regla operativa | Histórico por finca (oficial) y Cronológico por suerte, ambos rotulados |
| **B. Histórico por lote** | El motor de zonas cambiaría a asignación por lote. Requiere autorizar el cambio de motor y revalidar las cifras oficiales de Análisis |
| **C. Reasignar la finca 2 a 1-Sur** | Cambio de dato maestro. Requiere autorización y fuente formal (SIAGRI no se modifica desde la App) |
