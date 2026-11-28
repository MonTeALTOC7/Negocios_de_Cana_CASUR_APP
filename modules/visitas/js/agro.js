/* Datos agronómicos derivados de la instantánea del Maestro, siempre a la FECHA DE LA VISITA (sirve para visitas
   retrospectivas). Nada se inventa: si falta una fecha o la suerte no tiene caña, el resultado es «desconocido».

   Etapa fenológica PROBABLE por edad (no es una evaluación de campo y no determina madurez industrial).
   Rangos de trabajo, preliminares hasta su validación por el equipo agronómico de CASUR, tomados de la descripción
   clásica de las fases de la caña (germinación/brotación, macollamiento, gran crecimiento, maduración) para ciclos
   de ~12 meses en trópico seco con riego o secano. La soca brota y macolla antes que la planta porque parte de cepas
   establecidas:
     Planta: 0–35 d germinación · 36–120 d macollamiento · 121–270 d gran crecimiento · > 270 d maduración probable.
     Soca:   0–30 d brotación   · 31–100 d macollamiento · 101–260 d gran crecimiento · > 260 d maduración probable.
   En secano el macollamiento y el gran crecimiento dependen de las lluvias; por eso la etapa se presenta como
   «probable» y el técnico puede corregirla (se conservan el cálculo y la corrección). */
const NO_CANE = new Set(['Sin Caña', 'Baja definitiva', 'Ausente de la fuente', 'Baja rentabilidad']);
export const STAGES = ['Germinación / brotación', 'Macollamiento', 'Gran crecimiento', 'Maduración probable'];
const RANGES = {planta: [35, 120, 270], soca: [30, 100, 260]};
const DAY = 86400000;
const day = iso => { const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; };

/** Inicio del ciclo vigente a la fecha `at`: la más reciente entre siembra y último corte que no sea posterior. */
export function cropCycle(record, at = new Date().toISOString()) {
  const a = record?.attributes || {}, ref = day(at);
  const planting = day(a.plantingDate), cut = day(a.lastCutDate);
  // Si el Maestro registra una siembra o un corte POSTERIOR a la fecha consultada, no describe el ciclo de esa fecha
  // (pudo haber cortes intermedios que no conocemos): la edad queda desconocida, nunca se estima con datos actuales.
  if ((planting !== null && planting > ref) || (cut !== null && cut > ref)) return null;
  const options = [planting !== null && {t: planting, kind: 'siembra'}, cut !== null && {t: cut, kind: 'corte'}].filter(Boolean);
  if (!options.length) return null;
  const start = options.sort((x, y) => y.t - x.t)[0];
  // Planta: el ciclo arranca en la siembra (o el último corte coincide con ella). Soca: arranca en un corte posterior.
  const type = start.kind === 'siembra' || (planting !== null && cut !== null && cut <= planting) ? 'planta' : 'soca';
  return {startIso: new Date(start.t).toISOString().slice(0, 10), basis: start.kind, type, ageDays: Math.floor((ref - start.t) / DAY)};
}

export function phenology(record, at = new Date().toISOString()) {
  if (!record) return null;
  const state = record.state?.operationalState;
  if (NO_CANE.has(state)) return {stage: null, reason: `Suerte ${String(state).toLowerCase()}`};
  const c = cropCycle(record, at);
  if (!c) return {stage: null, reason: 'Sin historial suficiente para esa fecha'};
  const [g, m, gc] = RANGES[c.type];
  const stage = c.ageDays <= g ? STAGES[0] : c.ageDays <= m ? STAGES[1] : c.ageDays <= gc ? STAGES[2] : STAGES[3];
  return {stage, ageDays: c.ageDays, type: c.type, startIso: c.startIso, atypical: c.ageDays > 450, basis: 'edad'};
}

export const ageLabel = days => days === null || days === undefined ? '—' : days < 60 ? `${days} días` : `${(days / 30.44).toLocaleString('es-NI', {minimumFractionDigits: 1, maximumFractionDigits: 1})} meses`;

/** Datos de la ficha agronómica compacta. Solo pares con valor; los desconocidos se omiten o se marcan «—». */
/** Fecha de los datos del Maestro con que se armó el registro (fuente del aforo/cronológico). */
export const dataDateOf = record => record?.provenance?.sourceDate || null;
export function agroCard(record, at) {
  if (!record) return null;
  const a = record.attributes, ph = phenology(record, at), c = cropCycle(record, at);
  // Visita anterior a la fecha de los datos: lo que cambia con el tiempo (estado, destino, corte, estimado, plan) no se
  // atribuye a esa fecha; solo se muestran atributos estables, identificados como «según el Maestro al …».
  const dataDate = dataDateOf(record), historical = !!(dataDate && at && String(at).slice(0, 10) < dataDate);
  const base = {
    lot: record.identity.lot, farm: record.farm?.name, code: record.identity.farmCode, zone: record.farm?.zone,
    area: a.area, variety: a.variety, texture: a.texture, irrigation: a.irrigationType, planting: a.plantingDate, lastCut: a.lastCutDate,
    age: c?.ageDays ?? null, cuts: a.cut, type: c?.type ?? null, state: record.state?.operationalState, destination: a.destination,
    tchPrev: record.executed?.tch ?? record.layers?.executed?.tch ?? null, prevSeason: record.executed?.season ?? record.layers?.executed?.season ?? null,
    tchEst: record.estimate?.available ? record.estimate.tch : null, estSeason: record.estimate?.season ?? null,
    harvest: record.plan?.date ?? record.layers?.plan?.date?.iso ?? null, phenology: ph,
  };
  return historical ? {...base, historical, dataDate, state: null, destination: null, cuts: null, tchEst: null, harvest: null} : {...base, historical, dataDate};
}
