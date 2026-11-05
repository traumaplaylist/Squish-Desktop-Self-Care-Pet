/**
 * Питомец (SPEC 4.1–4.3 с R0). Чистые функции, время — аргументом.
 * Падение потребностей меняет только позу и реплики — никаких штрафов (SPEC 4.1).
 */
import { HOUR, MINUTE } from './clock';
import { dailyGoal } from './economy';
import type { AppEvent } from './events';
import type { BreakKind, DayKey, GrowthStage, Needs, PetState, Weekday, WorkHours } from './types';

// ───────────── Потребности ─────────────
/** Убывание: −100 за столько активного времени. */
export const DECAY_FULL_MS: Record<keyof Needs, number> = {
  water: 4 * HOUR,
  eyes: 40 * MINUTE,
  movement: 2 * HOUR,
};

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/** Убывают только в активное время (R0: и во время умной паузы — человек у экрана). */
export function decayNeeds(n: Needs, activeMs: number): Needs {
  if (activeMs <= 0) return n;
  return {
    water: clamp(n.water - (100 * activeMs) / DECAY_FULL_MS.water),
    eyes: clamp(n.eyes - (100 * activeMs) / DECAY_FULL_MS.eyes),
    movement: clamp(n.movement - (100 * activeMs) / DECAY_FULL_MS.movement),
  };
}

/** Перерыв досижен: микро → глаза 100, движение +10; длинный → глаза и движение 100. */
export function needsAfterBreak(n: Needs, kind: BreakKind): Needs {
  return kind === 'long'
    ? { ...n, eyes: 100, movement: 100 }
    : { ...n, eyes: 100, movement: clamp(n.movement + 10) };
}

/** Естественный перерыв (отошёл от ПК) → глаза +50. */
export function needsAfterNaturalBreak(n: Needs): Needs {
  return { ...n, eyes: clamp(n.eyes + 50) };
}

/** Начало логического дня (R0): вода 70, глаза и движение 100. */
export const MORNING_NEEDS: Needs = { water: 70, eyes: 100, movement: 100 };

export function mood(n: Needs): number {
  return 0.35 * n.water + 0.35 * n.eyes + 0.3 * n.movement;
}

export type NeedsPose = 'thirsty' | 'tired' | 'happy' | 'idle';

/** Поза по потребностям (нижняя часть приоритета SPEC 4.2). */
export function needsPose(n: Needs): NeedsPose {
  if (n.water < 25) return 'thirsty';
  if (n.eyes < 20 || n.movement < 20) return 'tired';
  if (mood(n) >= 70) return 'happy';
  return 'idle';
}

// ───────────── Рост (по дням заботы — за день не нагриндить) ─────────────
/** R0: «Яйцо» только в онбординге; сразу после — «Малыш». */
export function stageFor(careDays: number): GrowthStage {
  if (careDays >= 40) return 'wise';
  if (careDays >= 15) return 'adult';
  if (careDays >= 5) return 'teen';
  return 'baby';
}

export const STAGE_ORDER: GrowthStage[] = ['egg', 'baby', 'teen', 'adult', 'wise'];

/** Минимум дней заботы для стадии (для Debug «стадия +1»). */
export const STAGE_MIN_DAYS: Record<GrowthStage, number> = {
  egg: 0,
  baby: 0,
  teen: 5,
  adult: 15,
  wise: 40,
};

// ───────────── Цель дня ─────────────
export function goalReached(p: Pick<PetState, 'energyToday' | 'hardDay'>): boolean {
  return p.energyToday >= dailyGoal(p.hardDay);
}

// ───────────── Рабочие дни (серия не рвётся в нерабочие) ─────────────
export function isWorkingDay(day: DayKey, wh: WorkHours): boolean {
  if (!wh.enabled) return true; // R0: часы выключены — все дни рабочие
  const [y, m, d] = day.split('-').map(Number);
  const wd = new Date(y!, (m ?? 1) - 1, d ?? 1).getDay() as Weekday;
  return wh.days.includes(wd);
}

export function nextDayKey(day: DayKey): DayKey {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, (d ?? 1) + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export const FREEZE_EVERY_DAYS = 7;
export const MAX_FREEZES = 2;

export interface DayResult {
  day: DayKey;
  goalReached: boolean;
  workingDay: boolean;
}

/**
 * Закрыть один логический день: день заботы (+стадия), серия, заморозки (SPEC 4.3).
 * Не выполнил цель в рабочий день → тратится заморозка, если есть; иначе серия с нуля (без «наказаний» в UI).
 */
export function closeDay(
  p: PetState,
  r: DayResult,
  at: number,
): { pet: PetState; events: AppEvent[] } {
  const events: AppEvent[] = [];
  let { careDays, streak, streakFreezes } = p;
  if (r.goalReached) {
    careDays += 1;
    streak += 1;
    if (streak % FREEZE_EVERY_DAYS === 0) streakFreezes = Math.min(MAX_FREEZES, streakFreezes + 1);
  } else if (r.workingDay && streak > 0) {
    if (streakFreezes > 0) {
      streakFreezes -= 1;
      events.push({ type: 'streak_freeze_used', at });
    } else {
      streak = 0;
    }
  }
  const stage = p.stage === 'egg' ? 'egg' : stageFor(careDays);
  if (stage !== p.stage) events.push({ type: 'stage_up', at, stage });
  return { pet: { ...p, careDays, streak, streakFreezes, stage }, events };
}

/**
 * Догнать все границы дней между последним закрытым днём и сегодняшним (R0):
 * первый — с реальным итогом, остальные (приложение было закрыто) — без цели.
 * Детерминированно: серия → заморозки → стадии.
 */
export function catchUpDays(
  p: PetState,
  from: { day: DayKey; goalReached: boolean },
  today: DayKey,
  wh: WorkHours,
  at: number,
): { pet: PetState; events: AppEvent[]; closed: DayKey[] } {
  let pet = p;
  const events: AppEvent[] = [];
  const closed: DayKey[] = [];
  let day = from.day;
  let reached = from.goalReached;
  // защита от мусора в датах: не больше двух лет
  for (let i = 0; i < 730 && day < today; i++) {
    const r = closeDay(pet, { day, goalReached: reached, workingDay: isWorkingDay(day, wh) }, at);
    pet = r.pet;
    events.push(...r.events);
    closed.push(day);
    day = nextDayKey(day);
    reached = false;
  }
  return { pet, events, closed };
}

/** Новый день для потребностей и дневных полей. */
export function morningPet(p: PetState): PetState {
  return { ...p, needs: { ...MORNING_NEEDS }, energyToday: 0, hardDay: false };
}
