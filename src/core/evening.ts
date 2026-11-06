/**
 * Вечерний вопрос (SPEC 4.6, P1): за 30 мин до конца рабочих часов; если часы выключены — в 18:00.
 * Один вопрос из ротации. Пропуск — без последствий. Никаких выводов и советов.
 */
import { parseTimeOfDay } from './day';
import { pickBy } from './hash';
import type { DayKey, Millis, PetState, WorkHours } from './types';

export const EVENING_QUESTIONS = [
  'evening.q1',
  'evening.q2',
  'evening.q3',
  'evening.q4',
  'evening.q5',
  'evening.q6',
] as const;

/** Минуты от полуночи, когда спросить. */
export function eveningMinute(wh: WorkHours): number {
  const to = wh.enabled ? parseTimeOfDay(wh.to) : null;
  return to === null ? 18 * 60 : Math.max(0, to - 30);
}

export function shouldAskEvening(
  p: Pick<PetState, 'evening'>,
  day: DayKey,
  now: Millis,
  wh: WorkHours,
): boolean {
  if (p.evening.day === day) return false;
  const d = new Date(now);
  const m = d.getHours() * 60 + d.getMinutes();
  // спрашиваем вечером того же календарного дня (не ночью после полуночи)
  return m >= eveningMinute(wh) && d.getHours() >= 6;
}

export function questionFor(day: DayKey): string {
  return pickBy(EVENING_QUESTIONS, `evening:${day}`);
}
