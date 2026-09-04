# ROADMAP

## Próximas mejoras candidatas

- Validar v2.7.2 en Android con fecha obligatoria del estimado, cámara, galería, edición de visitas, compartir por WhatsApp y descargas masivas.
- Ejecutar un piloto de 20–30 visitas para revisar legibilidad del PNG, precisión GPS y tamaño de los ZIP.
- Definir y fabricar el patrón físico de escala/calibración para las fotos de altura y diámetro.
- Recolectar datos pareados: fotografías originales + medición manual + aforo/TCH real.
- Refinar ergonomía de captura tras feedback del técnico.
- Analizar calibración TCHe / TCHpeso contra TCH real de báscula antes de proponer cualquier combinación.
- Validar con usuarios la nueva consulta cronológica por suerte.
- Diseñar sincronización central offline-first (Storage + PostgreSQL/RLS o alternativa aprobada), con cola, checksum, reintentos y resolución de conflictos; implementarla solo con autorización.
- Ampliar la auditoría detallada de revisiones biométricas si el flujo de aprobación lo requiere.
