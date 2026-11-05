import { describe, expect, it } from 'vitest';
import { defaultTasks } from './defaults';
import { defaultEconomy, isSurprise } from './economy';
import { rewardBreak, rewardCompletions, rewardWater, revokeTasks } from './rewards';
import {
  completeTask,
  createTask,
  renameTask,
  setReward,
  splitTask,
  uncompleteTask,
} from './tasks';

const T = new Date(2026, 10, 5, 12).getTime();
const DAY = '2026-11-05';

describe('rewards: задачи', () => {
  it('M: +2 энергии, +3 монеты', () => {
    const c = createTask(
      defaultTasks(),
      { title: 'отчёт', size: 'M' },
      { id: 'a', instanceId: 'ai' },
      T,
      DAY,
    );
    const done = completeTask(c.state, 'a', T);
    const r = rewardCompletions(defaultEconomy(DAY), done.completed);
    expect(r.energyDelta).toBe(2);
    expect(r.economy.coins).toBe(3);
    expect(r.paid).toEqual([{ taskId: 'a', energy: 2, coins: 3, surprise: false }]);
  });
  it('разбитый L: 3 подзадачи по 1/1 + бонус 1/2, за размер родителя — ничего (R0)', () => {
    let s = createTask(
      defaultTasks(),
      { title: 'переезд', size: 'L' },
      { id: 'p', instanceId: 'pi' },
      T,
      DAY,
    ).state;
    s = splitTask(s, 'p', ['a', 'b', 'c'], T).state;
    for (const id of ['a', 'b', 'c']) s = renameTask(s, id, id);
    let e = defaultEconomy(DAY);
    let energy = 0;
    for (const id of ['a', 'b', 'c']) {
      const d = completeTask(s, id, T);
      s = d.state;
      const r = rewardCompletions(e, d.completed);
      e = r.economy;
      energy += r.energyDelta;
    }
    expect(energy).toBe(4);
    expect(e.coins).toBe(5);
  });
  it('снял и поставил снова — не больше, чем было списано (нельзя «доить» галочку)', () => {
    let s = createTask(
      defaultTasks(),
      { title: 'x', size: 'L' },
      { id: 'x', instanceId: 'xi' },
      T,
      DAY,
    ).state;
    let d = completeTask(s, 'x', T);
    let r = rewardCompletions(defaultEconomy(DAY), d.completed);
    s = setReward(d.state, 'x', { rewardPaid: { energy: 4, coins: 6 } });
    // потратил 5 из 6 монет в магазине
    const spent = { ...r.economy, coins: 1 };
    const u = uncompleteTask(s, 'x');
    const rv = revokeTasks(spent, 4, u.uncompleted);
    expect(rv.economy.coins).toBe(0);
    expect(rv.revoked[0]).toEqual({ taskId: 'x', energy: 4, coins: 1 });
    s = setReward(u.state, 'x', { rewardPaid: undefined, rewardRevoked: { energy: 4, coins: 1 } });
    d = completeTask(s, 'x', T);
    r = rewardCompletions(rv.economy, d.completed);
    expect(r.economy.coins).toBe(1); // вернули только списанную 1, а не 6
    expect(r.energyDelta).toBe(4);
  });
  it('сюрприз у экземпляра повторяющейся задачи — ×2 монет', () => {
    let inst = 'i0';
    for (let i = 0; !isSurprise(inst); i++) inst = `i${i}`;
    const c = createTask(
      defaultTasks(),
      { title: 'зарядка', size: 'S', recurrence: { kind: 'daily' } },
      { id: 'tpl', instanceId: inst },
      T,
      DAY,
    );
    const d = completeTask(c.state, inst, T);
    const r = rewardCompletions(defaultEconomy(DAY), d.completed);
    expect(r.paid[0]).toEqual({ taskId: inst, energy: 1, coins: 2, surprise: true });
  });
  it('энергия при откате не уходит в минус', () => {
    const t = {
      id: 'z',
      title: 'z',
      size: 'S' as const,
      recurrence: { kind: 'none' as const },
      createdAt: T,
      order: 1,
      rewardPaid: { energy: 4, coins: 0 },
    };
    expect(revokeTasks(defaultEconomy(DAY), 1, [t]).energyToday).toBe(0);
  });
});

describe('rewards: перерывы и вода', () => {
  it('микро 1/0, длинный 4/3', () => {
    expect(rewardBreak(defaultEconomy(DAY), 'micro').reward).toEqual({ energy: 1, coins: 0 });
    const l = rewardBreak(defaultEconomy(DAY), 'long');
    expect(l.reward).toEqual({ energy: 4, coins: 3 });
    expect(l.economy.coins).toBe(3);
  });
  it('вода до цели 1/1, сверх цели 0/0', () => {
    expect(rewardWater(defaultEconomy(DAY), false).economy.coins).toBe(1);
    expect(rewardWater(defaultEconomy(DAY), true).reward).toEqual({ energy: 0, coins: 0 });
  });
});
