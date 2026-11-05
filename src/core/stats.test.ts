import { describe, expect, it } from 'vitest';
import { dayKey } from './day';
import type { AppEvent } from './events';
import { dayScore, emptyDay, lastDays, prevDayKey, statsByDay } from './stats';

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();

/** Синтетический лог за 14 дней (с 1 по 14 ноября): разный рисунок по дням. */
function log14(): AppEvent[] {
  const ev: AppEvent[] = [];
  for (let d = 1; d <= 14; d++) {
    const busy = d % 3 === 0; // каждый третий — день созвонов: перерывов нет
    if (!busy) {
      for (let i = 0; i < d % 5; i++)
        ev.push({
          type: 'break_completed',
          at: at(d, 10 + i),
          kind: 'micro',
          exerciseId: 'look-far',
        });
      ev.push({ type: 'break_skipped', at: at(d, 16), kind: 'micro' });
    }
    for (let i = 0; i < 4; i++) ev.push({ type: 'water', at: at(d, 9 + i), glasses: i + 1 });
    ev.push({ type: 'task_created', at: at(d, 9), taskId: `t${d}`, size: 'S', coins: 1 });
    ev.push({
      type: 'task_completed',
      at: at(d, 11),
      taskId: `t${d}`,
      energy: 1,
      coins: 1,
      surprise: false,
    });
    ev.push({ type: 'mood_checkin', at: at(d, 8), mood: ((d % 5) + 1) as 1 | 2 | 3 | 4 | 5 });
    // итог дня пишется при закрытии, уже в 06:00 следующего утра
    ev.push({
      type: 'day_closed',
      at: at(d + 1, 6, 1),
      day: dayKey(at(d, 12)),
      activeMs: d * 600_000,
      energy: 10 + d,
      goalReached: 10 + d >= 25,
    });
  }
  return ev;
}

describe('stats', () => {
  const m = statsByDay(log14(), dayKey);

  it('день раскладывается по логическому дню (до 06:00 — вчера)', () => {
    const mm = statsByDay([{ type: 'water', at: at(5, 3), glasses: 1 }], dayKey);
    expect([...mm.keys()]).toEqual(['2026-11-04']);
  });
  it('счётчики дня 4 ноября', () => {
    const s = m.get('2026-11-04')!;
    expect(s).toMatchObject({
      tasksDone: 1,
      tasksCreated: 1,
      breaksDone: 4,
      breaksSkipped: 1,
      water: 4,
      mood: 5,
      energy: 14,
    });
    expect(s.activeMs).toBe(4 * 600_000);
  });
  it('итог дня (day_closed) попадает в свой день, а не в утро следующего', () => {
    expect(m.get('2026-11-14')!.energy).toBe(24);
    expect(m.get('2026-11-15')).toBeUndefined();
  });
  it('отмены уменьшают счётчики, но не ниже нуля', () => {
    const mm = statsByDay(
      [
        { type: 'water_undo', at: at(5, 9) },
        { type: 'task_uncompleted', at: at(5, 9), taskId: 'x', energy: 1, coins: 1 },
      ],
      dayKey,
    );
    expect(mm.get('2026-11-05')).toMatchObject({ water: 0, tasksDone: 0 });
  });
  it('оценка дня: 40% перерывы + 30% вода + 30% энергия', () => {
    const s = { ...emptyDay('d'), breaksDone: 3, breaksSkipped: 1, water: 8, energy: 25 };
    expect(dayScore(s, 8, 25)).toBe(Math.round(100 * (0.4 * 0.75 + 0.3 + 0.3)));
  });
  it('R0: перерывов не было (день созвонов) — компонент исключается, веса перенормируются', () => {
    const s = m.get('2026-11-03')!; // день созвонов
    expect(s.breaksDone + s.breaksSkipped).toBe(0);
    const v = dayScore(s, 8, 25)!;
    expect(v).toBe(Math.round((100 * (0.3 * 0.5 + 0.3 * (13 / 25))) / 0.6));
  });
  it('оценка не выше 100 и null, если не из чего считать', () => {
    expect(dayScore({ ...emptyDay('d'), water: 20, energy: 99, breaksDone: 5 }, 8, 25)).toBe(100);
    expect(dayScore(emptyDay('d'), 0, 25)).toBeNull();
  });
  it('неделя: 7 дней старые → новые, пропуски — нули', () => {
    const w = lastDays(m, '2026-11-16', prevDayKey);
    expect(w.map((d) => d.day)).toEqual([
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
    ]);
    expect(w[5]!.tasksDone).toBe(0);
    expect(w[4]!.water).toBe(4);
  });
  it('prevDayKey через месяц', () => {
    expect(prevDayKey('2026-12-01')).toBe('2026-11-30');
    expect(prevDayKey('2027-01-01')).toBe('2026-12-31');
  });
});
