/* ============================================================
   versions.js — Control de versiones.
   La App Maestra tiene su propia versión; cada módulo la suya
   (independiente). Se muestran en Centro Maestro. Actualizar el
   número de un módulo aquí no afecta a los demás.
   ============================================================ */

export const APP_VERSION = '1.7.0';
export const APP_CHANNEL = 'GitHub Pages';

// Historial de código instalado, independiente de las publicaciones SIAGRI/GEO.
export const PRODUCTION_RELEASES = [
  {id:'produccion',moduleVersion:'V1.8.3',historicalVersion:'V2.9',appVersion:'1.6.2',type:'PATCH',publishedAt:null,changes:['Cronológico General y de finca con las mismas pestañas Distribución, Estimados Z26/27 y Suertes; tablas compactas y orden agronómico por número de cortes.','Semilla con área y suertes reales, estimado de molienda «No aplica»; composición de la finca, buscador siempre arriba y un único Exportar PDF/PNG. Motores, datos e informes conservados.']},
  {id:'produccion',moduleVersion:'V1.8.2',historicalVersion:'V2.9',appVersion:'1.5.6',type:'PATCH',publishedAt:null,changes:['Buscador general antes del análisis en escritorio.','Conserva fichas, motores, datos e informes.']},
  {id:'produccion',moduleVersion:'V1.8.1',historicalVersion:'V2.9',appVersion:'1.5.5',type:'PATCH',publishedAt:null, changes:['Protege la presentación inicial mientras se preparan la interfaz y los datos.','Conserva la recuperación y los controles existentes de actualización.']},
  {id:'produccion',moduleVersion:'V1.8.0',historicalVersion:'V2.9',appVersion:'1.5.4',type:'MINOR',publishedAt:null,
   changes:['Maestro por pestañas con Resumen ejecutivo y navegación de consultas conservando selecciones.','Dos presentaciones visuales, composición responsive y accesos a las fichas originales; métricas, gráficos y exportadores conservados.']},
  {id:'produccion',moduleVersion:'V1.7.2',historicalVersion:'V2.9',appVersion:'1.5.2',type:'PATCH',publishedAt:null,
   changes:['Restaura el contexto después de inicializar datos y controles, sin consumirlo antes de tiempo.','Conserva selecciones y periodo histórico; informa de entidades ausentes y de la limitación legacy sin alterar datos.']},
  {id:'produccion',moduleVersion:'V1.7.1',historicalVersion:'V2.9',appVersion:'1.5.1',type:'PATCH',publishedAt:null,
   changes:['PDF ajusta desbordamientos mínimos de una página sin cortar el pie ni perder contenido.','Liberación conjunta con generación oficial Z26/27 íntegra; fórmulas y decisiones conservadas.']},
  {id:'produccion',moduleVersion:'V1.7.0',historicalVersion:'V2.9',appVersion:'1.5.0',type:'MINOR',publishedAt:null,
   changes:['Generaciones oficiales verificadas por SHA-256 y actualización segura sin importar Excel.','Elección explícita de datos oficiales o generación personal guardada; contexto y ediciones protegidos.']},
  { id:'produccion',moduleVersion:'V1.6.0',historicalVersion:'V2.9',appVersion:'1.4.0',type:'MINOR',publishedAt:null,
    changes:['Importación de inventarios por estructura y contenido, sin nombres de hojas obligatorios.','Conciliación, aprobación y recuperación atómica de generaciones locales.','Identidad permanente y separación de áreas, destinos y estimados de zafra.'] },
  { id: 'produccion', moduleVersion: 'V1.5.1', historicalVersion: 'V2.9', appVersion: '1.3.5', type: 'PATCH', publishedAt: null,
    changes: ['Versión instalada y fecha del Cronológico efectivo.', 'Notificaciones de actualización PWA con checkpoint seguro.', 'Trazabilidad de fechas e historial de liberaciones.'] },
  { id: 'produccion', moduleVersion: 'V1.5.0', historicalVersion: 'V2.9', appVersion: '1.3.4', type: 'MINOR', publishedAt: null,
    changes: ['Identificación visible de versiones y consulta de novedades offline.',
      'Selección y análisis multifinca.', 'Producción histórica y período seleccionado.',
      'TCH, KATM y TAH.', 'Gráficos históricos y comparativos.',
      'Mapa híbrido de suertes seleccionadas.', 'PDF ejecutivo y completo.'] },
];

