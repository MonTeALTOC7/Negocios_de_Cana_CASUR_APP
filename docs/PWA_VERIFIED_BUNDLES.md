# Preparación verificada por módulo — PR #56 / Issue #51

El manifiesto generado identifica un release mediante hashes, pertenencia y dependencias. La instalación prepara exclusivamente core; Maestro solicita core, geo, agricultural y produccion antes de asignar su iframe. Los demás módulos se preparan al abrirse. El shell muestra disponibilidad de código offline por módulo; datos oficiales, servicios externos y mosaicos conservan sus políticas independientes.

Cada conjunto se escribe en staging y se promueve mediante un marcador atómico. La reutilización comprueba entradas y hashes; fetch vuelve a comprobar el hash del recurso servido. No hay bypass de JS/CSS a la red. El coste de estas verificaciones se conserva deliberadamente para detectar corrupción; no se promete reentrada instantánea.

Los clientes se fijan a la versión de caché cuyo manifiesto contiene el releaseId. El worker conserva los caches previos; una navegación de documento abre la versión actual y sus iframes heredan la generación del cliente. Durante una actualización se consulta al worker activo y se prepara lo previamente disponible (snapshot completo si es legacy) antes de ofrecer la nueva versión. La activación requiere los checkpoints ya existentes de todas las ventanas. IndexedDB no es administrado por el SW.

Se conservan los marcadores y las cachés referenciadas. La eliminación de staging fallido solo afecta a la transacción actual. La recolección de generaciones abandonadas queda conservadora: no se borran automáticamente snapshots previos; esto puede consumir espacio con varias versiones y requiere una política posterior basada en clientes vivos.

Las pruebas de derivación del hosting monolítico usan una fixture congelada del SW anterior para conservar ese contrato. Las transacciones, fetch y pinning nuevos se comprueban contra el worker actual.
