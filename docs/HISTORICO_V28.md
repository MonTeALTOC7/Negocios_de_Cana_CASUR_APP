# Histórico gerencial V2.8 — cierre de presentación

Base: PR #36, `24f9b03c8c88e9313060d6e9d7d34a88d4322ff7`.
Rama: `codex/historico-gerencial-v2-8`. Sin merge ni despliegue.

## Cambios acotados

- Fincas seleccionadas dentro del encabezado institucional en app y PDF.
- Segundo ámbito: «Histórico de las zafras seleccionadas».
- Serie histórica completa conservada; referencia ponderada del período en la leyenda, sin chip superior.
- Leyenda ejecutiva del mapa con finca y alcance. Procedencia y cobertura siguen disponibles en el detalle técnico; atribución cartográfica conservada.
- Etiquetas cartográficas restringidas a la selección. Ocho suertes contextuales de Peirano conservan geometría e identificación por clic, sin etiqueta ni tooltip permanente. La opción no cambia los mapas individuales.

No se modificaron motor histórico, fórmulas, datos oficiales, geometrías, versiones ni Service Worker.

## Conciliación

Caso A: Dolores completa + Peirano 98301/98304/98304A, 21/22–25/26.

| Ámbito | Área media | TCH | KATM | TAH |
|---|---:|---:|---:|---:|
| Histórico completo | 204.26 | 61.20 | 108.63 | 6.65 |
| Zafras seleccionadas | 187.41 | 53.57 | 105.66 | 5.66 |

Distancia vigente: 36.10 km. Caso B (Peirano 98301/98302, últimas tres): 188.84 ha/zafra, 48.92 TCH, 108.56 KATM; distancia 36.10 km.

## Verificación 2026-10-23

- `npm test` en Producción: 22 controles + 135 pruebas.
- TCH `npm test` y `npm run validate`: 91 pruebas, estática aprobada.
- `node --test tests/*.test.mjs`: 53 pruebas Shell/GEO.
- `node --check` en JS modificados y `git diff --check`; scripts inline cubiertos por validación Producción.
- `qa-gerencial-v2.cjs`: A/B, 1440×900 y 390×844, PDF ejecutivo 3 páginas y completo 6. Sin filas perdidas/duplicadas, recortes detectados ni errores de ejecución. PDFs reales renderizados; nueve páginas del caso A inspeccionadas a color y grises.
- `qa-v28.cjs`: encabezado, referencias 53.57/105.66, diez zafras completas invariantes, períodos dinámicos/vacíos, 20 polígonos, 12 destacados y 8 contextuales, atribución e interacción sin mutación analítica. Sin desbordamiento horizontal.
- `qa-multifinca-recovery.cjs`: PDF/PNG individual, suerte, Cronológico, dos fincas, shell y recarga offline con descarga PDF aprobados.
- Fallos forzados de World Imagery/Transportation rechazan exportación híbrida incompleta. Offline conserva geometrías y resultados; exportación sin fondo exige consentimiento.

Evidencia externa: `C:/Users/ctije/Videos/CASUR_V28_QA/` (`final`, `focal-verified`, `regression`, `offline-final`). No se incluyen datasets adicionales en el commit.

## Límites conocidos

- En teléfono algunas etiquetas requieren acercamiento; la interfaz lo indica, sin ocultar geometrías.
- No se verificó impresión física. Escala de grises simulada.
- Mosaicos satelitales externos requieren conexión; offline permite geometrías y exportación explícita sin fondo.
- Limitación heredada documentada en V2.6/V2.7: alineación del PNG cartográfico individual de Cronológico; no se amplió este cierre para corregirla. Las exportaciones de ficha y el mapa multifinca son rutas distintas.
