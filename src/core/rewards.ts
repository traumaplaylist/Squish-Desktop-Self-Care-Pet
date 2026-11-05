/**
 * Награды (CLAUDE.md: rewards.ts) — склейка задач и экономики. Чистые функции.
 * R0: rewardPaid / rewardRevoked — повторная отметка платит не больше реально списанного.
 */
import {
  payCoins,
  payTaskCoins,
  REWARDS,
  revokeCoins,
  taskBaseReward,
  type Reward,
} from './economy';
import type { Completion } from './tasks';
import type { BreakKind, EconomyState, Task } from './types';

export interface PaidTask {
  taskId: string;
  energy: number;
  coins: number;
  surprise: boolean;
}

export interface RewardResult {
  economy: EconomyState;
  energyDelta: number;
  paid: PaidTask[];
}

/** Базовая награда отметки по её виду. */
function baseFor(c: Completion): Reward & { surprise: boolean } {
  if (c.kind === 'parentBonus') return { ...REWARDS.allSubtasksBonus, surprise: false };
  return taskBaseReward({
    size: c.task.size,
    isSubtask: c.kind === 'subtask',
    recurringInstanceId: c.task.templateId ? c.task.id : null,
  });
}

/** Начислить за отмеченные задачи. Если задачу уже отмечали и снимали — платим не больше списанного. */
export function rewardCompletions(e: EconomyState, completions: Completion[]): RewardResult {
  let economy = e;
  let energyDelta = 0;
  const paid: PaidTask[] = [];
  for (const c of completions) {
    const base = baseFor(c);
    const cap = c.task.rewardRevoked;
    const energy = cap ? Math.min(base.energy, cap.energy) : base.energy;
    const wantCoins = cap ? Math.min(base.coins, cap.coins) : base.coins;
    const r = payTaskCoins(economy, wantCoins);
    economy = r.economy;
    energyDelta += energy;
    paid.push({ taskId: c.task.id, energy, coins: r.paid, surprise: base.surprise && !cap });
  }
  return { economy, energyDelta, paid };
}

/** Откатить награды снятых задач (без ухода в минус). Возвращает реально списанное по каждой. */
export function revokeTasks(
  e: EconomyState,
  energyToday: number,
  tasks: Task[],
): {
  economy: EconomyState;
  energyToday: number;
  revoked: { taskId: string; energy: number; coins: number }[];
} {
  let economy = e;
  let energy = energyToday;
  const revoked: { taskId: string; energy: number; coins: number }[] = [];
  for (const t of tasks) {
    const p = t.rewardPaid ?? { energy: 0, coins: 0 };
    const r = revokeCoins(economy, p.coins);
    economy = r.economy;
    const en = Math.min(energy, p.energy);
    energy -= en;
    revoked.push({ taskId: t.id, energy: en, coins: r.revoked });
  }
  return { economy, energyToday: energy, revoked };
}

/** Перерыв досижен (SPEC 5.4, R0: микро 1/0, длинный 4/3). Пропуск — ничего. */
export function rewardBreak(
  e: EconomyState,
  kind: BreakKind,
): { economy: EconomyState; reward: Reward } {
  const reward = REWARDS.break[kind];
  return { economy: payCoins(e, reward.coins), reward };
}

/** Стакан до цели: 1/1; сверх цели — 0/0 (R0). */
export function rewardWater(
  e: EconomyState,
  overGoal: boolean,
): { economy: EconomyState; reward: Reward } {
  if (overGoal) return { economy: e, reward: { energy: 0, coins: 0 } };
  return { economy: payCoins(e, REWARDS.water.coins), reward: REWARDS.water };
}
