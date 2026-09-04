# DATA MODEL

## Suerte
Campos centrales:
`id`, `legacyId`, `farmCode`, `producer`, `lot`, `area`, `variety`, `rowSpacingM`,
`plantingDate`, `lastCutDate`, `zone`, `tenureCode`, `tenureLabel`, `irrigation`,
`historicalTch`, `latestSeasonTch`, `estimatedTch2627`, `estimatedTch2627UpdatedAt`, `estimatedTch2627Source`,
`estimatedTons2627`, `irrigationCount`, `masterStatus`, `masterObservation`.

## Biometría
Además de identificación de suerte:
`currentAgeMonths`, `targetAgeMonths`, `adjustmentPct`, `biometricTch`, `projectedTch`,
`projectedTons`, `weightTch`, `weightPointCount`, `cvPct`, `quality`, `validation`, `samples`.

## Punto v2.4
`pointCode`, `sampleLengthM`, `stalkCount` o `directStalksPerMeter`,
`heightM`, `diameterMm`, `rowSpacingM`, `tch`,
`weighingEnabled`, `weighedStalkCount`, `weighedTotalKg`, `averageStalkWeightKg`, `weightTch`,
GPS y observaciones.

Campos legacy `lengthCm` y `diameterCm` se conservan en registros guardados para compatibilidad.

## Visita de campo v2.7.2

`id`, `date`, `time`, `technician`, identificación completa de suerte, `purpose`,
`overallCondition`, `waterStatus`, `weedLevel`, `pestLevel`, `lodgingPct`,
`tchSource`, `estimatedTch`, `tchDescription`, `linkedBiometryId`, `estimatedTch2627`,
`lodgingDescription`, GPS, `notes`, `photos`, `datasetVersion`, `revision`, `updatedAt`, `sync`.

Cada fotografía nueva contiene `id`, `blob` JPEG optimizado, dimensiones, tamaño,
nombre original y fecha de captura. La copia rotulada no se guarda: se genera como PNG al exportar.
La visita exige al menos una fotografía, pero permite agregar todas las necesarias según el espacio disponible del dispositivo.
Las fotografías antiguas con `dataUrl` siguen siendo válidas y se convierten al exportar o respaldar.
