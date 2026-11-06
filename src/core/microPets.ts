/**
 * Микро-питомцы (SPEC 4.8, P1): 12 видов, яйцо вылупляется через 3 дня заботы.
 * Источники яиц: большая задача (20%), этап Пути, 7 дней серии, приключение (10%).
 */
import { hash32 } from './hash';
import type { MicroPetId, Millis, PetState } from './types';

export const MICRO_PETS = [
  'snail',
  'firefly',
  'mushroom',
  'cloud',
  'pebble',
  'sprout',
  'bee',
  'ladybug',
  'jelly',
  'moth',
  'acorn',
  'star',
] as const satisfies readonly MicroPetId[];

export const HATCH_CARE_DAYS = 3;
export const MAX_SHOWN = 2;
export const BIG_TASK_EGG_PCT = 20;
export const ADVENTURE_EGG_PCT = 10;

/** Выдать яйцо. Вид — первый ещё не полученный (по сиду), когда все есть — любой. */
export function giveEgg(p: PetState, source: string, at: Millis, seed: string): PetState {
  const have = new Set<string>([
    ...p.microPets.map((m) => m.id),
    ...p.eggs.map((e) => e.kind ?? ''),
  ]);
  const left = MICRO_PETS.filter((k) => !have.has(k));
  const pool = left.length ? left : MICRO_PETS;
  const kind = pool[hash32(seed) % pool.length]!;
  return {
    ...p,
    eggs: [...p.eggs, { receivedAt: at, careDaysAtReceive: p.careDays, kind, source }],
  };
}

/** Вылупить яйца, у которых прошло 3 дня заботы. Новые показываются, пока в виджете < 2. */
export function hatchEggs(p: PetState, at: Millis): { pet: PetState; hatched: MicroPetId[] } {
  const hatched: MicroPetId[] = [];
  const eggs: PetState['eggs'] = [];
  let microPets = p.microPets;
  for (const e of p.eggs) {
    if (p.careDays - e.careDaysAtReceive >= HATCH_CARE_DAYS) {
      const id = e.kind ?? MICRO_PETS[hash32(String(e.receivedAt)) % MICRO_PETS.length]!;
      const shown = microPets.filter((m) => m.shown).length < MAX_SHOWN;
      microPets = [...microPets, { id, hatchedAt: at, shown }];
      hatched.push(id);
    } else eggs.push(e);
  }
  if (!hatched.length) return { pet: p, hatched };
  return { pet: { ...p, eggs, microPets }, hatched };
}

/** Показать/скрыть в виджете (не больше двух). index — номер в коллекции (виды могут повторяться). */
export function toggleShown(p: PetState, index: number): PetState {
  const m = p.microPets[index];
  if (!m) return p;
  if (!m.shown && p.microPets.filter((x) => x.shown).length >= MAX_SHOWN) return p;
  return {
    ...p,
    microPets: p.microPets.map((x, i) => (i === index ? { ...x, shown: !x.shown } : x)),
  };
}
