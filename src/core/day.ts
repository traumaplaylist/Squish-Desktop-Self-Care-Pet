/**
 * Логический день 06:00–06:00 (R0) и рабочие часы. Работает в локальном часовом поясе процесса:
 * new Date(ts) с аргументом детерминирован при заданном TZ (это не «текущее время»).
 */
import type { DayKey, Millis, TimeOfDay, WorkHours } from './types';

export const DAY_START_HOUR = 6;

const pad = (n: number) => String(n).padStart(2, '0');

/** Ближайшая будущая граница логического дня (06:00 местного времени), строго позже ts. */
export function nextDayBoundary(ts: Millis): Millis {
  const d = new Date(ts);
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate(), DAY_START_HOUR, 0, 0, 0);
  if (b.getTime() <= ts) b.setDate(b.getDate() + 1);
  return b.getTime();
}

/** Ключ логического дня: до 06:00 — это ещё вчера. */
export function dayKey(ts: Millis): DayKey {
  const d = new Date(ts);
  if (d.getHours() < DAY_START_HOUR) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseTimeOfDay(t: TimeOfDay): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function formatTimeOfDay(ts: Millis): TimeOfDay {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Вне рабочих часов? Выключенные часы = всё время рабочее (R0).
 * Часы через полночь в MVP не поддерживаются (from ≥ to → считаем, что ограничений нет).
 */
export function isOffHours(wh: WorkHours, ts: Millis): boolean {
  if (!wh.enabled) return false;
  const from = parseTimeOfDay(wh.from);
  const to = parseTimeOfDay(wh.to);
  if (from === null || to === null || from >= to) return false;
  const d = new Date(ts);
  if (!wh.days.includes(d.getDay() as WorkHours['days'][number])) return true;
  const m = d.getHours() * 60 + d.getMinutes();
  return m < from || m >= to;
}
