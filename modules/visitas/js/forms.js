/* Definición declarativa del formulario de visita. Los campos aparecen según el motivo y el contexto hídrico
   (riego o secano, tomado del tipo de riego original del Maestro). Nada es obligatorio salvo productor y motivo:
   el técnico completa solo lo pertinente. No hay recomendaciones automáticas. */

export const REASONS = [
  {id: 'seguimiento', label: 'Seguimiento general'},
  {id: 'cultivo', label: 'Evaluación del cultivo'},
  {id: 'riego', label: 'Riego y humedad'},
  {id: 'nutricion', label: 'Fertilización y nutrición'},
  {id: 'malezas', label: 'Control de malezas'},
  {id: 'sanidad', label: 'Plagas y enfermedades'},
  {id: 'cosecha', label: 'Precosecha y cosecha'},
  {id: 'siembra', label: 'Preparación y siembra'},
  {id: 'solicitud', label: 'Atención a solicitud del productor'},
  {id: 'otro', label: 'Otro motivo'},
];
export const reasonLabel = id => REASONS.find(r => r.id === id)?.label || '';

const LEVEL = ['Bajo', 'Medio', 'Alto'];
/* when(ctx): ctx = {reason, water: 'riego'|'secano'|'mixto'|'sin-dato'} */
export const FIELDS = [
  {id: 'condicion', label: 'Condición general del cultivo', type: 'choice', options: ['Buena', 'Regular', 'Deficiente'], when: c => ['seguimiento', 'cultivo', 'nutricion', 'cosecha'].includes(c.reason)},
  {id: 'etapa', label: 'Etapa fenológica', type: 'choice', options: ['Germinación', 'Macollamiento', 'Gran crecimiento', 'Maduración'], when: c => ['seguimiento', 'cultivo', 'nutricion', 'malezas', 'sanidad'].includes(c.reason)},
  {id: 'humedad', label: 'Humedad del suelo', type: 'choice', options: ['Seco', 'Adecuado', 'Exceso'], when: c => ['seguimiento', 'riego', 'cultivo', 'siembra'].includes(c.reason)},
  {id: 'sistemaRiego', label: 'Estado del sistema de riego', type: 'choice', options: ['Operando', 'Con fallas', 'Sin operar'], when: c => c.reason === 'riego' && c.water !== 'secano'},
  {id: 'ultimoRiego', label: 'Fecha del último riego informado', type: 'date', when: c => c.reason === 'riego' && c.water !== 'secano'},
  {id: 'drenaje', label: 'Drenaje', type: 'choice', options: ['Bueno', 'Encharcamiento parcial', 'Encharcamiento severo'], when: c => ['riego', 'seguimiento'].includes(c.reason) && c.water !== 'riego'},
  {id: 'estresHidrico', label: 'Estrés hídrico visible', type: 'choice', options: ['No', 'Leve', 'Severo'], when: c => ['riego', 'cultivo', 'seguimiento'].includes(c.reason)},
  {id: 'malezas', label: 'Nivel de malezas', type: 'choice', options: LEVEL, when: c => ['seguimiento', 'malezas', 'cultivo'].includes(c.reason)},
  {id: 'malezasTipo', label: 'Malezas predominantes', type: 'text', when: c => c.reason === 'malezas'},
  {id: 'plagas', label: 'Plagas o daño observado', type: 'choice', options: ['Sin daño', 'Leve', 'Moderado', 'Severo'], when: c => ['seguimiento', 'sanidad', 'cultivo'].includes(c.reason)},
  {id: 'plagaTipo', label: 'Plaga o enfermedad identificada', type: 'text', when: c => c.reason === 'sanidad'},
  {id: 'deficiencia', label: 'Síntomas de deficiencia nutricional', type: 'choice', options: ['No', 'Leves', 'Marcados'], when: c => c.reason === 'nutricion'},
  {id: 'acame', label: 'Acame (%)', type: 'number', min: 0, max: 100, when: c => ['cosecha', 'cultivo'].includes(c.reason)},
  {id: 'quema', label: 'Riesgo de quema o incendio', type: 'choice', options: ['No', 'Sí'], when: c => c.reason === 'cosecha'},
  {id: 'preparacion', label: 'Estado de la preparación de suelo', type: 'choice', options: ['Pendiente', 'En proceso', 'Terminada'], when: c => c.reason === 'siembra'},
  {id: 'solicitudProductor', label: 'Qué solicitó el productor', type: 'textarea', when: c => c.reason === 'solicitud'},
];
export const fieldsFor = ctx => FIELDS.filter(f => f.when(ctx));

/** Contexto hídrico de las suertes visitadas, a partir del tipo de riego original del Maestro. */
export function waterContext(records) {
  const types = records.map(r => String(r?.attributes?.irrigationType || '').toLowerCase()).filter(Boolean);
  if (!types.length) return 'sin-dato';
  const secano = types.filter(t => /secano/.test(t)).length;
  return secano === types.length ? 'secano' : secano === 0 ? 'riego' : 'mixto';
}
export const WATER_LABEL = {riego: 'Con riego', secano: 'Secano', mixto: 'Riego y secano', 'sin-dato': 'Sin dato de riego'};

export const FINDING_CATEGORIES = ['Cultivo', 'Riego y drenaje', 'Nutrición', 'Malezas', 'Plagas y enfermedades', 'Infraestructura', 'Cosecha', 'Otro'];
export const SEVERITY = ['Baja', 'Media', 'Alta'];
export const PRIORITY = ['Alta', 'Media', 'Baja'];
export const REQUEST_TYPES = ['Insumos', 'Riego', 'Labores', 'Maquinaria', 'Información', 'Otro'];

/* Estados. Una recomendación no es una labor ejecutada y una solicitud no es una entrega: no se crean registros SIAGRI,
   órdenes ni entregas. «Ejecutado» o «Atendida» los declara una persona, con nota. */
export const STATES = {
  recomendacion: ['Pendiente', 'En gestión', 'Programado', 'Ejecutado', 'Verificado', 'Cancelado'],
  solicitud: ['Solicitada', 'En gestión', 'Atendida', 'Rechazada', 'Cancelada'],
  compromiso: ['Pendiente', 'Cumplido', 'Incumplido', 'Cancelado'],
};
export const OPEN_STATES = new Set(['Pendiente', 'En gestión', 'Programado', 'Solicitada']);
export const KIND_LABEL = {recomendacion: 'Recomendación', solicitud: 'Solicitud', compromiso: 'Compromiso'};
