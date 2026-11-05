import { describe, expect, it } from 'vitest';
import { MINUTE, SECOND } from './clock';
import {
  canUndo,
  defaultWater,
  drink,
  undoDrink,
  waterForDay,
  waterTick,
  type WaterConfig,
} from './water';

const cfg: WaterConfig = { goalGlasses: 8, remindAfterMs: 90 * MINUTE };
const T = 1_700_000_000_000;

describe('water', () => {
  it('стакан: +1, потребность +25 (не выше 100), событие', () => {
    const r = drink(defaultWater('d'), 70, T, cfg);
    expect(r.water.glasses).toBe(1);
    expect(r.need).toBe(95);
    expect(r.events).toEqual([{ type: 'water', at: T, glasses: 1 }]);
    expect(drink(r.water, 95, T + 1, cfg).need).toBe(100);
  });
  it('сверх цели — помечается (награды 0/0 решит economy)', () => {
    let w = defaultWater('d');
    for (let i = 0; i < 8; i++) w = drink(w, 50, T, cfg).water;
    expect(drink(w, 50, T, cfg).overGoal).toBe(true);
  });
  it('отмена в течение 30 с возвращает стакан и потребность', () => {
    const r = drink(defaultWater('d'), 60, T, cfg);
    expect(canUndo(r.water, T + 30 * SECOND)).toBe(true);
    const u = undoDrink(r.water, r.need, T + 10 * SECOND)!;
    expect(u.water.glasses).toBe(0);
    expect(u.need).toBe(60);
    expect(u.events[0]?.type).toBe('water_undo');
    expect(undoDrink(u.water, u.need, T + 11 * SECOND)).toBeNull(); // дважды нельзя
  });
  it('через 30 с отменить нельзя; tick чистит undo', () => {
    const r = drink(defaultWater('d'), 60, T, cfg);
    expect(undoDrink(r.water, r.need, T + 31 * SECOND)).toBeNull();
    const t = waterTick(
      r.water,
      { activeDeltaMs: 1000, need: 85, now: T + 31 * SECOND, canRemind: true },
      cfg,
    );
    expect(t.water.undo).toBeNull();
  });
  it('напоминание после 90 мин активного времени без воды', () => {
    let w = defaultWater('d');
    let reminded = 0;
    for (let i = 0; i < 90; i++) {
      const r = waterTick(
        w,
        { activeDeltaMs: MINUTE, need: 80, now: T + i * MINUTE, canRemind: true },
        cfg,
      );
      w = r.water;
      if (r.remind) reminded++;
    }
    expect(reminded).toBe(1);
  });
  it('или когда потребность < 40', () => {
    const r = waterTick(
      defaultWater('d'),
      { activeDeltaMs: 0, need: 39, now: T, canRemind: true },
      cfg,
    );
    expect(r.remind).toBe(true);
  });
  it('не чаще раза в 45 мин', () => {
    let w = waterTick(
      defaultWater('d'),
      { activeDeltaMs: 0, need: 10, now: T, canRemind: true },
      cfg,
    ).water;
    expect(
      waterTick(w, { activeDeltaMs: 0, need: 10, now: T + 44 * MINUTE, canRemind: true }, cfg)
        .remind,
    ).toBe(false);
    w = waterTick(
      w,
      { activeDeltaMs: 0, need: 10, now: T + 45 * MINUTE, canRemind: true },
      cfg,
    ).water;
    expect(w.lastReminderAt).toBe(T + 45 * MINUTE);
  });
  it('на созвоне/перерыве не напоминаем, но и не «съедаем» напоминание', () => {
    const r = waterTick(
      defaultWater('d'),
      { activeDeltaMs: 0, need: 10, now: T, canRemind: false },
      cfg,
    );
    expect(r.remind).toBe(false);
    expect(
      waterTick(r.water, { activeDeltaMs: 0, need: 10, now: T + 1, canRemind: true }, cfg).remind,
    ).toBe(true);
  });
  it('стакан сбрасывает счётчик активного времени', () => {
    const w = { ...defaultWater('d'), activeSinceDrinkMs: 80 * MINUTE };
    expect(drink(w, 50, T, cfg).water.activeSinceDrinkMs).toBe(0);
  });
  it('новый день: стаканы с нуля', () => {
    const w = drink(defaultWater('2026-11-05'), 50, T, cfg).water;
    expect(waterForDay(w, '2026-11-05')).toBe(w);
    expect(waterForDay(w, '2026-11-06').glasses).toBe(0);
  });
});
