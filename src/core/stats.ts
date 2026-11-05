/**
 * Статистика «Дома питомца» (SPEC 2.3) — чистые функции над логом событий.
 * «Оценка дня» 0–100 = 40% перерывы + 30% вода + 30% цель энергии; показывается нейтрально.
 * R0: если перерывов не предлагалось (весь день созвоны) — компонент исключается, веса перенормируются.
 */
import type { AppEvent } from './events';
import type { DayKey, Millis } from './types';

export interface DayStats {
  day: DayKey;
  tasksDone: number;
  tasksCreated: number;
  breaksDone: number;
  breaksSkipped: number;
  breaksPostponed: number;
  naturalBreaks: number;
  water: number;
  /** Последний ответ на чек-ин 1–5 или null. */
  mood: number | null;
  /** Из итога дня (day_closed) или текущего состояния для «сегодня». */
  energy: number | null;
  activeMs: number | null;
  goalReached: boolean | null;
}

export function emptyDay(day: DayKey): DayStats {
  return {
    day,
    tasksDone: 0,
    tasksCreated: 0,
    breaksDone: 0,
    breaksSkipped: 0,
    breaksPostponed: 0,
    naturalBreaks: 0,
    water: 0,
    mood: null,
    energy: null,
    activeMs: null,
    goalReached: null,
  };
}

/** Разложить события по логическим дням. dayOf — dayKey (граница 06:00). */
export function statsByDay(
  events: readonly AppEvent[],
  dayOf: (at: Millis) => DayKey,
): Map<DayKey, DayStats> {
  const m = new Map<DayKey, DayStats>();
  const get = (d: DayKey) => {
    let s = m.get(d);
    if (!s) m.set(d, (s = emptyDay(d)));
    return s;
  };
  const sorted = [...events].sort((a, b) => a.at - b.at);
  for (const e of sorted) {
    const s = get(e.type === 'day_closed' ? e.day : dayOf(e.at));
    switch (e.type) {
      case 'task_completed':
        s.tasksDone += 1;
        break;
      case 'task_uncompleted':
        s.tasksDone = Math.max(0, s.tasksDone - 1);
        break;
      case 'task_created':
        s.tasksCreated += 1;
        break;
      case 'break_completed':
        s.breaksDone += 1;
        break;
      case 'break_skipped':
        s.breaksSkipped += 1;
        break;
      case 'break_postponed':
        s.breaksPostponed += 1;
        break;
      case 'natural_break':
        s.naturalBreaks += 1;
        break;
      case 'water':
        s.water += 1;
        break;
      case 'water_undo':
        s.water = Math.max(0, s.water - 1);
        break;
      case 'mood_checkin':
        s.mood = e.mood;
        break;
      case 'day_closed':
        s.energy = e.energy;
        s.activeMs = e.activeMs;
        s.goalReached = e.goalReached;
        break;
      default:
        break;
    }
  }
  return m;
}

/** «Оценка дня» 0–100 или null, если считать не из чего. */
export function dayScore(s: DayStats, waterGoal: number, energyGoal: number): number | null {
  const parts: [number, number][] = [];
  const offered = s.breaksDone + s.breaksSkipped;
  if (offered > 0) parts.push([0.4, s.breaksDone / offered]);
  if (waterGoal > 0) parts.push([0.3, Math.min(1, s.water / waterGoal)]);
  if (s.energy !== null && energyGoal > 0) parts.push([0.3, Math.min(1, s.energy / energyGoal)]);
  const w = parts.reduce((a, [k]) => a + k, 0);
  if (w === 0) return null;
  return Math.round((100 * parts.reduce((a, [k, v]) => a + k * v, 0)) / w);
}

/** Последние 7 логических дней (включая today), старые → новые; пустые дни — нули. */
export function lastDays(
  m: Map<DayKey, DayStats>,
  today: DayKey,
  prevDay: (d: DayKey) => DayKey,
  n = 7,
): DayStats[] {
  const out: DayStats[] = [];
  let d = today;
  for (let i = 0; i < n; i++) {
    out.unshift(m.get(d) ?? emptyDay(d));
    d = prevDay(d);
  }
  return out;
}

export function prevDayKey(day: DayKey): DayKey {
  const [y, mo, d] = day.split('-').map(Number);
  const dt = new Date(y!, (mo ?? 1) - 1, (d ?? 1) - 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
