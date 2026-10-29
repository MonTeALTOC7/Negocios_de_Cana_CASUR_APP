/* ============================================================
   versions.js — Control de versiones.
   La App Maestra tiene su propia versión; cada módulo la suya
   (independiente). Se muestran en Centro Maestro. Actualizar el
   número de un módulo aquí no afecta a los demás.
   ============================================================ */

export const APP_VERSION = '1.5.3';
export const APP_CHANNEL = 'GitHub Pages';

// Historial de código instalado, independiente de las publicaciones SIAGRI/GEO.
export const PRODUCTION_RELEASES = [
  {id:'produccion',moduleVersion:'V1.8.0',historicalVersion:'V2.9',appVersion:'1.5.3',type:'MINOR',publishedAt:null,
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
  produccion: 'V1.8.0',
  tch: '2.8.1',
  riego: 'v6',
  insumos: '1.0',
  inventario: '1.4.0',
  labores: '0.7.x',
  convertidor: '1.1.0',
  conciliacion: '0.7.x',
};

export function moduleVersion(id) {
  return MODULE_VERSIONS[id] || '—';
}

/* Estado de integración por módulo (se muestra en Centro Maestro).
   'integrado' = app real embebida y verificada; 'placeholder' = pendiente
   de su fase. El TCH está integrado técnicamente; cámara/GPS/Android
   requieren validación final en dispositivo real tras publicar. */
export const MODULE_STATUS = {
  produccion: 'integrado · V1.8.0 (código) · datos oficiales íntegros y generaciones locales conservadas',
  tch: 'integrado · cámara/GPS: validar en dispositivo',
  riego: 'integrado · fuente/backend Supabase propios',
  insumos: 'integrado · fuente/Maestro propios (conexión al Maestro Central en Fase 5.1)',
  inventario: 'placeholder',
  labores: 'integrado · fuente propia',
  convertidor: 'integrado',
  conciliacion: 'placeholder',
};

export function moduleStatus(id) {
  return MODULE_STATUS[id] || 'placeholder';
}

export const APP_RELEASES = Object.freeze([
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
 tch:Object.freeze([Object.freeze({id:'tch',version:'2.8.1',type:'PATCH',publishedAt:null,changes:Object.freeze(['Checkpoint PWA bloquea GPS, capturas, escrituras y exportaciones activas; conserva borrador e IDB v3.'])})]) });
export const RELEASE_CATALOG = Object.freeze(Object.fromEntries(Object.entries(MODULE_VERSIONS).map(([id,version]) => [id,
  Object.freeze({id,version,publishedAt:MODULE_RELEASES[id]?.[0]?.publishedAt || null,history:MODULE_RELEASES[id] || Object.freeze([])})
])));
