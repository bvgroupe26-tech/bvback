/**
 * Convention : les dates « jour » (présence, absence, dépense…) sont stockées à minuit UTC
 * du jour civil concerné. « Aujourd'hui » et l'année/mois courants sont calculés dans le
 * fuseau de l'entreprise, pas dans celui du serveur (Render tourne en UTC).
 */
export const APP_TIMEZONE = 'Africa/Brazzaville';

const DAY_MS = 24 * 60 * 60 * 1000;

const localDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** AAAA-MM-JJ du jour civil de `date` dans le fuseau de l'entreprise. */
export function toLocalISODate(date: Date = new Date()): string {
  return localDateFormatter.format(date);
}

export function todayISO(): string {
  return toLocalISODate(new Date());
}

export function currentLocalYear(): number {
  return Number(todayISO().slice(0, 4));
}

/** Mois courant "01".."12" dans le fuseau de l'entreprise. */
export function currentLocalMonth(): string {
  return todayISO().slice(5, 7);
}

/** "2026-05-15" (ou ISO complet) → minuit UTC du jour civil. */
export function parseDateOnly(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }
  const datePart = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : toLocalISODate(new Date(value));
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function startOfDayUTC(value: string | Date): Date {
  return parseDateOnly(value);
}

export function endOfDayUTC(value: string | Date): Date {
  return new Date(parseDateOnly(value).getTime() + DAY_MS - 1);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Bornes [1er janvier, 31 décembre 23:59:59.999] UTC d'une année. */
export function yearBoundsUTC(year: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year + 1, 0, 1) - 1),
  };
}

/** Bornes UTC d'un mois ("01".."12" ou 1..12). */
export function monthBoundsUTC(
  year: number,
  month: number | string,
): { start: Date; end: Date } {
  const m = Number(month) - 1;
  return {
    start: new Date(Date.UTC(year, m, 1)),
    end: new Date(Date.UTC(year, m + 1, 1) - 1),
  };
}

/** Nombre de jours ouvrés (lundi→vendredi) entre deux dates « jour », bornes incluses. */
export function countBusinessDays(debut: Date | string, fin: Date | string): number {
  const start = parseDateOnly(debut);
  const end = parseDateOnly(fin);
  if (end < start) return 0;

  let count = 0;
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}
