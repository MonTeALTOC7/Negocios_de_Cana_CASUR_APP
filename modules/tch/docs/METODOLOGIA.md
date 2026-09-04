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

La edad de referencia es el horizonte técnico del modelo y no representa necesariamente la fecha real de cosecha.

El resultado principal es siempre la proyección biométrica.

## Pesaje opcional

Cuando el técnico active el pesaje opcional en un punto:

`PesoPromedioTallo = PesoTotal / TallosPesados`

`TCHpeso = POB × PesoPromedioTallo × 10 / DistSurco`

TCHpeso es contraste. No se promedia automáticamente con TCHe.


# MASTER GENERAL RULES

- Fuente: hoja `REPORTE`.
- Incluir 1-Sur, 2-Centro, 3-Norte, 5-Productores.
- Excluir totalmente Zona 0 / Sucuya.
- Productores es prioridad, no universo exclusivo.
- No existe filtro obligatorio por zona.
- Un buscador cubre todas las suertes.
- `Tn`: CA=Arriendo, CV=Compra Venta, PR=Propio.
- Zona y tenencia son dimensiones independientes.
- La actualización desde Excel debe mantener esta regla en futuras versiones.
