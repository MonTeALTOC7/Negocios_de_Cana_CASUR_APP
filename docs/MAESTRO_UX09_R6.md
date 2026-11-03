# UX09 R6 — correcciones y QA

La tabla de Distribución expone categoría, área y participación como columnas separadas. TOTAL suma exclusivamente las filas mostradas y su participación usa como denominador el área activa del ámbito filtrado; en Top fincas, una nota aclara que solo se totalizan las fincas mostradas. Sin área, la participación es N/D. El motor agronómico no cambia.

La barra de acciones de Finca conserva seis acciones, sin convertir Histórico ni Informe en pestañas. El mapa emplea `fitToData` del visor oficial al estar visible y con datos, una vez por instancia; al volver después de un zoom no se reencuadra. Si faltan geometrías, se informa sin crear polígonos.

QA Chromium local: 360/390/430/768/1280/1536 sin overflow de documento; comparación contra c1c47d7 a 390 y 1536. Suelo general: 9.574,66 ha; filtro Gravedad por zonas: 5.822,48 ha. Fincas 5, 993 y 19: respectivamente 39, 48 y 39 features oficiales, con bounds completos visibles a 390 y 1536. Se verificó una respuesta sintética sin geometrías, retorno 99336, cero de área con N/D, ficha premium, TCH/KATM, GIS, PDF/PNG, Histórico multifinca y offline. Las pruebas no sustituyen la revisión del propietario en Android físico.