/* Versiones detectadas en la auditoría (Fase 0). En fase 1 son
   informativas (placeholders); al integrar cada módulo real se
   confirmarán/leerán de su propio version.json cuando exista. */
export const MODULE_VERSIONS = {
  produccion: 'V1.8.3',
  tch: '2.8.1',
  riego: 'v6',
  insumos: '1.0',
  inventario: '1.4.0',
  labores: '0.7.x',
  convertidor: '1.1.0',
  conciliacion: '0.7.x',
  visitas: '1.2.0',
};

export function moduleVersion(id) {
  return MODULE_VERSIONS[id] || '—';
}

/* Estado de integración por módulo (se muestra en Centro Maestro).
   'integrado' = app real embebida y verificada; 'placeholder' = pendiente
   de su fase. El TCH está integrado técnicamente; cámara/GPS/Android
   requieren validación final en dispositivo real tras publicar. */
export const MODULE_STATUS = {
  produccion: 'integrado · V1.8.3 (código) · datos oficiales íntegros y generaciones locales conservadas',
  tch: 'integrado · cámara/GPS: validar en dispositivo',
  riego: 'integrado · fuente/backend Supabase propios',
  insumos: 'integrado · fuente/Maestro propios (conexión al Maestro Central en Fase 5.1)',
  inventario: 'placeholder',
  labores: 'integrado · fuente propia',
  convertidor: 'integrado',
  conciliacion: 'placeholder',
  visitas: 'integrado · local-first; instalación diferenciada en Android: validar en dispositivo',
};

export function moduleStatus(id) {
  return MODULE_STATUS[id] || 'placeholder';
}

export const APP_RELEASES = Object.freeze([
  Object.freeze({id:'shell',version:'1.7.0',type:'MINOR',publishedAt:null,changes:Object.freeze(['Contrato de lectura del Maestro Central y diagnóstico de solo lectura en el Centro Maestro (generación oficial, local, fuente efectiva y maestros de los módulos).','Actualización SIAGRI del Centro Maestro en una sola transacción, con la generación anterior archivada y recuperable.','Nuevo módulo Visitas de Campo Productores de Caña con acceso directo e instalación propia sobre el Service Worker raíz.'])}),
  Object.freeze({id:'shell',version:'1.6.2',type:'PATCH',publishedAt:null,changes:Object.freeze(['Actualización coordinada del manifiesto offline para Producción V1.8.3 (UX13 Etapa A: Cronológico General/Finca y Estimados Z26/27). Sin cambios en Service Worker, datos ni otros módulos.'])}),
  Object.freeze({id:'shell',version:'1.6.1',type:'PATCH',publishedAt:null,changes:Object.freeze(['Recuperación segura de la versión instalada: si falta su manifiesto local se restaura solo desde la misma release verificada por SHA-256, o se ofrece una pantalla de reparación en lugar de un error 503 plano.','La instalación de una versión nueva ya no queda bloqueada porque falte la instantánea anterior; se rechazan downgrades y se conservan datos, cachés de módulos y checkpoint multiventana.'])}),
  Object.freeze({id:'shell',version:'1.6.0',type:'MINOR',publishedAt:null,changes:Object.freeze(['Rediseño Petróleo y Pizarra con nueva navegación empresarial y móvil.','Iconos definitivos por módulo y búsqueda Histórico móvil accesible.','Se conservan datos, motores y actualización segura PWA.'])}),
  Object.freeze({id:'shell',version:'1.5.6',type:'PATCH',publishedAt:null,changes:Object.freeze(['Preparación verificada por módulo y apertura prioritaria del Maestro.'])}),
  Object.freeze({id:'shell',version:'1.5.5',type:'PATCH',publishedAt:null,changes:Object.freeze(['Actualización coordinada para la presentación segura de Producción.'])}),
  Object.freeze({id:'shell',version:'1.5.4',type:'PATCH',publishedAt:null,changes:Object.freeze(['Repara navegación de iframe en hosting con redirecciones HTML, conservando verificación de integridad y caché offline.','Renueva caché segura del shell para las vistas Cronológico móvil y corrige la carga del módulo.'])}),
  Object.freeze({id:'shell',version:'1.5.3',type:'PATCH',publishedAt:null,changes:Object.freeze(['Actualiza el manifiesto offline para la candidata UX de Producción V1.8.0, preservando el protocolo de checkpoint y los demás módulos.'])}),
  Object.freeze({id:'shell',version:'1.5.2',type:'PATCH',publishedAt:null,changes:Object.freeze(['Checkpoint de contexto por ventana antes de activar; recuperación después de inicialización y respeto de una selección nueva.','Continuidad del módulo, respaldo de navegación pendiente y aviso discreto cuando el cliente legacy no persistió la ficha.'])}),
  Object.freeze({id:'shell',version:'1.5.1',type:'PATCH',publishedAt:null,changes:Object.freeze(['Libera el PDF corregido de Producción mediante el mismo protocolo de actualización PWA.','Conserva origen, scope, checkpoint, datos personales y generación oficial verificada.'])}),
  Object.freeze({id:'shell',version:'1.5.0',type:'MINOR',publishedAt:null,changes:Object.freeze(['Aviso discreto de actualización preparada, instalación explícita y aplazamiento persistente.','Integridad de datos oficiales, checkpoint de operaciones activas y recuperación de contexto.'])}),
  Object.freeze({id:'shell',version:'1.4.0',type:'MINOR',publishedAt:null,changes:Object.freeze(['Contrato común de importación operativa y transacciones con respaldo en Centro Maestro.','Acceso al flujo de aforo y recursos precargados; notificaciones PWA V1.3.6 conservadas.'])}),
  Object.freeze({ id: 'shell', version: '1.3.6', type: 'PATCH', publishedAt: null,
    changes: Object.freeze(['Avisos exclusivamente para una nueva versión preparada en espera.', 'Retiro de confirmaciones automáticas al iniciar o terminar una actualización.']) }),
  Object.freeze({ id: 'shell', version: '1.3.5', type: 'PATCH', publishedAt: null,
    changes: Object.freeze(['Actualización controlada con checkpoint y conservación offline.', 'Política verificable de versiones independientes.']) }),
  Object.freeze({ id: 'shell', version: '1.3.4', type: 'PATCH', publishedAt: null,
    changes: Object.freeze(['Identificación visible de versiones y novedades.']) }),
]);
for (const release of PRODUCTION_RELEASES) { Object.freeze(release.changes); Object.freeze(release); }
Object.freeze(PRODUCTION_RELEASES);

