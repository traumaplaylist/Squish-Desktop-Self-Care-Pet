import { describe, expect, it } from 'vitest';
import {
  addDiary,
  ADVENTURE_MS,
  DIARY_MAX,
  FRAGMENTS,
  finishAdventure,
  startAdventure,
} from './adventure';
import { defaultEconomy, PRICES } from './economy';
import { defaultState } from './defaults';
import { eveningMinute, questionFor, shouldAskEvening } from './evening';
import { addCompletion, MILESTONES, newJourney, nextMilestone } from './journeys';
import { giveEgg, hatchEggs, MICRO_PETS, toggleShown } from './microPets';
import { closeDay, restoreGoal, RESTORE_WINDOW_MS, tryRestoreStreak } from './pet';
import { dueReminders } from './reminders';
import {
  buyItem,
  buyTreat,
  giftItem,
  isFoodTask,
  itemById,
  takeTreat,
  toggleItem,
  WARDROBE,
} from './shop';
import { favoriteFood, revealTrait, TRAITS, traitLine } from './traits';
import type { PetState, Task } from './types';

const pet = (o: Partial<PetState> = {}): PetState => ({ ...defaultState(0).pet, ...o });
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length]!;
};
const at = (h: number, m = 0) => new Date(2026, 10, 6, h, m).getTime();

describe('приключения (SPEC 4.4)', () => {
  it('уходит на 30 минут и не стартует второй раз', () => {
    const p = startAdventure(pet(), 1000);
    expect(p.adventure).toEqual({ startedAt: 1000, returnsAt: 1000 + ADVENTURE_MS });
    expect(startAdventure(p, 5000)).toBe(p);
  });
  it('возвращается с историей из трёх фрагментов, монеты 5–15, запись в дневнике', () => {
    for (const r of [0, 0.5, 0.999]) {
      const out = finishAdventure(startAdventure(pet(), 0), ADVENTURE_MS, () => r);
      expect(out.pet.adventure).toBeNull();
      expect(out.coins).toBeGreaterThanOrEqual(5);
      expect(out.coins).toBeLessThanOrEqual(15);
      expect(out.entry.parts).toHaveLength(3);
      for (const k of out.entry.parts!) {
        const n = Number(k.split('.').pop());
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(FRAGMENTS);
      }
      expect(out.pet.diary.at(-1)).toEqual(out.entry);
    }
  });
  it('редкие находки: предмет, яйцо, черта — при маленьких бросках', () => {
    const out = finishAdventure(pet(), 0, seq(0.1, 0.2, 0.3, 0.5, 0.01, 0.4, 0.01, 0.01, 0.2));
    expect(out.entry.loot?.itemId).toBeTruthy();
    expect(out.pet.owned).toContain(out.entry.loot?.itemId);
    expect(out.entry.loot?.egg).toBe(true);
    expect(out.pet.eggs).toHaveLength(1);
    expect(out.entry.loot?.traitId).toBeTruthy();
  });
  it('при больших бросках — только монеты', () => {
    const out = finishAdventure(pet(), 0, () => 0.99);
    expect(out.entry.loot).toEqual({ coins: 15 });
  });
  it('дневник не растёт бесконечно', () => {
    let p = pet();
    for (let i = 0; i < DIARY_MAX + 20; i++) p = addDiary(p, { at: i, kind: 'trait' });
    expect(p.diary).toHaveLength(DIARY_MAX);
    expect(p.diary[0]!.at).toBe(20);
  });
});

describe('характер (SPEC 4.5)', () => {
  it('20 черт, раскрываются по одной без повторов', () => {
    expect(TRAITS).toHaveLength(20);
    let p = pet();
    for (let i = 0; i < 25; i++) p = revealTrait(p, (i * 0.37) % 1).pet;
    expect(new Set(p.revealedTraits).size).toBe(20);
    expect(revealTrait(p, 0.5).traitId).toBeNull();
  });
  it('реплика — только по раскрытой черте', () => {
    expect(traitLine(pet(), 0.3)).toBeNull();
    expect(traitLine(pet({ revealedTraits: ['likesRain'] }), 0.3)).toBe('trait.likesRain.line');
  });
  it('любимая еда постоянна для имени', () => {
    const t = ['a', 'b', 'c'];
    expect(favoriteFood({ name: 'Булочка' }, t)).toBe(favoriteFood({ name: 'Булочка' }, t));
  });
});

