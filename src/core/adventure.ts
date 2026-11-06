/**
 * Приключения (SPEC 4.4, P1). Цель дня достигнута → питомец собирает рюкзак и уходит на 30 мин.
 * Перерывы при этом работают (поза перерыва главнее, SPEC 4.2). Возвращается с историей
 * «{место} + {событие} + {находка}» (по 30 фрагментов, i18n adv.place.N / adv.event.N / adv.find.N)
 * и находкой: монеты 5–15, иногда предмет (15%), яйцо (10%) или новая черта.
 */
import { MINUTE } from './clock';
import { giveEgg, ADVENTURE_EGG_PCT } from './microPets';
import { giftItem } from './shop';
import { revealTrait } from './traits';
import type { DiaryEntry, Millis, PetState } from './types';

export const ADVENTURE_MS = 30 * MINUTE;
export const FRAGMENTS = 30;
export const ADVENTURE_COINS = { min: 5, max: 15 } as const;
export const ITEM_PCT = 15;
export const TRAIT_PCT = 35;

export function startAdventure(p: PetState, now: Millis): PetState {
  if (p.adventure) return p;
  return { ...p, adventure: { startedAt: now, returnsAt: now + ADVENTURE_MS } };
}

export function adventureDue(p: PetState, now: Millis): boolean {
  return !!p.adventure && now >= p.adventure.returnsAt;
}

const frag = (kind: string, r: number) =>
  `adv.${kind}.${1 + (Math.floor(r * FRAGMENTS) % FRAGMENTS)}`;

/**
 * Вернуться: история + находка. rnd — источник случайности (в тестах детерминированный).
 * Монеты возвращаются отдельно — их начисляет вызывающий (экономика не здесь).
 */
export function finishAdventure(
  p: PetState,
  now: Millis,
  rnd: () => number,
): { pet: PetState; entry: DiaryEntry; coins: number } {
  let pet: PetState = { ...p, adventure: null };
  const parts = [frag('place', rnd()), frag('event', rnd()), frag('find', rnd())];
  const coins =
    ADVENTURE_COINS.min + Math.floor(rnd() * (ADVENTURE_COINS.max - ADVENTURE_COINS.min + 1));
  const loot: NonNullable<DiaryEntry['loot']> = { coins };
  if (rnd() * 100 < ITEM_PCT) {
    const g = giftItem(pet, rnd());
    pet = g.pet;
    if (g.itemId) loot.itemId = g.itemId;
  }
  if (rnd() * 100 < ADVENTURE_EGG_PCT) {
    pet = giveEgg(pet, 'adventure', now, `adv:${now}`);
    loot.egg = true;
  }
  if (rnd() * 100 < TRAIT_PCT) {
    const t = revealTrait(pet, rnd());
    pet = t.pet;
    if (t.traitId) loot.traitId = t.traitId;
  }
  const entry: DiaryEntry = { at: now, kind: 'adventure', parts, loot };
  return { pet: addDiary(pet, entry), entry, coins };
}

export const DIARY_MAX = 300;

/** Дневник хранит последние 300 записей. */
export function addDiary(p: PetState, e: DiaryEntry): PetState {
  const diary = [...p.diary, e];
  return { ...p, diary: diary.length > DIARY_MAX ? diary.slice(-DIARY_MAX) : diary };
}
