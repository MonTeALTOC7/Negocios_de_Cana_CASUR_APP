# Auditoría técnica v2.5.0 — Estimador TCH CASUR

## Resultado

La base v2.4.3 es adecuada para continuar: PWA estática, uso sin conexión, Maestro General,
IndexedDB, fórmula separada del código de interfaz, exportación Excel y pruebas automáticas.
No se requiere reescribir la app ni añadir un servidor para el módulo de visitas.

La v2.5.0 incorpora visitas como módulo principal y mantiene intacto el motor de TCH.

## Fortalezas encontradas

- El motor agronómico está aislado en `tch-engine.js` y tiene ejemplos numéricos probados.
- El Maestro General se normaliza y excluye Sucuya/Zona 0.
- La edad se calcula desde fechas y no depende de una columna estática.
- El TCH por peso se trata como contraste y no se mezcla automáticamente con TCHe.
- Los datos permanecen en el teléfono mediante IndexedDB y el Service Worker permite modo campo.
- La exportación conserva puntos, GPS, unidades y comparativos históricos.

## Riesgos técnicos y agronómicos

### Fórmula volumétrica

La constante `0.007854` es coherente con una aproximación cilíndrica cuando D está en mm,
H en m, POB en tallos/m y el surco en m, asumiendo densidad equivalente a 1,000 kg/m³.
La fórmula es transparente, pero no elimina estos supuestos:

- el tallo real no es un cilindro perfecto;
- el diámetro entra al cuadrado, por lo que un error de D se amplifica;
- altura media, diámetro medio y población deben pertenecer a una muestra representativa;
- hojas, cogollo, variación de densidad, entrenudos y acame no quedan representados directamente.

La calibración contra aforo y TCH real debe estimar sesgo por variedad, edad, ciclo y condición.

### Proyección por edad

La proyección actual es lineal entre edad actual y edad de referencia. Es una herramienta
operativa, no una curva fisiológica universal. Cerca de madurez, con déficit hídrico o después
de acame, el crecimiento no necesariamente es lineal. Debe conservarse como proyección
identificada y validarse con cosecha real antes de usarla como compromiso de producción.

### Muestreo

La app permite uno o dos puntos con advertencia. Esto es útil operativamente, pero un muestreo
corto no adquiere representatividad solo por tener un CV bajo. La selección espacial de puntos
debe cubrir ambientes contrastantes dentro de la suerte y evitar elegir únicamente caña visible
desde el camino.

### Almacenamiento de fotografías

Las fotos se reducen a un máximo de 1,600 px y JPEG de calidad controlada. Aun así, varias
decenas de visitas pueden ocupar cientos de MB. Se recomienda exportar la carpeta ZIP y el
respaldo periódicamente, confirmar su apertura y después eliminar evidencias antiguas del
teléfono cuando exista una copia segura.

## Decisiones de diseño v2.5.0

- Biometría continúa como operación principal.
- Visitas se convierte en segundo módulo principal y reemplaza Maestro en la barra inferior.
- Maestro y Exportación siguen disponibles desde Inicio como funciones administrativas.
- Guardar una visita exige suerte, técnico, fotografía y GPS.
- El TCH es opcional; si existe, se registra su fuente: visual, biometría o aforo.
- El original limpio se conserva para IA; el rótulo se dibuja solamente en la copia PNG exportada.
- La carpeta ZIP ordena evidencias por hacienda/productor y visita.
- IndexedDB sube de versión sin borrar stores ni datos anteriores.

## Verificaciones ejecutadas

- validación de estructura PWA;
- pruebas unitarias del motor TCH;
- sintaxis de todos los módulos JavaScript modificados;
- presencia de navegación, cámara, store `visits`, PNG, Excel y originales para IA;
- consistencia del Maestro General: 1,054 suertes, 10,030.06 ha y Sucuya excluida.

La prueba final de cámara, permisos GPS, descarga múltiple y apariencia debe hacerse en uno de
los teléfonos Android que se usarán en campo, porque esos permisos y el selector de cámara los
controla el navegador/dispositivo.
