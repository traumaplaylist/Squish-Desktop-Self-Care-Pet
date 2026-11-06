/**
 * Напоминание по времени у задачи (SPEC 5.1, P1): в remindAt питомец показывает облачко с задачей.
 * Не на умной паузе — после неё. Пропущенные (приложение было закрыто) — только если не позже часа.
 */
import { parseTimeOfDay } from './day';
import type { Millis, Task } from './types';

export const LATE_MAX_MIN = 60;

export function dueReminders(open: Task[], now: Millis, already: string[]): Task[] {
  const d = new Date(now);
  const m = d.getHours() * 60 + d.getMinutes();
  return open.filter((t) => {
    if (!t.remindAt || t.doneAt || already.includes(t.id)) return false;
    const at = parseTimeOfDay(t.remindAt);
    return at !== null && m >= at && m - at <= LATE_MAX_MIN;
  });
}
