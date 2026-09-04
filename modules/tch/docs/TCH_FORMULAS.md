# TCH_FORMULAS

## TCHe biométrico oficial

`TCHe = D² × H × POB × 0.007854 / DistSurco`

Unidades:
- `D`: diámetro en milímetros (mm)
- `H`: altura del tallo en metros (m)
- `POB`: tallos por metro
- `DistSurco`: metros

Ejemplos validados:
- POB 12, H 2.93 m, D 31.2 mm, surco 1.65 m → 162.916 TCH.
- POB 9, H 3.22 m, D 27.2 mm, surco 1.65 m → 102.057 TCH.

## Compatibilidad v2.3

La v2.3 guardaba `lengthCm` y `diameterCm`. La relación es matemáticamente equivalente:
- H(m) = lengthCm / 100
- D(mm) = diameterCm × 10

Nunca reinterpretar datos legacy como si ya estuvieran en las unidades nuevas.

## Proyección

`TCH proyectado = (TCHe / edad actual) × edad de referencia × (1 - ajuste/100)`

La **edad de referencia para proyección** es el horizonte técnico usado por el modelo. No representa necesariamente la fecha real de cosecha. Los valores 9–11 meses son parámetros operativos configurables; no deben interpretarse como un límite fisiológico universal de crecimiento.

El resultado principal es siempre la proyección biométrica.

## Pesaje opcional

Puede activarse manualmente en cualquier punto cuando el técnico decida realizar pesaje. Inicia siempre desactivado (`No`):

`PesoPromedioTallo = PesoTotal / TallosPesados`

`TCHpeso = POB × PesoPromedioTallo × 10 / DistSurco`

TCHpeso es contraste. No se promedia automáticamente con TCHe.
