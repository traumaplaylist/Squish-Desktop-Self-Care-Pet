/**
 * «Пути» (SPEC 5.5, P1): опциональная группа повторяющихся задач. Этапы 5 / 15 / 30 / 60 выполнений
 * → монеты, предмет, яйцо микро-питомца, особая реплика. Никто не заставляет ими пользоваться.
 */
import type { Journey, Millis } from './types';

export const JOURNEY_TEMPLATES = {
  morning: ['journey.morning.t1', 'journey.morning.t2', 'journey.morning.t3'],
  back: ['journey.back.t1', 'journey.back.t2'],
  sleep: ['journey.sleep.t1', 'journey.sleep.t2'],
} as const;
export type JourneyTemplate = keyof typeof JOURNEY_TEMPLATES;
export const JOURNEY_IDS = Object.keys(JOURNEY_TEMPLATES) as JourneyTemplate[];

export const MILESTONES = [5, 15, 30, 60] as const;
export type MilestoneReward = 'coins' | 'item' | 'egg' | 'line';
export const MILESTONE_REWARD: Record<(typeof MILESTONES)[number], MilestoneReward> = {
  5: 'coins',
  15: 'item',
  30: 'egg',
  60: 'line',
};
export const MILESTONE_COINS = 20;

export function newJourney(id: JourneyTemplate, now: Millis): Journey {
  return { id, title: `journey.${id}`, startedAt: now, completions: 0, milestonesReached: [] };
}

/** Следующий этап или null (все пройдены). */
export function nextMilestone(j: Journey): number | null {
  return MILESTONES.find((m) => !j.milestonesReached.includes(m)) ?? null;
}

/** +1 выполнение. Если достигнут этап — вернуть его. */
export function addCompletion(j: Journey): { journey: Journey; reached: number | null } {
  const completions = j.completions + 1;
  const m = MILESTONES.find((x) => x === completions && !j.milestonesReached.includes(x)) ?? null;
  return {
    journey: {
      ...j,
      completions,
      milestonesReached: m ? [...j.milestonesReached, m] : j.milestonesReached,
    },
    reached: m,
  };
}
