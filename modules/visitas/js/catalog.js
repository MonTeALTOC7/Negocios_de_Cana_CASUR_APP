/* Catálogo de hallazgos, solicitudes y estados. Extensible: agregar una categoría es agregar una entrada.
   Reglas: todo detalle técnico es opcional; nada se completa con valores supuestos («sin daño», «0 %», etc.);
   la severidad sugerida es solo una ayuda visual y nunca se guarda como severidad evaluada. */

const LEVEL3 = ['Baja', 'Media', 'Alta'];
const DIST = ['Focos aislados', 'Parches', 'Generalizada'];
/* Tipos de campo: choice (una opción), multi (varias), text, number (con unidad), date. */
export const CATEGORIES = [
  {id: 'malezas', label: 'Malezas', icon: 'malezas', suggested: 'Media', details: [
    {id: 'especies', label: 'Especies predominantes', type: 'text'},
    {id: 'cobertura', label: 'Cobertura estimada', type: 'number', unit: '%', min: 0, max: 100},
    {id: 'distribucion', label: 'Distribución', type: 'choice', options: DIST},
    {id: 'estadoMaleza', label: 'Estado de la maleza', type: 'choice', options: ['Emergencia', 'Crecimiento', 'Floración / semilla']}]},
  {id: 'plagas', label: 'Plagas', icon: 'plagas', suggested: 'Media', details: [
    {id: 'organismo', label: 'Plaga identificada', type: 'text', hint: 'Ej.: barrenador, salivazo, rata'},
    {id: 'incidencia', label: 'Incidencia', type: 'number', unit: '%', min: 0, max: 100},
    {id: 'organo', label: 'Órgano afectado', type: 'multi', options: ['Hoja', 'Tallo', 'Raíz', 'Cogollo']},
    {id: 'distribucion', label: 'Distribución', type: 'choice', options: DIST}]},
  {id: 'enfermedades', label: 'Enfermedades', icon: 'enfermedades', suggested: 'Media', details: [
    {id: 'enfermedad', label: 'Enfermedad identificada', type: 'text', hint: 'Ej.: roya, carbón, escaldadura'},
    {id: 'incidencia', label: 'Incidencia', type: 'number', unit: '%', min: 0, max: 100},
    {id: 'organo', label: 'Órgano afectado', type: 'multi', options: ['Hoja', 'Tallo', 'Raíz', 'Cogollo']}]},
  {id: 'fertilizacion', label: 'Fertilización', icon: 'fertilizacion', suggested: 'Media', details: [
    {id: 'sintomas', label: 'Síntomas observados', type: 'multi', options: ['Clorosis', 'Amarillamiento', 'Bajo vigor', 'Necrosis de bordes', 'Sin síntomas visibles']},
    {id: 'nutriente', label: 'Deficiencia probable', type: 'text'},
    {id: 'producto', label: 'Producto', type: 'text'},
    {id: 'dosis', label: 'Dosis', type: 'text', hint: 'Ej.: 6 qq/mz'},
    {id: 'labor', label: 'Labor requerida', type: 'choice', options: ['Primera fertilización', 'Segunda fertilización', 'Foliar', 'Corrección']},
    {id: 'ejecucion', label: 'Estado de ejecución', type: 'choice', options: ['Pendiente', 'En ejecución', 'Ejecutada']}]},
  {id: 'riego', label: 'Riego', icon: 'riego', suggested: 'Media', water: 'riego', details: [
    {id: 'sistema', label: 'Sistema', type: 'choice', options: ['Gravedad', 'Aspersión', 'Pivote', 'Goteo', 'Otro']},
    {id: 'problema', label: 'Problema observado', type: 'multi', options: ['Déficit', 'Exceso', 'Falta de uniformidad', 'Infiltración deficiente', 'Fuga o daño del sistema']},
    {id: 'ultimoRiego', label: 'Último riego informado', type: 'date'},
    {id: 'areaAfectada', label: 'Área afectada', type: 'number', unit: 'ha', min: 0}]},
  {id: 'estres', label: 'Estrés hídrico', icon: 'estres', suggested: 'Media', details: [
    {id: 'sintomas', label: 'Síntomas', type: 'multi', options: ['Enrollamiento de hojas', 'Hojas secas', 'Bajo crecimiento', 'Entrenudos cortos']},
    {id: 'intensidad', label: 'Intensidad', type: 'choice', options: LEVEL3},
    {id: 'humedad', label: 'Humedad del suelo', type: 'choice', options: ['Seco', 'Adecuado', 'Exceso']},
    {id: 'areaAfectada', label: 'Área afectada', type: 'number', unit: 'ha', min: 0}]},
  {id: 'despoblacion', label: 'Despoblación', icon: 'despoblacion', suggested: 'Media', details: [
    {id: 'poblacion', label: 'Población observada', type: 'number', unit: 'tallos/m', min: 0},
    {id: 'fallas', label: 'Fallas', type: 'number', unit: '%', min: 0, max: 100},
    {id: 'distribucion', label: 'Distribución', type: 'choice', options: DIST},
    {id: 'areaAfectada', label: 'Área afectada', type: 'number', unit: 'ha', min: 0}]},
  {id: 'resiembra', label: 'Resiembra', icon: 'resiembra', suggested: 'Media', details: [
    {id: 'sector', label: 'Sector', type: 'text'},
    {id: 'area', label: 'Área', type: 'number', unit: 'ha', min: 0},
    {id: 'semilla', label: 'Necesidad de semilla', type: 'text', hint: 'Ej.: 20 t de CP 72-2086'},
    {id: 'estadoLabor', label: 'Estado de la labor', type: 'choice', options: ['Pendiente', 'Programada', 'En ejecución', 'Ejecutada']}]},
  {id: 'siembra', label: 'Siembra', icon: 'siembra', suggested: 'Baja', details: [
    {id: 'etapa', label: 'Etapa', type: 'choice', options: ['Preparación de suelo', 'Surcado', 'Siembra', 'Tapado', 'Germinación']},
    {id: 'variedad', label: 'Variedad sembrada', type: 'text'},
    {id: 'area', label: 'Área', type: 'number', unit: 'ha', min: 0}]},
  {id: 'labores', label: 'Labores agrícolas', icon: 'labores', suggested: 'Baja', details: [
    {id: 'labor', label: 'Labor', type: 'text', hint: 'Ej.: cultivo, aporque, limpia'},
    {id: 'tipo', label: 'Tipo', type: 'choice', options: ['Manual', 'Mecanizada']},
    {id: 'calidad', label: 'Calidad de ejecución', type: 'choice', options: ['Buena', 'Regular', 'Deficiente']},
    {id: 'estadoLabor', label: 'Estado', type: 'choice', options: ['Pendiente', 'En ejecución', 'Ejecutada']}]},
  {id: 'cosecha', label: 'Cosecha', icon: 'cosecha', suggested: 'Baja', details: [
    {id: 'condicion', label: 'Condición observada', type: 'multi', options: ['Caña quemada', 'Caña en pie', 'Acame', 'Rebrote', 'Residuos en campo']},
    {id: 'programacion', label: 'Programación', type: 'choice', options: ['Según plan', 'Adelantada', 'Atrasada', 'Sin programar']},
    {id: 'pendiente', label: 'Área pendiente', type: 'number', unit: 'ha', min: 0},
    {id: 'calidad', label: 'Calidad de ejecución', type: 'choice', options: ['Buena', 'Regular', 'Deficiente']}]},
  {id: 'madurantes', label: 'Madurantes', icon: 'madurantes', suggested: 'Baja', details: [
    {id: 'producto', label: 'Producto', type: 'text'},
    {id: 'aplicacion', label: 'Aplicación', type: 'choice', options: ['Pendiente', 'Programada', 'Aplicada']},
    {id: 'fecha', label: 'Fecha de aplicación', type: 'date'}]},
  {id: 'drenaje', label: 'Drenaje', icon: 'drenaje', suggested: 'Media', details: [
    {id: 'problema', label: 'Problema', type: 'multi', options: ['Encharcamiento', 'Drenes obstruidos', 'Erosión', 'Nivel freático alto']},
    {id: 'areaAfectada', label: 'Área afectada', type: 'number', unit: 'ha', min: 0}]},
  {id: 'semilleros', label: 'Semilleros', icon: 'semilleros', suggested: 'Baja', details: [
    {id: 'variedad', label: 'Variedad', type: 'text'},
    {id: 'condicion', label: 'Condición', type: 'choice', options: ['Buena', 'Regular', 'Deficiente']},
    {id: 'disponible', label: 'Semilla disponible estimada', type: 'number', unit: 't', min: 0}]},
  {id: 'renovacion', label: 'Renovación', icon: 'renovacion', suggested: 'Baja', details: [
    {id: 'motivo', label: 'Motivo', type: 'multi', options: ['Baja población', 'Bajo TCH', 'Número de cortes', 'Cambio de variedad']},
    {id: 'propuesta', label: 'Zafra propuesta', type: 'text', hint: 'Ej.: 27/28'}]},
  {id: 'caminos', label: 'Caminos y accesos', icon: 'caminos', suggested: 'Baja', details: [
    {id: 'problema', label: 'Problema', type: 'multi', options: ['Intransitable', 'Baches', 'Puente o alcantarilla dañada', 'Maleza en camino']},
    {id: 'impacto', label: 'Impacto en cosecha', type: 'choice', options: ['Sin impacto', 'Limita el acceso', 'Impide el acceso']}]},
  {id: 'desarrollo', label: 'Desarrollo del cultivo', icon: 'desarrollo', suggested: 'Baja', details: [
    {id: 'condicion', label: 'Condición general', type: 'choice', options: ['Buena', 'Regular', 'Deficiente']},
    {id: 'altura', label: 'Altura aproximada', type: 'number', unit: 'm', min: 0},
    {id: 'uniformidad', label: 'Uniformidad', type: 'choice', options: ['Uniforme', 'Variable', 'Muy variable']},
    {id: 'acame', label: 'Acame', type: 'number', unit: '%', min: 0, max: 100}]},
  {id: 'atencion', label: 'Atención al productor', icon: 'atencion', suggested: 'Baja', details: [
    {id: 'tema', label: 'Tema', type: 'multi', options: ['Consulta técnica', 'Reclamo', 'Pago o liquidación', 'Programación', 'Capacitación']},
    {id: 'acuerdo', label: 'Acuerdo alcanzado', type: 'text'}]},
  {id: 'seguimiento', label: 'Seguimiento', icon: 'seguimiento', suggested: 'Baja', details: []},
  {id: 'otros', label: 'Otros', icon: 'otros', suggested: 'Baja', details: [{id: 'tema', label: 'Tema', type: 'text'}]},
];
/* Familias de hallazgos (identidad propia de Visitas): agrupan el catálogo y le dan color e iconografía de familia. */
export const FAMILIES = {
  cultivo: {label: 'Cultivo', color: '#3E7B4F', soft: '#E7F2EA', ids: ['desarrollo', 'malezas', 'fertilizacion', 'despoblacion', 'resiembra', 'siembra', 'renovacion', 'semilleros']},
  sanidad: {label: 'Sanidad', color: '#A3472A', soft: '#F8EAE4', ids: ['plagas', 'enfermedades']},
  agua: {label: 'Agua', color: '#2A6496', soft: '#E4EEF7', ids: ['riego', 'estres', 'drenaje']},
  labores: {label: 'Labores y cosecha', color: '#9A6A0E', soft: '#F7EFDC', ids: ['labores', 'cosecha', 'madurantes', 'caminos']},
  gestion: {label: 'Gestión', color: '#1B4D5C', soft: '#E3EEF1', ids: ['atencion', 'seguimiento', 'otros']},
};
export const familyOf = id => Object.entries(FAMILIES).find(([, f]) => f.ids.includes(id))?.[0] || 'gestion';
export const familyStyle = id => FAMILIES[familyOf(id)];
/* Avance de un hallazgo dentro de la gestión técnica (no es impacto agronómico; es el estado del trámite). */
export const PROGRESS = ['Observado', 'Recomendado', 'En ejecución', 'Verificado'];
export function progressOf(finding, followups = []) {
  const recs = followups.filter(f => f.findingId === finding.id && f.kind !== 'compromiso' && !/Cancel/.test(f.state));
  if (finding.status === 'Verificado' || recs.some(r => r.state === 'Verificado')) return 3;
  if (recs.some(r => ['Ejecutado', 'Atendida', 'Programado', 'En gestión'].includes(r.state)) || finding.status === 'Resuelto') return 2;
  if (recs.length) return 1;
  return 0;
}
export const DEFAULT_FAVORITES = ['malezas', 'plagas', 'riego', 'estres', 'fertilizacion', 'despoblacion', 'cosecha', 'seguimiento'];
export const category = id => CATEGORIES.find(c => c.id === id) || CATEGORIES.at(-1);
export const SEVERITY = LEVEL3;

