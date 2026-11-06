/**
 * Магазин (SPEC 4.9 гардероб, 4.10 угощения). Постоянный ассортимент — никаких «только этот месяц».
 * Монеты не уходят в минус; покупка — только явным действием пользователя.
 */
import { PRICES } from './economy';
import { pickRnd } from './hash';
import type { AccessoryId, EconomyState, PetState } from './types';

export type Slot = 'head' | 'eyes' | 'neck' | 'paw' | 'bg';

export interface WardrobeItem {
  id: AccessoryId;
  slot: Slot;
  price: number;
}

/** 12 предметов: шапки 3, очки 2, шарфы 2, в лапках 3, фон виджета 2 (SPEC 4.9). */
export const WARDROBE: readonly WardrobeItem[] = [
  { id: 'head:beanie', slot: 'head', price: PRICES.cheap },
  { id: 'head:flowers', slot: 'head', price: PRICES.mid },
  { id: 'head:wizard', slot: 'head', price: PRICES.expensive },
  { id: 'eyes:hearts', slot: 'eyes', price: PRICES.cheap },
  { id: 'eyes:sun', slot: 'eyes', price: PRICES.mid },
  { id: 'neck:scarf', slot: 'neck', price: PRICES.cheap },
  { id: 'neck:cape', slot: 'neck', price: PRICES.mid },
  { id: 'paw:flower', slot: 'paw', price: PRICES.cheap },
  { id: 'paw:mug', slot: 'paw', price: PRICES.mid },
  { id: 'paw:wand', slot: 'paw', price: PRICES.expensive },
  { id: 'bg:stars', slot: 'bg', price: PRICES.mid },
  { id: 'bg:meadow', slot: 'bg', price: PRICES.expensive },
];

/** Угощения: дёшево (SPEC 4.10). Лежат в кладовке, не портятся. */
export const TREATS = [
  { id: 'berry', price: 5 },
  { id: 'carrot', price: 6 },
  { id: 'cookie', price: 8 },
  { id: 'cheese', price: 10 },
  { id: 'pie', price: 15 },
] as const;
export type TreatId = (typeof TREATS)[number]['id'];
export const TREAT_IDS: readonly string[] = TREATS.map((t) => t.id);

export const itemById = (id: string) => WARDROBE.find((i) => i.id === id);

type Fail = { ok: false; reason: 'unknown' | 'owned' | 'coins' | 'notOwned' | 'empty' };

export function buyItem(
  pet: PetState,
  e: EconomyState,
  id: string,
): { ok: true; pet: PetState; economy: EconomyState; price: number } | Fail {
  const item = itemById(id);
  if (!item) return { ok: false, reason: 'unknown' };
  if (pet.owned.includes(id)) return { ok: false, reason: 'owned' };
  if (e.coins < item.price) return { ok: false, reason: 'coins' };
  return {
    ok: true,
    pet: { ...pet, owned: [...pet.owned, id] },
    economy: { ...e, coins: e.coins - item.price },
    price: item.price,
  };
}

/** Надеть (один предмет на слот) или снять, если уже надет. */
export function toggleItem(pet: PetState, id: string): { ok: true; pet: PetState } | Fail {
  const item = itemById(id);
  if (!item) return { ok: false, reason: 'unknown' };
  if (!pet.owned.includes(id)) return { ok: false, reason: 'notOwned' };
  if (pet.accessories.includes(id))
    return { ok: true, pet: { ...pet, accessories: pet.accessories.filter((a) => a !== id) } };
  const others = pet.accessories.filter((a) => itemById(a)?.slot !== item.slot);
  return { ok: true, pet: { ...pet, accessories: [...others, id] } };
}

export function buyTreat(
  pet: PetState,
  e: EconomyState,
  id: string,
): { ok: true; pet: PetState; economy: EconomyState; price: number } | Fail {
  const t = TREATS.find((x) => x.id === id);
  if (!t) return { ok: false, reason: 'unknown' };
  if (e.coins < t.price) return { ok: false, reason: 'coins' };
  return {
    ok: true,
    pet: { ...pet, pantry: { ...pet.pantry, [id]: (pet.pantry[id] ?? 0) + 1 } },
    economy: { ...e, coins: e.coins - t.price },
    price: t.price,
  };
}

/** Угостить из кладовки. */
export function takeTreat(pet: PetState, id: string): { ok: true; pet: PetState } | Fail {
  const n = pet.pantry[id] ?? 0;
  if (n <= 0) return { ok: false, reason: 'empty' };
  const pantry = { ...pet.pantry, [id]: n - 1 };
  if (pantry[id] === 0) delete pantry[id];
  return { ok: true, pet: { ...pet, pantry } };
}

/** Подарок (приключение, Путь): случайный ещё не купленный недорогой предмет. */
export function giftItem(pet: PetState, rnd: number): { pet: PetState; itemId: string | null } {
  const left = WARDROBE.filter((i) => i.price <= PRICES.mid && !pet.owned.includes(i.id));
  if (!left.length) return { pet, itemId: null };
  const it = pickRnd(left, rnd);
  return { pet: { ...pet, owned: [...pet.owned, it.id] }, itemId: it.id };
}

/** Самоцвет-задача про еду (SPEC 4.10): «пообедать не за компьютером» — питомец ест рядом. */
const FOOD =
  /(обед|пообедать|поесть|поем|завтрак|позавтракать|ужин|поужинать|перекус|покушать|еда|lunch|breakfast|dinner|snack|\beat\b)/i;
export function isFoodTask(title: string): boolean {
  return FOOD.test(title);
}
