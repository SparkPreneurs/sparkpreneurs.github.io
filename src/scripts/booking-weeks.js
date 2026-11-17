export function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Choose a valid starting Monday.');
  const date = new Date(value + 'T12:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Choose a valid starting Monday.');
  return date;
}
export function nextMonday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = type => parts.find(p => p.type === type).value;
  const date = parseDate(`${part('year')}-${part('month')}-${part('day')}`);
  date.setUTCDate(date.getUTCDate() + ((8 - date.getUTCDay()) % 7 || 7));
  return date.toISOString().slice(0, 10);
}
export function bookingWeeks(start, count, calendar = {}) {
  const date = parseDate(start);
  if (date.getUTCDay() !== 1) throw new Error('Choose a Monday as your starting week.');
  if (!Number.isInteger(count) || count < 4 || count > 12) throw new Error('Choose between 4 and 12 whole weeks.');
  if (start < nextMonday() || (calendar.firstWeek && start < calendar.firstWeek)) throw new Error('Choose an upcoming available week.');
  return Array.from({ length: count }, (_, index) => {
    const week = new Date(date);
    week.setUTCDate(week.getUTCDate() + index * 7);
    const iso = week.toISOString().slice(0, 10);
    if (calendar.lastWeek && iso > calendar.lastWeek) throw new Error('Your selection extends beyond the program calendar. Choose fewer weeks or an earlier start.');
    if (calendar.closedWeeks?.includes(iso)) throw new Error(`The week of ${dateLabel(iso)} is closed. Choose a different consecutive block.`);
    if (calendar.unavailableWeeks?.includes(iso) || calendar.weeklyCapacity === 0) throw new Error(`The week of ${dateLabel(iso)} is fully booked. Choose a different starting week or duration.`);
    return iso;
  });
}
export const dateLabel = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(parseDate(value));