/** Detalles con valor: se omiten los vacíos (no se informan campos no evaluados). */
export function filledDetails(cat, details = {}) {
  return (category(cat).details || []).map(f => ({f, v: details[f.id]})).filter(({v}) => Array.isArray(v) ? v.length : v !== undefined && v !== null && String(v).trim() !== '')
    .map(({f, v}) => ({id: f.id, label: f.label, value: Array.isArray(v) ? v.join(', ') : f.type === 'number' ? `${Number(v).toLocaleString('es-NI', {maximumFractionDigits: 2})}${f.unit ? ' ' + f.unit : ''}` : String(v)}));
}

export const REQUEST_TYPES = [
  {id: 'fertilizantes', label: 'Fertilizantes', fields: ['producto', 'cantidad', 'area']},
  {id: 'herbicidas', label: 'Herbicidas', fields: ['producto', 'cantidad', 'area']},
  {id: 'insumos', label: 'Otros insumos', fields: ['producto', 'cantidad']},
  {id: 'riego', label: 'Riego', fields: ['area']},
  {id: 'mecanizadas', label: 'Labores mecanizadas', fields: ['producto', 'area']},
  {id: 'manuales', label: 'Labores manuales', fields: ['producto', 'area']},
  {id: 'resiembra', label: 'Resiembra', fields: ['area', 'cantidad']},
  {id: 'semilla', label: 'Semilla', fields: ['producto', 'cantidad']},
  {id: 'planimetria', label: 'Planimetría', fields: ['area']},
  {id: 'asistencia', label: 'Asistencia técnica', fields: []},
  {id: 'cosecha', label: 'Cosecha', fields: ['area']},
  {id: 'otras', label: 'Otras necesidades', fields: ['producto', 'cantidad']},
];
export const requestType = id => REQUEST_TYPES.find(r => r.id === id) || REQUEST_TYPES.at(-1);
export const UNITS = ['qq', 'kg', 'L', 'sacos', 't', 'ha', 'mz', 'horas', 'jornales', 'unidades'];
export const PRIORITY = ['Alta', 'Media', 'Baja'];