// Add immutable entries here when another module is released; never invent legacy history.
export const MODULE_RELEASES = Object.freeze({ produccion: PRODUCTION_RELEASES,
 visitas:Object.freeze([Object.freeze({id:'visitas',version:'1.2.0',type:'MINOR',publishedAt:null,changes:Object.freeze(['Identidad propia centrada en el productor: Inicio «Mi gestión de campo», navegación Inicio · Productores · Registrar · Gestión · Más, expediente técnico con resumen, suertes, cronología, seguimiento por etapa y evidencias.','Evidencias documentales sin recortes (foto completa con pie documental y ficha de seguimiento técnico), fotos de visita y de seguimiento en los informes, ventana GPS de 30 s con movimiento y precisión, y visitas retrospectivas sin atributos actuales.'])}),Object.freeze({id:'visitas',version:'1.1.0',type:'MINOR',publishedAt:null,changes:Object.freeze(['Rediseño integral: mapa operativo, detección automática de finca y suerte por GPS (asistencia, nunca restricción), registro rápido de un toque con detalles técnicos opcionales y bitácora.','Fotos con GPS asociado y procedencia explícita, galería, etiquetado institucional, tarjetas de hallazgo, expediente del productor, seguimiento con evidencias, informes y exportaciones.'])}),Object.freeze({id:'visitas',version:'1.0.0',type:'MINOR',publishedAt:null,changes:Object.freeze(['Primera versión local-first: registro de visitas con productor, suertes, GPS, mapa, hallazgos, fotografías originales, recomendaciones, solicitudes y compromisos.','Instantánea del Maestro por visita, borradores automáticos, respaldo ZIP verificable y restauración sin duplicados.'])})]),
 tch:Object.freeze([Object.freeze({id:'tch',version:'2.8.1',type:'PATCH',publishedAt:null,changes:Object.freeze(['Checkpoint PWA bloquea GPS, capturas, escrituras y exportaciones activas; conserva borrador e IDB v3.'])})]) });
export const RELEASE_CATALOG = Object.freeze(Object.fromEntries(Object.entries(MODULE_VERSIONS).map(([id,version]) => [id,
  Object.freeze({id,version,publishedAt:MODULE_RELEASES[id]?.[0]?.publishedAt || null,history:MODULE_RELEASES[id] || Object.freeze([])})
])));
