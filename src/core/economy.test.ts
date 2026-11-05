import { describe, expect, it } from 'vitest';
import {
  dailyGoal,
  defaultEconomy,
  economyForDay,
  isSurprise,
  LIMITS,
  payBlinkPosture,
  payCoins,
  payCreation,
  payTaskCoins,
  PRICES,
  revokeCoins,
  REWARDS,
  taskBaseReward,
} from './economy';
import type { EconomyState, TaskSize } from './types';

/** Прожить день по сценарию: сколько монет и энергии получилось (без приключений). */
function simulateDay(p: {
  tasks: TaskSize[];
  long: number;
  micro: number;
  water: number;
  checkin: boolean;
  goalGlasses?: number;
}): { coins: number; energy: number } {
  let e: EconomyState = defaultEconomy('d');
  let energy = 0;
  for (const size of p.tasks) {
    e = payCreation(e).economy;
    const r = taskBaseReward({ size, isSubtask: false, recurringInstanceId: null });
    e = payTaskCoins(e, r.coins).economy;
    energy += r.energy;
  }
  for (let i = 0; i < p.long; i++) {
    e = payCoins(e, REWARDS.break.long.coins);
    energy += REWARDS.break.long.energy;
  }
  for (let i = 0; i < p.micro; i++) {
    e = payCoins(e, REWARDS.break.micro.coins);
    energy += REWARDS.break.micro.energy;
  }
  for (let i = 0; i < Math.min(p.water, p.goalGlasses ?? 8); i++) {
    e = payCoins(e, REWARDS.water.coins);
    energy += REWARDS.water.energy;
  }
  if (p.checkin) {
    e = payCoins(e, REWARDS.checkin.coins);
    energy += REWARDS.checkin.energy;
  }
  return { coins: e.coins, energy };
}

const TYPICAL = {
  tasks: Array<TaskSize>(6).fill('M'),
  long: 3,
  micro: 12,
  water: 8,
  checkin: true,
};
const HARD = { tasks: Array<TaskSize>(3).fill('S'), long: 0, micro: 4, water: 4, checkin: false };

describe('экономика: симуляции SPEC 5.4 (R0)', () => {
  const typical = simulateDay(TYPICAL);
  const hard = simulateDay(HARD);

  it(`типичный день даёт 30–45 монет (сейчас ${typical.coins})`, () => {
    expect(typical.coins).toBeGreaterThanOrEqual(30);
    expect(typical.coins).toBeLessThanOrEqual(45);
  });
  it(`типичный день достигает цели энергии ${dailyGoal(false)} (сейчас ${typical.energy})`, () => {
    expect(typical.energy).toBeGreaterThanOrEqual(dailyGoal(false));
  });
  it(`тяжёлый день достигает цели ${dailyGoal(true)} (сейчас ${hard.energy})`, () => {
    expect(hard.energy).toBeGreaterThanOrEqual(dailyGoal(true));
  });
  it('цель не закрывается одной водой и чек-ином (R0: задачи важны)', () => {
    const lazy = simulateDay({ tasks: [], long: 0, micro: 0, water: 8, checkin: true });
    expect(lazy.energy).toBeLessThan(dailyGoal(false));
  });
  it('дешёвый предмет покупается за 1 типичный день', () => {
    expect(typical.coins).toBeGreaterThanOrEqual(PRICES.cheap);
  });
  it('дорогой — не быстрее 5 и не дольше 9 типичных дней (с приключениями и без)', () => {
    const withAdventure = typical.coins + 10; // приключение: 5–15 монет, в среднем 10
    for (const perDay of [typical.coins, withAdventure]) {
      const days = Math.ceil(PRICES.expensive / perDay);
      expect(days).toBeGreaterThanOrEqual(5);
      expect(days).toBeLessThanOrEqual(9);
    }
  });
  it('средний ≈ 3 дня', () => {
    expect(Math.round(PRICES.mid / typical.coins)).toBe(3);
  });
  it('дробление выгодно: L = 6 монет, а 3 подзадачи + бонус = 5 (близко), но потолок не превращает это в фарм', () => {
    const split = 3 * REWARDS.subtask.coins + REWARDS.allSubtasksBonus.coins;
    expect(split).toBeGreaterThan(0);
    expect(split).toBeLessThanOrEqual(REWARDS.task.L.coins);
  });
});

describe('экономика: правила', () => {
  it('награда за создание — максимум 5 в день, новый день — снова', () => {
    let e = defaultEconomy('d1');
    let total = 0;
    for (let i = 0; i < 8; i++) {
      const r = payCreation(e);
      e = r.economy;
      total += r.paid;
    }
    expect(total).toBe(LIMITS.creationPerDay);
    e = economyForDay(e, 'd2');
    expect(payCreation(e).paid).toBe(1);
    expect(e.coins).toBe(5); // монеты остались
  });
  it('мягкий потолок: после 40 монет из задач — половина, в полумонетах с остатком', () => {
    let e = { ...defaultEconomy('d'), coinsFromTasksToday: 39 };
    let r = payTaskCoins(e, 3); // 1 полная + 2 половинки = 2
    expect(r.paid).toBe(2);
    expect(r.economy.halfCoinRemainder).toBe(0);
    e = r.economy;
    r = payTaskCoins(e, 1); // ½ — копится
    expect(r.paid).toBe(0);
    expect(r.economy.halfCoinRemainder).toBe(1);
    r = payTaskCoins(r.economy, 1); // ещё ½ → 1
    expect(r.paid).toBe(1);
  });
  it('100 подзадач за день не дают 100 монет', () => {
    let e = defaultEconomy('d');
    for (let i = 0; i < 100; i++) e = payTaskCoins(e, 1).economy;
    expect(e.coins).toBe(40 + 30);
  });
  it('снятие галочки не уводит в минус и возвращает реально списанное', () => {
    const e = { ...defaultEconomy('d'), coins: 2 };
    const r = revokeCoins(e, 6);
    expect(r.economy.coins).toBe(0);
    expect(r.revoked).toBe(2);
  });
  it('моргание/осанка: +1 энергии, максимум 6 в день', () => {
    let e = defaultEconomy('d');
    let energy = 0;
    for (let i = 0; i < 10; i++) {
      const r = payBlinkPosture(e);
      e = r.economy;
      energy += r.reward.energy;
    }
    expect(energy).toBe(6);
  });
  it('сюрприз ×2 детерминирован по id и выпадает примерно в 10% случаев', () => {
    expect(isSurprise('task-123')).toBe(isSurprise('task-123'));
    let hits = 0;
    for (let i = 0; i < 5000; i++) if (isSurprise(`inst-${i}-2026-11-05`)) hits++;
    expect(hits / 5000).toBeGreaterThan(0.07);
    expect(hits / 5000).toBeLessThan(0.13);
  });
  it('сюрприз — только у повторяющихся; ×2 монет, энергия та же', () => {
    let id = 'x';
    for (let i = 0; !isSurprise(id); i++) id = `x${i}`;
    const r = taskBaseReward({ size: 'M', isSubtask: false, recurringInstanceId: id });
    expect(r).toEqual({ energy: 2, coins: 6, surprise: true });
    expect(
      taskBaseReward({ size: 'M', isSubtask: false, recurringInstanceId: null }).surprise,
    ).toBe(false);
  });
  it('подзадача платит как S независимо от размера', () => {
    expect(taskBaseReward({ size: 'L', isSubtask: true, recurringInstanceId: null })).toEqual({
      energy: 1,
      coins: 1,
      surprise: false,
    });
  });
});
