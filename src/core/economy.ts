/**
 * Экономика (SPEC 5.4 с правками R0). Чистые функции. Монеты никогда не уходят в минус.
 * Цифры проверяются симуляциями в economy.test.ts — если тест падает, правим цифры, а не тест.
 */
import type { BreakKind, DayKey, EconomyState, TaskSize } from './types';

export interface Reward {
  energy: number;
  coins: number;
}

export const ZERO: Reward = { energy: 0, coins: 0 };

/** Таблица наград (R0: микро-перерыв 0 монет, вода +1 энергии). */
export const REWARDS = {
  task: {
    S: { energy: 1, coins: 1 },
    M: { energy: 2, coins: 3 },
    L: { energy: 4, coins: 6 },
  } as Record<TaskSize, Reward>,
  subtask: { energy: 1, coins: 1 },
  allSubtasksBonus: { energy: 1, coins: 2 },
  creation: { energy: 0, coins: 1 },
  break: { micro: { energy: 1, coins: 0 }, long: { energy: 4, coins: 3 } } as Record<
    BreakKind,
    Reward
  >,
  water: { energy: 1, coins: 1 },
  checkin: { energy: 2, coins: 1 },
  blinkPosture: { energy: 1, coins: 0 },
  firstAid: { energy: 1, coins: 1 },
} as const;

export const LIMITS = {
  creationPerDay: 5,
  blinkPosturePerDay: 6,
  /** После стольких монет за день из задач — монеты ×0,5. */
  softCapCoins: 40,
} as const;

/** Цель дня в энергии (R0: 25; тяжёлый день — 10). */
export const DAILY_GOAL = { normal: 25, hardDay: 10 } as const;

/** Цены магазина: дешёвый ≈ 1 обычный день, средний ≈ 3, дорогой ≈ 7 (R0). */
export const PRICES = { cheap: 40, mid: 120, expensive: 340 } as const;

export const SURPRISE_CHANCE_PCT = 10;

export function defaultEconomy(day: DayKey = ''): EconomyState {
  return {
    coins: 0,
    day,
    coinsFromTasksToday: 0,
    halfCoinRemainder: 0,
    creationRewardsToday: 0,
    blinkPostureAcksToday: 0,
  };
}

/** Новый логический день — дневные счётчики с нуля, монеты остаются. */
export function economyForDay(e: EconomyState, day: DayKey): EconomyState {
  if (e.day === day) return e;
  return { ...defaultEconomy(day), coins: e.coins };
}

/** Детерминированный «бросок» по id экземпляра: повторная отметка не перебрасывает кубик (R0). */
export function isSurprise(instanceId: string): boolean {
  let h = 2166136261;
  for (let i = 0; i < instanceId.length; i++) {
    h ^= instanceId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100 < SURPRISE_CHANCE_PCT;
}

/** Базовая награда за задачу (до потолка). Сюрприз — только у экземпляров повторяющихся задач. */
export function taskBaseReward(t: {
  size: TaskSize;
  isSubtask: boolean;
  recurringInstanceId: string | null;
}): Reward & { surprise: boolean } {
  const base = t.isSubtask ? REWARDS.subtask : REWARDS.task[t.size];
  const surprise = !!t.recurringInstanceId && isSurprise(t.recurringInstanceId);
  return { energy: base.energy, coins: surprise ? base.coins * 2 : base.coins, surprise };
}

/**
 * Начислить монеты за задачу с мягким потолком: после 40 монет за день каждая монета стоит ½.
 * Считаем в полумонетах с остатком (R0), выданная сумма — целая.
 */
export function payTaskCoins(
  e: EconomyState,
  coins: number,
): { economy: EconomyState; paid: number } {
  const room = Math.max(0, LIMITS.softCapCoins - e.coinsFromTasksToday);
  const full = Math.min(coins, room);
  const halves = coins - full + e.halfCoinRemainder;
  const extra = Math.floor(halves / 2);
  const paid = full + extra;
  return {
    economy: {
      ...e,
      coins: e.coins + paid,
      coinsFromTasksToday: e.coinsFromTasksToday + paid,
      halfCoinRemainder: halves % 2,
    },
    paid,
  };
}

export function payCoins(e: EconomyState, coins: number): EconomyState {
  return { ...e, coins: e.coins + Math.max(0, coins) };
}

/** +1 монета за создание задачи, максимум 5 в день; подзадачи не считаются (R0). */
export function payCreation(e: EconomyState): { economy: EconomyState; paid: number } {
  if (e.creationRewardsToday >= LIMITS.creationPerDay) return { economy: e, paid: 0 };
  return {
    economy: {
      ...e,
      coins: e.coins + REWARDS.creation.coins,
      creationRewardsToday: e.creationRewardsToday + 1,
    },
    paid: REWARDS.creation.coins,
  };
}

/** «Моргнул/выпрямился — ок»: +1 энергии, максимум 6 в день. */
export function payBlinkPosture(e: EconomyState): { economy: EconomyState; reward: Reward } {
  if (e.blinkPostureAcksToday >= LIMITS.blinkPosturePerDay) return { economy: e, reward: ZERO };
  return {
    economy: { ...e, blinkPostureAcksToday: e.blinkPostureAcksToday + 1 },
    reward: REWARDS.blinkPosture,
  };
}

/** Снятие галочки: списываем сколько можно, не ниже нуля; возвращаем реально списанное. */
export function revokeCoins(
  e: EconomyState,
  coins: number,
): { economy: EconomyState; revoked: number } {
  const revoked = Math.min(e.coins, Math.max(0, coins));
  return {
    economy: {
      ...e,
      coins: e.coins - revoked,
      coinsFromTasksToday: Math.max(0, e.coinsFromTasksToday - revoked),
    },
    revoked,
  };
}

export function canAfford(e: EconomyState, price: number): boolean {
  return e.coins >= price;
}

export function dailyGoal(hardDay: boolean): number {
  return hardDay ? DAILY_GOAL.hardDay : DAILY_GOAL.normal;
}
