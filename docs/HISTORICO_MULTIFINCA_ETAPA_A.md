# Histórico multifinca · contrato de Etapa A

La selección vive por `farmCode`: `{ mode: "full" }` incluye todas las suertes
históricas elegibles de esa finca; `{ mode: "partial", lotIds: [...] }` incluye
solo las identidades explícitas. El catálogo procede de `APP_DATA.lotCompact`,
no del inventario vigente del Cronológico. Añadir la misma suerte dos veces no
duplica filas. Al quitar una suerte de una finca completa, la entrada pasa a
parcial. La selección y el período son estados independientes.

`CASUR_HISTORICAL_ENGINE.buildHistoricalMultiAnalysis(rows, selection, catalog,
mode, customZafras, producers)` es el contrato para el futuro tablero. Devuelve:

- `selection`: fincas, modo y `lotIds` efectivamente incluidos;
- `availableZafras` y `selectedZafras`: zafras reales del conjunto y período
  reconciliado (`latest`, `last3`, `last5`, `all`, `custom`);
- `consolidated` y `farms[]`: área acumulada, área media por **zafra seleccionada**,
  TCH (toneladas válidas / área correspondiente), KATM ponderado por toneladas
  con KATM válido, edad ponderada por área válida, y cobertura;
- `series[]`: agregados y calidad por zafra, incluidas listas de fincas y suertes
  que aportaron o faltaron, para gráficos y tablas posteriores;
- `currentDistance`: Km de referencia vigente y cobertura, independiente del
  filtro histórico. Cada finca tiene su propia `currentDistance`.

El área media usa como denominador todas las zafras seleccionadas. Una finca
sin registro en alguna de ellas conserva ese denominador y expone
`zafrasWithData` y `missingLotSeasons`; esa ausencia no es una observación de
0 ha. Si existe una fila con área nula/no positiva, su área y media se presentan
como N/D. TCH y KATM usan los denominadores válidos del motor común.

Conciliación oficial de referencia, con Dolores (256) completa y solamente
`98301` y `98302` de Rancho Peirano (983):

| Período | Área acumulada | Área principal | TCH | KATM | Suertes con dato |
| --- | ---: | ---: | ---: | ---: | ---: |
| Última, 25/26 | 188.78 ha | 188.78 ha | 40.57 | 103.90 | 11/17 |
| Últimas 3, 23/24–25/26 | 566.52 ha-zafra | 188.84 ha/zafra | 48.92 | 108.56 | 11/17 |

Dolores sola en las últimas 3 concilia con su ficha individual: 475.89
ha-zafra, 158.63 ha/zafra y 45.35 TCH. En 19/20 la selección combinada suma
377.74 ha. El ejemplo de 399.62 ha incluye 21.88 ha de `98303`, una suerte
**no seleccionada**; no se modifica el dataset para reproducir esa cifra.

Etapa A no cambia los exportadores ni incorpora el dashboard/PDF ejecutivo.
Gráficos, tablas y reportes de etapas posteriores deben consumir este mismo
resultado, sin reconstruir sus propias ponderaciones.
