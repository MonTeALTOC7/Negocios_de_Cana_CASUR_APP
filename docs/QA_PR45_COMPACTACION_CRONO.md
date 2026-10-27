# PR #45 · Compactación visual del Cronológico

Base: 303c292. Alcance exclusivamente visual: general, finca y suerte.
No se modifican cálculos, fuentes, aforo, datos, selección, exportadores o SW.

## Decisiones de presentación

- Se mantienen los cinco KPI generales. La opción para aprovechar el hueco es
  distribuirlos a todo el ancho disponible, sin incorporar indicadores redundantes.
  En 1440×900 ocupan el ancho de 1.120 px en cinco tarjetas de unos 72 px de alto,
  con valores en una línea. En móvil se distribuyen en dos columnas.
- Etiquetas: `TCH Z Ant. 25/26`, `TCH Estim. Z26/27`, `Ton. Estim. Z26/27`.
  Las etiquetas de estimación y títulos de panel usan la zafra efectiva existente.
- Paneles a altura natural en tres columnas temáticas: zona, riego y cultivo.
  El estimado por zona acompaña su área; el de riego acompaña su área; etapa del
  cultivo acompaña tenencia y destino. Se evita estirar el panel de dos categorías
  hasta la altura del que tiene siete. En teléfono las columnas se apilan.
- Los cuatro pies de área muestran solamente el valor separado por una línea.
  El significado de total se conserva para lectores de pantalla, sin texto visible
  redundante. No cambian las categorías, ámbitos ni importes.
- Suerte: se conserva el orden aprobado, área/TCH anterior, variedad/edad actual,
  estimado/fecha para cosecha, en tres filas de dos, también en móvil.
- Se conserva la paleta salvia/petróleo del estimado y cosecha. El tipo de corte
  usa 12 px, peso 800 y color #30393D sobre #E4EAE9 (contraste 9,70:1).
- Finca: seis tarjetas a todo el ancho en escritorio, manteniendo edad y distancia
  ponderadas y las dos estimadas consecutivas. Tres columnas en ancho intermedio
  y dos en móvil. No se reintroducen subtítulos ni badges administrativos.

## Integridad y regresión

Se conserva la generación 2026.10.25-aforo.1101, procedencia y decisiones 2003/1927.
Resultados generales: 9.574,66 ha activas; 64,08 TCH anterior; 61,78 estimado;
563.187,97 t; 7,94 meses al 26-oct-2026 y cobertura de edad 100%.
Los cuatro totales de área y todos los cocientes por zona/riego/etapa se comparan
contra la conciliación independiente archivada, sin cambiar denominadores.

Se conservan los ocho valores históricos de 99336, sus seis KPI y las 18 columnas.
Finca 494 mantiene 25,18 ha, 82,11 TCH anterior y 27,08 estimado, edad/distancia
ponderadas y «Varias fechas» de cosecha. Último Aforo y fechas acreditadas intactos.

Pruebas: Producción 22 controles + 206; Shell/GEO 71; TCH validate + 91;
node --check, scripts inline, runtime 163 hashes, diff --check y builder/verificador.
QA Chromium con aserciones numéricas y geométricas en 1440×900, 1280×800 y
390×844: cinco tarjetas, valores sin recorte, sin overflow, ancho aprovechado,
paneles sin altura estirada y tipo de corte legible.

Las evidencias HTTPS y de actualización real desde 303c292 al HEAD final se
adjuntan en el mismo PR, usando una copia aislada del perfil QA conservado.
Se comprueban offline, reapertura, navegación, Histórico, selección múltiple y
descargas PDF/PNG. La emulación móvil no sustituye la aprobación del usuario en
su teléfono. La edad actual sigue dependiendo de la fecha de consulta.

No cambia el worker fuente ni el derivador de preview aprobado, sus controles
de Access, caché por HEAD, checkpoint, IndexedDB, GEO o LKG. El manifiesto runtime
actualiza únicamente los hashes de HTML, CSS y presentación JS modificados.
