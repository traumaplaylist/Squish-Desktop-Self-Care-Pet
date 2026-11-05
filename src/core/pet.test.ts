import { describe, expect, it } from 'vitest';
import { HOUR, MINUTE } from './clock';
import { defaultState } from './defaults';
import {
  catchUpDays,
  closeDay,
  decayNeeds,
  goalReached,
  isWorkingDay,
  mood,
  morningPet,
  needsAfterBreak,
  needsAfterNaturalBreak,
  needsPose,
  nextDayKey,
  stageFor,
} from './pet';
import type { PetState, WorkHours } from './types';

const pet = (patch: Partial<PetState> = {}): PetState => ({ ...defaultState(0).pet, ...patch });
const ALL: WorkHours = { enabled: false, days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' };
const WEEK: WorkHours = { ...ALL, enabled: true };

describe('потребности', () => {
  it('вода −100 за 4 ч, глаза −100 за 40 мин, движение −100 за 2 ч', () => {
    const n = decayNeeds({ water: 100, eyes: 100, movement: 100 }, HOUR);
    expect(n.water).toBeCloseTo(75);
    expect(n.eyes).toBe(0);
    expect(n.movement).toBeCloseTo(50);
  });
  it('не ниже 0 и без активного времени — без изменений', () => {
    const n = { water: 5, eyes: 5, movement: 5 };
    expect(decayNeeds(n, 10 * HOUR)).toEqual({ water: 0, eyes: 0, movement: 0 });
    expect(decayNeeds(n, 0)).toBe(n);
  });
  it('перерывы восполняют', () => {
    const n = { water: 50, eyes: 10, movement: 10 };
    expect(needsAfterBreak(n, 'micro')).toEqual({ water: 50, eyes: 100, movement: 20 });
    expect(needsAfterBreak(n, 'long')).toEqual({ water: 50, eyes: 100, movement: 100 });
    expect(needsAfterNaturalBreak(n).eyes).toBe(60);
    expect(needsAfterNaturalBreak({ ...n, eyes: 80 }).eyes).toBe(100);
  });
  it('mood = 0.35·вода + 0.35·глаза + 0.3·движение', () => {
    expect(mood({ water: 100, eyes: 0, movement: 0 })).toBe(35);
    expect(mood({ water: 100, eyes: 100, movement: 100 })).toBe(100);
  });
  it('поза по потребностям: жажда главнее усталости, усталость главнее радости', () => {
    expect(needsPose({ water: 20, eyes: 10, movement: 100 })).toBe('thirsty');
    expect(needsPose({ water: 90, eyes: 10, movement: 100 })).toBe('tired');
    expect(needsPose({ water: 90, eyes: 90, movement: 15 })).toBe('tired');
    expect(needsPose({ water: 90, eyes: 90, movement: 90 })).toBe('happy');
    expect(needsPose({ water: 50, eyes: 50, movement: 50 })).toBe('idle');
  });
  it('утро: вода 70, глаза и движение 100, энергия и тяжёлый день сброшены', () => {
    const p = morningPet(
      pet({ needs: { water: 3, eyes: 3, movement: 3 }, energyToday: 30, hardDay: true }),
    );
    expect(p.needs).toEqual({ water: 70, eyes: 100, movement: 100 });
    expect(p.energyToday).toBe(0);
    expect(p.hardDay).toBe(false);
  });
});

describe('рост и цель дня', () => {
  it('стадии по дням заботы', () => {
    expect([0, 4, 5, 14, 15, 39, 40].map(stageFor)).toEqual([
      'baby',
      'baby',
      'teen',
      'teen',
      'adult',
      'adult',
      'wise',
    ]);
  });
  it('цель 25, в тяжёлый день 10', () => {
    expect(goalReached({ energyToday: 24, hardDay: false })).toBe(false);
    expect(goalReached({ energyToday: 25, hardDay: false })).toBe(true);
    expect(goalReached({ energyToday: 10, hardDay: true })).toBe(true);
  });
});

describe('закрытие дня: серия и заморозки', () => {
  it('цель достигнута → день заботы и серия +1', () => {
    const r = closeDay(pet(), { day: '2026-11-05', goalReached: true, workingDay: true }, 0);
    expect(r.pet.careDays).toBe(1);
    expect(r.pet.streak).toBe(1);
  });
  it('5-й день заботы → «Подросток», событие stage_up', () => {
    const r = closeDay(
      pet({ careDays: 4, stage: 'baby' }),
      { day: 'd', goalReached: true, workingDay: true },
      0,
    );
    expect(r.pet.stage).toBe('teen');
    expect(r.events).toContainEqual({ type: 'stage_up', at: 0, stage: 'teen' });
  });
  it('за каждые 7 дней серии — заморозка, запас до 2', () => {
    let p = pet();
    for (let i = 0; i < 21; i++)
      p = closeDay(p, { day: 'd', goalReached: true, workingDay: true }, 0).pet;
    expect(p.streak).toBe(21);
    expect(p.streakFreezes).toBe(2);
  });
  it('пропуск рабочего дня тратит заморозку, серия цела', () => {
    const r = closeDay(
      pet({ streak: 9, streakFreezes: 1 }),
      { day: 'd', goalReached: false, workingDay: true },
      0,
    );
    expect(r.pet.streak).toBe(9);
    expect(r.pet.streakFreezes).toBe(0);
    expect(r.events.map((e) => e.type)).toEqual(['streak_freeze_used']);
  });
  it('без заморозок серия начинается заново (дни заботы и стадия не отнимаются)', () => {
    const r = closeDay(
      pet({ streak: 3, careDays: 20, stage: 'adult' }),
      { day: 'd', goalReached: false, workingDay: true },
      0,
    );
    expect(r.pet.streak).toBe(0);
    expect(r.pet.careDays).toBe(20);
    expect(r.pet.stage).toBe('adult');
  });
  it('нерабочий день серию не рвёт', () => {
    const r = closeDay(pet({ streak: 3 }), { day: 'd', goalReached: false, workingDay: false }, 0);
    expect(r.pet.streak).toBe(3);
  });
  it('яйцо (до онбординга) не растёт само', () => {
    expect(
      closeDay(pet({ stage: 'egg' }), { day: 'd', goalReached: true, workingDay: true }, 0).pet
        .stage,
    ).toBe('egg');
  });
});

describe('догон пропущенных дней (R0)', () => {
  it('приложение закрыто 3 дня: первый день с реальным итогом, дальше — заморозки, потом серия с нуля', () => {
    const r = catchUpDays(
      pet({ streak: 7, streakFreezes: 1 }),
      { day: '2026-11-02', goalReached: true },
      '2026-11-05',
      ALL,
      0,
    );
    expect(r.closed).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
    // 02: цель → streak 8; 03: пропуск → заморозка; 04: пропуск → серия 0
    expect(r.pet.streak).toBe(0);
    expect(r.pet.streakFreezes).toBe(0);
    expect(r.pet.careDays).toBe(1);
  });
  it('выходные (сб, вс) при рабочих часах пн–пт серию не рвут', () => {
    const r = catchUpDays(
      pet({ streak: 4 }),
      { day: '2026-11-06', goalReached: true },
      '2026-11-09',
      WEEK,
      0,
    );
    expect(r.closed).toEqual(['2026-11-06', '2026-11-07', '2026-11-08']);
    expect(r.pet.streak).toBe(5);
  });
  it('тот же день — ничего не закрываем', () => {
    expect(
      catchUpDays(pet(), { day: '2026-11-05', goalReached: true }, '2026-11-05', ALL, 0).closed,
    ).toEqual([]);
  });
  it('nextDayKey через месяц и год; isWorkingDay', () => {
    expect(nextDayKey('2026-11-30')).toBe('2026-12-01');
    expect(nextDayKey('2026-12-31')).toBe('2027-01-01');
    expect(isWorkingDay('2026-11-08', WEEK)).toBe(false);
    expect(isWorkingDay('2026-11-08', ALL)).toBe(true);
  });
  it('мусорная дата не зацикливает', () => {
    expect(
      catchUpDays(pet(), { day: '', goalReached: false }, '2026-11-05', ALL, 0).closed.length,
    ).toBeLessThanOrEqual(730);
  });
  it('2 часа работы без воды: вода 70 → 20 — питомец хочет пить', () => {
    const n = decayNeeds({ water: 70, eyes: 100, movement: 100 }, 2 * HOUR);
    expect(needsPose({ ...n, eyes: 100, movement: 100 })).toBe('thirsty');
    expect(needsPose(decayNeeds({ water: 100, eyes: 100, movement: 100 }, 33 * MINUTE))).toBe(
      'tired',
    );
  });
});
