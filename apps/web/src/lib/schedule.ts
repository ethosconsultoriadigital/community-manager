/** Valor por defecto para input datetime-local (mañana a las 10:00, hora local). */
export function defaultScheduleValue() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convierte scheduled_at ISO a valor datetime-local. */
export function scheduleValueFromIso(iso: string | null | undefined) {
  if (!iso) return defaultScheduleValue();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return defaultScheduleValue();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
