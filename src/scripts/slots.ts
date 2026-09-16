/*
 * Drop-off slot generation for the repair booking.
 *
 * Pure and dependency-free, so it can be tested without a browser and without
 * the London clock lying about what "today" is. The one non-obvious piece is
 * the timezone handling below — read that comment before changing anything
 * here.
 *
 * What this deliberately does NOT do: reserve anything. There is no server
 * and no database (CLAUDE.md 3), so two customers can choose the same slot,
 * and the copy that presents these has to say "we will confirm your
 * drop-off", never "booked" — see copy.json `repairs.step3.slotIntro`.
 */

export interface ShopHoursBlock {
  days: readonly string[];
  opens: string; // "HH:MM"
  closes: string; // "HH:MM"
}

export interface SlotsConfig {
  daysAhead: number;
  /** The hour (0-23) that splits a day into morning and afternoon. */
  middayHour: number;
  morningLabel: string;
  afternoonLabel: string;
}

export type SlotPart = 'morning' | 'afternoon';

export interface SlotOption {
  part: SlotPart;
  label: string;
  opens: string;
  closes: string;
}

export interface SlotDay {
  /** ISO date, e.g. "2026-09-21" — the London calendar date. */
  date: string;
  /** e.g. "Monday" */
  weekday: string;
  slots: SlotOption[];
}

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/*
 * The shop is in Edgware and every hour in site.json is a London wall-clock
 * time. A customer's device can be in any timezone — a phone left on its
 * factory locale, a laptop set to UTC — and `daysAhead` has to count London
 * calendar days from London's idea of "now", not the visitor's.
 *
 * `Intl.DateTimeFormat` with `timeZone: 'Europe/London'` is built in and
 * handles the BST/GMT transition correctly without a dependency (rule 2.8).
 */
const LONDON_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const LONDON_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "2026-09-21" for the London calendar date at this instant. */
export function londonDateString(now: number): string {
  // en-CA formats as YYYY-MM-DD directly; no reassembly of parts needed.
  return LONDON_DATE.format(now);
}

/** Minutes since midnight, London wall-clock time. */
export function londonMinutesOfDay(now: number): number {
  const parts = LONDON_TIME.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/*
 * Adds `days` London calendar days to a date string, returning a new date
 * string. Built on UTC noon rather than midnight so the +1-day arithmetic
 * never lands on the wrong side of a DST transition — midnight London time on
 * the day clocks change is the one moment `Date` and "the next calendar day"
 * can disagree.
 */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const noon = Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + days, 12);
  return londonDateString(noon);
}

/** The weekday name for a London calendar date, e.g. "2026-09-21" -> "Monday". */
export function weekdayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  // Noon UTC for the same reason as addDays: immune to the date shifting a
  // day either way under a timezone offset.
  const day = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1, 12)).getUTCDay();
  return WEEKDAYS[day] ?? '';
}

/** The opening hours for a given weekday, or null if the shop is closed that day. */
export function hoursFor(
  weekday: string,
  hours: readonly ShopHoursBlock[],
): ShopHoursBlock | null {
  return hours.find((block) => block.days.includes(weekday)) ?? null;
}

export interface GenerateSlotsOptions {
  now: number;
  hours: readonly ShopHoursBlock[];
  /** Dates the shop is additionally closed — bank holidays plus site.json `closures`. */
  closedDates: ReadonlySet<string>;
  config: SlotsConfig;
}

/*
 * The next `daysAhead` London calendar days that (a) the shop is open and
 * (b) still have at least one slot whose end time has not passed. A day that
 * is closed, or one whose slots have all already gone by (checking out at
 * 16:45 on a day that shuts at 17:00), is left out entirely rather than shown
 * empty — an empty day the customer can still click is a worse UI than one
 * fewer day in the list.
 */