describe('гардероб и угощения (SPEC 4.9, 4.10)', () => {
  it('12 предметов: шапки 3, очки 2, шарфы 2, в лапках 3, фон 2; цены из экономики', () => {
    const by = (s: string) => WARDROBE.filter((i) => i.slot === s).length;
    expect([by('head'), by('eyes'), by('neck'), by('paw'), by('bg')]).toEqual([3, 2, 2, 3, 2]);
    expect(WARDROBE.every((i) => Object.values(PRICES).includes(i.price as never))).toBe(true);
  });
  it('купить: монеты списываются, без ухода в минус; повторно не купить', () => {
    const e = { ...defaultEconomy('d'), coins: PRICES.cheap };
    const r = buyItem(pet(), e, 'head:beanie');
    expect(r.ok && r.economy.coins).toBe(0);
    expect(r.ok && r.pet.owned).toEqual(['head:beanie']);
    if (!r.ok) throw new Error();
    expect(buyItem(r.pet, { ...e, coins: 999 }, 'head:beanie')).toEqual({
      ok: false,
      reason: 'owned',
    });
    expect(buyItem(pet(), { ...e, coins: 1 }, 'head:beanie')).toEqual({
      ok: false,
      reason: 'coins',
    });
  });
  it('надеть: один предмет на слот; повторное нажатие снимает', () => {
    let p = pet({ owned: ['head:beanie', 'head:flowers', 'paw:mug'] });
    p = (toggleItem(p, 'head:beanie') as { pet: PetState }).pet;
    p = (toggleItem(p, 'paw:mug') as { pet: PetState }).pet;
    p = (toggleItem(p, 'head:flowers') as { pet: PetState }).pet;
    expect(p.accessories.sort()).toEqual(['head:flowers', 'paw:mug']);
    p = (toggleItem(p, 'paw:mug') as { pet: PetState }).pet;
    expect(p.accessories).toEqual(['head:flowers']);
    expect(toggleItem(p, 'eyes:sun')).toEqual({ ok: false, reason: 'notOwned' });
  });
  it('угощения: кладовка копится и расходуется', () => {
    const e = { ...defaultEconomy('d'), coins: 100 };
    const r1 = buyTreat(pet(), e, 'cookie');
    if (!r1.ok) throw new Error();
    const r2 = buyTreat(r1.pet, r1.economy, 'cookie');
    if (!r2.ok) throw new Error();
    expect(r2.pet.pantry).toEqual({ cookie: 2 });
    const t1 = takeTreat(r2.pet, 'cookie');
    if (!t1.ok) throw new Error();
    const t2 = takeTreat(t1.pet, 'cookie');
    if (!t2.ok) throw new Error();
    expect(t2.pet.pantry).toEqual({});
    expect(takeTreat(t2.pet, 'cookie')).toEqual({ ok: false, reason: 'empty' });
  });
  it('подарок — только из недорогих и ещё не купленных', () => {
    const g = giftItem(pet(), 0.5);
    expect(itemById(g.itemId!)!.price).toBeLessThanOrEqual(PRICES.mid);
    const all = WARDROBE.filter((i) => i.price <= PRICES.mid).map((i) => i.id);
    expect(giftItem(pet({ owned: all }), 0.5).itemId).toBeNull();
  });
  it('задача про еду — питомец ест рядом', () => {
    expect(isFoodTask('пообедать не за компьютером')).toBe(true);
    expect(isFoodTask('Have lunch outside')).toBe(true);
    expect(isFoodTask('сдать отчёт')).toBe(false);
  });
});

describe('микро-питомцы (SPEC 4.8)', () => {
  it('12 видов; яйца разных видов, пока есть новые', () => {
    expect(MICRO_PETS).toHaveLength(12);
    let p = pet();
    for (let i = 0; i < 12; i++) p = giveEgg(p, 'test', i, `s${i}`);
    expect(new Set(p.eggs.map((e) => e.kind)).size).toBe(12);
  });
  it('вылупляется через 3 дня заботы; в виджете не больше двух', () => {
    let p = pet({ careDays: 0 });
    for (let i = 0; i < 3; i++) p = giveEgg(p, 'test', i, `x${i}`);
    expect(hatchEggs({ ...p, careDays: 2 }, 0).hatched).toEqual([]);
    const h = hatchEggs({ ...p, careDays: 3 }, 9);
    expect(h.hatched).toHaveLength(3);
    expect(h.pet.eggs).toEqual([]);
    expect(h.pet.microPets.filter((m) => m.shown)).toHaveLength(2);
    expect(toggleShown(h.pet, 2)).toBe(h.pet); // третий не показать, пока двое на виду
    const hidden = toggleShown(h.pet, 0);
    expect(toggleShown(hidden, 2).microPets[2]!.shown).toBe(true);
  });
  it('7 дней серии → яйцо; через 3 дня заботы оно вылупляется при закрытии дня', () => {
    let p = pet({ streak: 6, careDays: 6 });
    const r = closeDay(p, { day: 'd7', goalReached: true, workingDay: true }, 1);
    expect(r.pet.eggs).toHaveLength(1);
    expect(r.events.map((e) => e.type)).toContain('egg_received');
    p = r.pet;
    for (let i = 0; i < 3; i++)
      p = closeDay(p, { day: `e${i}`, goalReached: true, workingDay: true }, 2).pet;
    expect(p.eggs).toHaveLength(0);
    expect(p.microPets).toHaveLength(1);
  });
});