/* Estados. Una recomendación no es una labor ejecutada; una solicitud no es una entrega. No se generan registros
   SIAGRI, órdenes ni despachos: los cambios de estado los declara una persona, con nota opcional. */
export const STATES = {
  recomendacion: ['Pendiente', 'En gestión', 'Programado', 'Ejecutado', 'Verificado', 'Cancelado'],
  solicitud: ['Solicitada', 'En gestión', 'Atendida', 'Rechazada', 'Cancelada'],
  compromiso: ['Pendiente', 'Cumplido', 'Incumplido', 'Cancelado'],
  hallazgo: ['Abierto', 'En seguimiento', 'Resuelto', 'Verificado'],
};
export const OPEN = new Set(['Pendiente', 'En gestión', 'Programado', 'Solicitada', 'Abierto', 'En seguimiento']);
export const CLOSED_OK = new Set(['Ejecutado', 'Verificado', 'Atendida', 'Cumplido', 'Resuelto']);
export const KIND = {recomendacion: {label: 'Recomendación', plural: 'Recomendaciones', icon: 'check'}, solicitud: {label: 'Solicitud', plural: 'Solicitudes', icon: 'clipboard'},
  compromiso: {label: 'Compromiso', plural: 'Compromisos', icon: 'flag'}};
export const PHOTO_ROLES = {inicial: 'Evidencia inicial', seguimiento: 'Seguimiento', verificacion: 'Verificación'};
