# Fase 5.1A — Conciliación Maestro Central / Insumos

Se incorpora una comparación **de solo lectura** del registro \`casur_master_data/datasets/maestro_suertes_current\` que la App Maestra ya mantiene, contra el catálogo original de Insumos.

**No hay escritura, migración, sobreescritura ni sincronización de datos.** Los eventos SIAGRI, los productos, la lógica de AAM, la exclusión de Sucuya, las áreas, las validaciones, los KPI y la exportación continúan utilizando exclusivamente el catálogo de Insumos. Los datos del Maestro Central solo se muestran como diagnóstico en **Admin**.

El cruce es por Hacienda|Suerte, con normalización, evitando emparejar arbitrariamente llaves duplicadas. Se muestran coincidencias, faltantes en ambos catálogos y divergencias de nombre/área >0.01 ha. Si no existe una copia local del Maestro Central, la app sigue funcionando normalmente. Se puede refrescar la lectura sin recargar la app.

El paso siguiente —sustitución *operativa* de campos por una referencia central— exige evaluar versión, discrepancias y precedencia con datos reales antes de habilitarse.

QA en Codex: \`node --test modules/insumos/tests/maestro-central-bridge.test.mjs\`, comparación de KPI con main y pruebas de Administración, importación SIAGRI, offline y persistencia.
