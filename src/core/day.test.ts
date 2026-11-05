import { describe, expect, it } from 'vitest';
import { dayKey, formatTimeOfDay, isOffHours, nextDayBoundary, parseTimeOfDay } from './day';
import type { WorkHours } from './types';

const at = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime();

describe('логический день', () => {
  it('nextDayBoundary: днём → завтра 06:00', () => {
    expect(nextDayBoundary(at(2026, 11, 5, 14))).toBe(at(2026, 11, 6, 6));
  });
  it('nextDayBoundary: ночью до 06:00 → сегодня 06:00', () => {
    expect(nextDayBoundary(at(2026, 11, 6, 2))).toBe(at(2026, 11, 6, 6));
  });
  it('nextDayBoundary: ровно 06:00 → следующий день', () => {
    expect(nextDayBoundary(at(2026, 11, 6, 6))).toBe(at(2026, 11, 7, 6));
  });
  it('dayKey: до 06:00 — вчерашний день, через месяц/год', () => {
    expect(dayKey(at(2026, 11, 6, 5, 59))).toBe('2026-11-05');
    expect(dayKey(at(2026, 11, 6, 6))).toBe('2026-11-06');
    expect(dayKey(at(2027, 1, 1, 3))).toBe('2026-12-31');
  });
});

describe('рабочие часы', () => {
  const wh: WorkHours = { enabled: true, days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' };
  it('выключены — всегда рабочее время', () => {
    expect(isOffHours({ ...wh, enabled: false }, at(2026, 11, 8, 3))).toBe(false);
  });
  it('будни внутри / до / после', () => {
    expect(isOffHours(wh, at(2026, 11, 5, 10))).toBe(false); // четверг
    expect(isOffHours(wh, at(2026, 11, 5, 8, 59))).toBe(true);
    expect(isOffHours(wh, at(2026, 11, 5, 18))).toBe(true);
  });
  it('выходной', () => {
    expect(isOffHours(wh, at(2026, 11, 8, 12))).toBe(true); // воскресенье
  });
  it('через полночь / мусор — ограничений нет', () => {
    expect(isOffHours({ ...wh, from: '22:00', to: '03:00' }, at(2026, 11, 5, 12))).toBe(false);
    expect(isOffHours({ ...wh, from: 'abc', to: '18:00' }, at(2026, 11, 5, 3))).toBe(false);
  });
  it('parse/format', () => {
    expect(parseTimeOfDay('9:05')).toBe(545);
    expect(parseTimeOfDay('24:00')).toBeNull();
    expect(formatTimeOfDay(at(2026, 11, 5, 7, 3))).toBe('07:03');
  });
});
