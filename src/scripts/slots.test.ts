import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareMonths,
  dateInMonth,
  daysInMonth,
  formatSlotDay,
  generateSlotDays,
  hoursFor,
  isValidSlot,
  londonDateString,
  londonMinutesOfDay,
  mondayIndexOfFirst,
  monthLabel,
  monthOf,
  shiftMonth,
  weekdayOf,
  type ShopHoursBlock,
} from './slots.ts';

const HOURS: ShopHoursBlock[] = [
  {
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    opens: '09:00',
    closes: '17:00',
  },
  { days: ['Saturday'], opens: '10:00', closes: '16:00' },
];

const CONFIG = { daysAhead: 14, middayHour: 13, morningLabel: 'Morning', afternoonLabel: 'Afternoon' };

// A known Monday at 10:00 UTC, which is 11:00 BST (August, so daylight saving
// is in effect) — chosen so "today" and "current time" are both unambiguous.
const MONDAY_MORNING = Date.UTC(2026, 7, 24, 10, 0); // 2026-08-24 is a Monday

test('weekdayOf reads the calendar date, not a UTC-shifted one', () => {
  assert.equal(weekdayOf('2026-08-24'), 'Monday');
  assert.equal(weekdayOf('2026-08-29'), 'Saturday');
  assert.equal(weekdayOf('2026-08-30'), 'Sunday');
});

test('londonDateString and londonMinutesOfDay agree with the London clock, not UTC', () => {
  // 23:30 UTC in August is 00:30 BST the next day.
  const lateUtc = Date.UTC(2026, 7, 24, 23, 30);
  assert.equal(londonDateString(lateUtc), '2026-08-25');
  assert.equal(londonMinutesOfDay(lateUtc), 30);
});

test('hoursFor returns null for a day the shop does not open', () => {
  assert.equal(hoursFor('Sunday', HOURS), null);
  assert.notEqual(hoursFor('Saturday', HOURS), null);
});

test('Sundays never appear in the generated days', () => {
  const days = generateSlotDays({
    now: MONDAY_MORNING,
    hours: HOURS,
    closedDates: new Set(),
    config: CONFIG,
  });
  assert.ok(!days.some((day) => day.weekday === 'Sunday'));
});

test('a closed date (bank holiday or client closure) is skipped entirely', () => {
  // The Tuesday right after our Monday.
  const closed = new Set(['2026-08-25']);
  const days = generateSlotDays({
    now: MONDAY_MORNING,
    hours: HOURS,
    closedDates: closed,
    config: CONFIG,
  });
  assert.ok(!days.some((day) => day.date === '2026-08-25'));
  // But the shop is still open the day after.
  assert.ok(days.some((day) => day.date === '2026-08-26'));
});

test('a Saturday splits at 13:00 using the Saturday hours, not the weekday ones', () => {
  const days = generateSlotDays({
    now: MONDAY_MORNING,
    hours: HOURS,
    closedDates: new Set(),
    config: CONFIG,
  });
  const saturday = days.find((day) => day.date === '2026-08-29');
  assert.ok(saturday, 'Saturday should appear in the window');
  assert.deepEqual(
    saturday!.slots.map((s) => [s.part, s.opens, s.closes]),
    [
      ['morning', '10:00', '13:00'],
      ['afternoon', '13:00', '16:00'],
    ],
  );
});

test('a slot whose end time has already passed today is not offered', () => {
  // 16:30 London time on the Monday — the morning is long gone.
  const lateMonday = Date.UTC(2026, 7, 24, 15, 30); // 16:30 BST
  const days = generateSlotDays({
    now: lateMonday,
    hours: HOURS,
    closedDates: new Set(),
    config: CONFIG,
  });
  const today = days.find((day) => day.date === '2026-08-24');
  assert.ok(today, 'today should still appear — the afternoon slot has 30 minutes left');
  assert.deepEqual(
    today!.slots.map((s) => s.part),
    ['afternoon'],
  );
});

test('a day with every slot already passed does not appear at all', () => {
  const afterClose = Date.UTC(2026, 7, 24, 16, 30); // 17:30 BST, shop shut
  const days = generateSlotDays({
    now: afterClose,
    hours: HOURS,
    closedDates: new Set(),
    config: CONFIG,
  });
  assert.ok(!days.some((day) => day.date === '2026-08-24'));
});