export function generateSlotDays(options: GenerateSlotsOptions): SlotDay[] {
  const { now, hours, closedDates, config } = options;
  const today = londonDateString(now);
  const nowMinutes = londonMinutesOfDay(now);
  const days: SlotDay[] = [];

  for (let offset = 0; offset < config.daysAhead; offset += 1) {
    const date = addDays(today, offset);
    if (closedDates.has(date)) continue;

    const weekday = weekdayOf(date);
    const block = hoursFor(weekday, hours);
    if (!block) continue;

    const opens = toMinutes(block.opens);
    const closes = toMinutes(block.closes);
    const midday = Math.min(Math.max(config.middayHour * 60, opens), closes);

    const candidates: SlotOption[] = [
      { part: 'morning', label: config.morningLabel, opens: block.opens, closes: minutesToHHMM(midday) },
      { part: 'afternoon', label: config.afternoonLabel, opens: minutesToHHMM(midday), closes: block.closes },
    ];

    const slots = candidates.filter((slot) => {
      // Only today's slots can have already passed — every later day is
      // entirely in the future.
      if (date !== today) return true;
      return toMinutes(slot.closes) > nowMinutes;
    });

    if (slots.length > 0) days.push({ date, weekday, slots });
  }

  return days;
}

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

/** True if `date`/`part` is still a real, unexpired choice given `days`. */
export function isValidSlot(days: readonly SlotDay[], date: string, part: SlotPart): boolean {
  return days.some((day) => day.date === date && day.slots.some((slot) => slot.part === part));
}

/** Full month name for a 1-indexed month number — a fixed year, since only the month is read. */
function monthName(month1: number): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(
    Date.UTC(2000, month1 - 1, 1),
  );
}

/** e.g. "Monday 21 September" — for display once a slot is chosen. */
export function formatSlotDay(dateStr: string, weekday: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${weekday} ${d} ${monthName(m ?? 1)}`;
}

// --- calendar-grid arithmetic (day picker, month view) ----------------------
//
// Pure Gregorian calendar math — deliberately NOT timezone-aware. "September
// 2026" is a fixed calendar concept once a date string names it; the London
// clock only matters for deciding which individual dates are open at all,
// and that is already baked into the date strings `generateSlotDays`
// returns. Everything here just lays those dates out as a grid.

export interface MonthKey {
  year: number;
  /** 0-indexed, matching `Date`'s own convention. */
  month: number;
}

/** The calendar month a "YYYY-MM-DD" string falls in. */
export function monthOf(dateStr: string): MonthKey {
  const [year, month] = dateStr.split('-').map(Number);
  return { year: year ?? 0, month: (month ?? 1) - 1 };
}

/** e.g. "September 2026". */
export function monthLabel(key: MonthKey): string {
  return `${monthName(key.month + 1)} ${key.year}`;
}

/** Number of days in the given month (28-31). */
export function daysInMonth(key: MonthKey): number {
  // Day 0 of the following month is the last day of this one.
  return new Date(Date.UTC(key.year, key.month + 1, 0)).getUTCDate();
}

/**
 * Which column (0 = Monday .. 6 = Sunday) the 1st of the month falls in — UK
 * calendars read Monday-first, unlike `Date.getUTCDay()`'s Sunday-first.
 */
export function mondayIndexOfFirst(key: MonthKey): number {
  const sundayFirst = new Date(Date.UTC(key.year, key.month, 1)).getUTCDay();
  return (sundayFirst + 6) % 7;
}

/** "YYYY-MM-DD" for a given day number (1-31) within the month. */
export function dateInMonth(key: MonthKey, day: number): string {
  const mm = String(key.month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${key.year}-${mm}-${dd}`;
}

/** Adds (or subtracts, with a negative delta) whole months, rolling the year over. */
export function shiftMonth(key: MonthKey, delta: number): MonthKey {
  const total = key.year * 12 + key.month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** Negative if `a` is before `b`, positive if after, 0 if the same month. */
export function compareMonths(a: MonthKey, b: MonthKey): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}
