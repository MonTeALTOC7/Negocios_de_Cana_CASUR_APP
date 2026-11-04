# Preparación verificada por módulo — PR #56 / Issue #51

El manifiesto generado identifica un release mediante hashes, pertenencia y dependencias. La instalación prepara exclusivamente core; Maestro solicita core, geo, agricultural y produccion antes de asignar su iframe. Los demás módulos se preparan al abrirse. El shell muestra disponibilidad de código offline por módulo; datos oficiales, servicios externos y mosaicos conservan sus políticas independientes.

Cada conjunto se escribe en staging y se promueve mediante un marcador atómico. La reutilización comprueba entradas y hashes; fetch vuelve a comprobar el hash del recurso servido. No hay bypass de JS/CSS a la red. El coste de estas verificaciones se conserva deliberadamente para detectar corrupción; no se promete reentrada instantánea.

Los clientes se fijan a un registro persistente {releaseId, version}. Los manifiestos inmutables se almacenan por releaseId, y las cachés de bundles se resuelven desde ese manifiesto, sin inferir generación solo desde APP_VERSION. El worker conserva los caches previos; una navegación de documento abre la versión actual y sus iframes heredan la generación del cliente. Durante una actualización se consulta al worker activo y se prepara lo previamente disponible (snapshot completo si es legacy) antes de ofrecer la nueva versión. La activación requiere los checkpoints ya existentes de todas las ventanas. IndexedDB no es administrado por el SW.

Se conservan los marcadores y las cachés referenciadas. La eliminación de staging fallido solo afecta a la transacción actual. La recolección de generaciones abandonadas queda conservadora: no se borran automáticamente snapshots previos; esto puede consumir espacio con varias versiones y requiere una política posterior basada en clientes vivos.

Las pruebas de derivación del hosting monolítico usan una fixture congelada del SW anterior para conservar ese contrato. Las transacciones, fetch y pinning nuevos se comprueban contra el worker actual.

## Validación

QA de fidelidad actualizado: objetivos actuales de General, consulta real de Pansaco/99336, paneles móviles Información/Ubicación/TCH-KATM, tabla completa de 18 columnas, foco/Escape, selección y SVG conservados. La base ya no tiene selector de apariencia; las dos variantes CSS se prueban sin afirmar que exista ese control. El buscador se prueba con sidebar abierto y contraído a 1280/1536/1774. Comparación CSS móvil 360/390/430 en General/Finca/Suerte 19011: ocho capturas idénticas, una diferencia de un píxel sin alteración de layout.

Actualizaciones de instalaciones reales 1.5.2 y 1.5.4: aviso, aplazar, dos ventanas, checkpoint rechazado sintético, borrador real de TCH/IndexedDB y recarga offline. Fallos 404/hash durante preparación muestran recuperación, permiten reintentar y conservan módulos ya listos; un módulo no preparado offline regresa a Inicio sin UI parcial.

Los tiempos públicos y videos se entregan como evidencia externa; no se infiere una aceleración de los tiempos locales. La prueba pública usa cinco contextos aislados por resolución y origen, alternando baseline ca6c535 y candidata. Mide desde el clic en Inicio hasta interacción real con Cronológico.

La prueba pública adicional detectó una publicación de datos sin LKG disponible al expirar el plazo de 15 s. Se conserva ese plazo y se verifican las seis descargas oficiales con tres lectores concurrentes. Se mantienen las seis SHA-256, equivalencia JSON/JS, coherencia de las tres versiones y relectura final del manifiesto antes de promover LKG. No cambia ningún dato o fórmula. El benchmark final exige generación aforo.1101 y TCH autorizado 65 de 99336 antes de registrar Maestro interactivo.
