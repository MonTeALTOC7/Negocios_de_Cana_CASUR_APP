const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
export function calendarDate(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$)/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0,10) !== `${year}-${month}-${day}` || !Number.isFinite(Date.parse(value))) return null;
  return `${day}-${MONTHS[Number(month)-1]}-${year}`;
}

// Never use CASUR_RELEASE: it may advertise a generation not yet applied.
export function effectiveChronoDate(data) {
  const meta = data?.meta || {};
  const published = calendarDate(meta.publishedAt);
  const generated = calendarDate(meta.generated);
  const date = published || generated;
  const provenance = published ? 'Publicación de datos' : generated ? 'Generación de datos (publicación no acreditada)' : 'Sin fecha de publicación o generación válida';
  return { text: date ? `Cronológico ${date}` : 'Cronológico: fecha N/D',
    detail: `${provenance}${meta.dataVersion ? ` · ${meta.dataVersion}` : ''}. Cronológico efectivo en memoria.` };
}