test('later days are unaffected by the time of day right now', () => {
  const almostMidnight = Date.UTC(2026, 7, 24, 22, 59); // 23:59 BST
  const days = generateSlotDays({
    now: almostMidnight,
    hours: HOURS,
    closedDates: new Set(),
    config: CONFIG,
  });
  const tomorrow = days.find((day) => day.date === '2026-08-25');
  assert.equal(tomorrow?.slots.length, 2, 'tomorrow keeps both slots regardless of the clock');
});

test('the window respects daysAhead as a calendar horizon', () => {
  const days = generateSlotDays({
    now: MONDAY_MORNING,
    hours: HOURS,
    closedDates: new Set(),
    config: { ...CONFIG, daysAhead: 3 },
  });
  // Mon, Tue, Wed only fall inside a 3-day horizon starting today.
  assert.deepEqual(
    days.map((d) => d.date),
    ['2026-08-24', '2026-08-25', '2026-08-26'],
  );
});

test('isValidSlot rejects a date/part not actually on offer', () => {
  const days = generateSlotDays({
    now: MONDAY_MORNING,
    hours: HOURS,
    closedDates: new Set(),
    config: CONFIG,
  });
  assert.equal(isValidSlot(days, '2026-08-24', 'morning'), true);
  assert.equal(isValidSlot(days, '2026-08-30', 'morning'), false, 'Sunday has no slots');
  assert.equal(isValidSlot(days, '2099-01-01', 'morning'), false, 'outside the window entirely');
});

test('formatSlotDay reads naturally', () => {
  assert.equal(formatSlotDay('2026-08-24', 'Monday'), 'Monday 24 August');
});

// --- calendar-grid arithmetic -----------------------------------------------

test('monthOf reads the calendar month from a date string', () => {
  assert.deepEqual(monthOf('2026-09-16'), { year: 2026, month: 8 });
  assert.deepEqual(monthOf('2026-01-01'), { year: 2026, month: 0 });
  assert.deepEqual(monthOf('2026-12-31'), { year: 2026, month: 11 });
});

test('monthLabel reads naturally', () => {
  assert.equal(monthLabel({ year: 2026, month: 8 }), 'September 2026');
  assert.equal(monthLabel({ year: 2027, month: 0 }), 'January 2027');
});

test('daysInMonth handles 30, 31 and leap-year February', () => {
  assert.equal(daysInMonth({ year: 2026, month: 8 }), 30); // September
  assert.equal(daysInMonth({ year: 2026, month: 0 }), 31); // January
  assert.equal(daysInMonth({ year: 2028, month: 1 }), 29); // Feb, leap year
  assert.equal(daysInMonth({ year: 2026, month: 1 }), 28); // Feb, not leap
});

test('mondayIndexOfFirst reads Monday-first, not Date\'s Sunday-first', () => {
  // 1 September 2026 is a Tuesday.
  assert.equal(mondayIndexOfFirst({ year: 2026, month: 8 }), 1);
  // 1 November 2026 is a Sunday — the last column, not the first.
  assert.equal(mondayIndexOfFirst({ year: 2026, month: 10 }), 6);
  // 1 June 2026 is a Monday — the first column.
  assert.equal(mondayIndexOfFirst({ year: 2026, month: 5 }), 0);
});

test('dateInMonth pads single-digit months and days', () => {
  assert.equal(dateInMonth({ year: 2026, month: 8 }, 5), '2026-09-05');
  assert.equal(dateInMonth({ year: 2026, month: 0 }, 31), '2026-01-31');
});

test('shiftMonth rolls the year over in both directions', () => {
  assert.deepEqual(shiftMonth({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 });
  assert.deepEqual(shiftMonth({ year: 2026, month: 0 }, -1), { year: 2025, month: 11 });
  assert.deepEqual(shiftMonth({ year: 2026, month: 8 }, 4), { year: 2027, month: 0 });
});

test('compareMonths orders chronologically', () => {
  assert.ok(compareMonths({ year: 2026, month: 8 }, { year: 2026, month: 9 }) < 0);
  assert.ok(compareMonths({ year: 2027, month: 0 }, { year: 2026, month: 11 }) > 0);
  assert.equal(compareMonths({ year: 2026, month: 8 }, { year: 2026, month: 8 }), 0);
});
