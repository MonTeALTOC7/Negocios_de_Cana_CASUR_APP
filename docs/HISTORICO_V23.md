# V2.3: composición compacta

Base PR #30: 91e9bdb5df5bb08641ce7784e586e271741d191c.
Solo CSS de selección y acentos KPI, más prueba estática. Sin cambios de motor, datos, gráficos, paginación o contratos.

Selección horizontal adaptable con nombre/código/alcance íntegros. Caso A en escritorio: altura 73.59375 a 34.796875 px (-52.7%). PDF: una línea. Móvil: saltos sin truncar. Histórico completo conserva borde superior de 3 px; período tiene borde superior normal de 1 px y acento izquierdo de 4 px. Papel blanco; aplicación verde.

Validación: npm test --prefix modules/produccion (22 controles + 123 tests), npm run validate --prefix modules/tch (91), node --test tests/*.test.mjs (48), node --check y git diff --check. QA con qa-gerencial-v2.cjs a 1440x900 y 390x844; escenarios A, B, una, tres, cinco fincas y personalizado. Caso A: 204.26/61.20/108.63/6.65 histórico y 187.41/53.57/105.66/5.66 período; 36.10 km. Comparación del modelo completo contra base idéntica.

PDF finales A ejecutivo 2 páginas y completo 5: todas sus páginas inspeccionadas sin cortes ni hojas vacías; escala de grises simulada legible. qa-multifinca-recovery.cjs acredita exportaciones PDF/PNG individuales y multifinca, Cronológico, shell y recarga offline precargada. La primera tanda de PDF detectó una regla CSS posterior que anulaba flex; corregida con especificidad y nueva tanda independiente.

Evidencias: C:/Users/ctije/Videos/CASUR_V23_QA/definitivo; comparacion.json y seleccion-4285.png/seleccion-4284.png documentan antes/después. final/ es diagnóstico inicial, NO entrega.

Impresión física y móviles físicos pendientes. Sin merge ni despliegue; PR hijo de #30.