describe('Пути (SPEC 5.5)', () => {
  it('этапы 5/15/30/60 — каждый один раз', () => {
    let j = newJourney('morning', 0);
    const reached: number[] = [];
    for (let i = 0; i < 70; i++) {
      const r = addCompletion(j);
      j = r.journey;
      if (r.reached) reached.push(r.reached);
    }
    expect(reached).toEqual([...MILESTONES]);
    expect(nextMilestone(j)).toBeNull();
  });
});

describe('вечерний вопрос (SPEC 4.6)', () => {
  const off = { enabled: false, days: [1, 2, 3, 4, 5] as const, from: '09:00', to: '18:00' };
  it('без рабочих часов — в 18:00; с часами — за 30 мин до конца', () => {
    expect(eveningMinute({ ...off, days: [1] })).toBe(18 * 60);
    expect(eveningMinute({ ...off, days: [1], enabled: true, to: '19:00' })).toBe(18 * 60 + 30);
  });
  it('раз в день и только вечером', () => {
    const p = pet();
    const wh = { ...off, days: [1, 2] as (0 | 1 | 2 | 3 | 4 | 5 | 6)[] };
    expect(shouldAskEvening(p, '2026-11-06', at(17, 59), wh)).toBe(false);
    expect(shouldAskEvening(p, '2026-11-06', at(18, 1), wh)).toBe(true);
    const asked = pet({
      evening: { day: '2026-11-06', questionKey: 'evening.q1', answered: false },
    });
    expect(shouldAskEvening(asked, '2026-11-06', at(20), wh)).toBe(false);
    expect(questionFor('2026-11-06')).toBe(questionFor('2026-11-06'));
  });
});

describe('восстановление серии (SPEC 4.3)', () => {
  it('порвалась без заморозок → 48 ч на «день-догонялку» (цель ×1,5)', () => {
    const r = closeDay(pet({ streak: 9 }), { day: 'd', goalReached: false, workingDay: true }, 100);
    expect(r.pet.streak).toBe(0);
    expect(r.pet.streakRestore).toEqual({ lost: 9, until: 100 + RESTORE_WINDOW_MS });
    expect(restoreGoal(false)).toBe(38);
    const low = tryRestoreStreak({ ...r.pet, energyToday: 30 }, 200);
    expect(low.restored).toBe(false);
    const ok = tryRestoreStreak({ ...r.pet, energyToday: 38 }, 200);
    expect(ok.restored).toBe(true);
    expect(ok.pet.streak).toBe(9);
    expect(ok.pet.streakRestore).toBeNull();
  });
  it('окно истекло — тихо закрывается', () => {
    const p = pet({ streakRestore: { lost: 5, until: 10 }, energyToday: 99 });
    const r = tryRestoreStreak(p, 11);
    expect(r.restored).toBe(false);
    expect(r.pet.streakRestore).toBeNull();
  });
});

describe('напоминания задач (SPEC 5.1)', () => {
  const task = (id: string, remindAt?: string, doneAt?: number): Task => ({
    id,
    title: id,
    size: 'S',
    recurrence: { kind: 'none' },
    createdAt: 0,
    order: 0,
    ...(remindAt ? { remindAt } : {}),
    ...(doneAt ? { doneAt } : {}),
  });
  it('в remindAt и до часа позже; выполненные и уже показанные — нет', () => {
    const list = [
      task('a', '10:00'),
      task('b', '10:30'),
      task('c', '08:00'),
      task('d', '10:00', 5),
    ];
    expect(dueReminders(list, at(10, 10), []).map((t) => t.id)).toEqual(['a']);
    expect(dueReminders(list, at(10, 40), ['a']).map((t) => t.id)).toEqual(['b']);
  });
});
