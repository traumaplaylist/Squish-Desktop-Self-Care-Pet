/**
 * Характер питомца (SPEC 4.5, P1): 20 черт. Раскрываются по одной — в приключениях и на новых
 * стадиях. Раскрытые добавляют реплики («trait.<id>.line») и видны во вкладке «Питомец».
 * Тексты — i18n: trait.<id> (описание), trait.<id>.line (реплика).
 */
import { pickBy, pickRnd } from './hash';
import type { PetState, TraitId } from './types';

export const TRAITS = [
  'favoriteFood',
  'morningPerson',
  'nightOwl',
  'fearsThunder',
  'collectsPebbles',
  'favoriteSong',
  'likesRain',
  'hums',
  'countsClouds',
  'lovesSocks',
  'napsInSun',
  'writesPoems',
  'likesStars',
  'sneezesAtFlowers',
  'talksToPlants',
  'lovesPuddles',
  'hoardsSeeds',
  'dreamsOfSea',
  'likesBlankets',
  'keepsSecrets',
] as const satisfies readonly TraitId[];

export type Trait = (typeof TRAITS)[number];

export function unrevealed(p: Pick<PetState, 'revealedTraits'>): Trait[] {
  return TRAITS.filter((t) => !p.revealedTraits.includes(t));
}

/** Раскрыть одну черту (случайную из нераскрытых). Все раскрыты — null. */
export function revealTrait<P extends Pick<PetState, 'revealedTraits'>>(
  p: P,
  rnd: number,
  only?: Trait,
): { pet: P; traitId: Trait | null } {
  const left = unrevealed(p);
  const id = only ? (left.includes(only) ? only : null) : left.length ? pickRnd(left, rnd) : null;
  if (!id) return { pet: p, traitId: null };
  return { pet: { ...p, revealedTraits: [...p.revealedTraits, id] }, traitId: id };
}

/** Реплика по раскрытой черте (для «болтовни»), если есть. */
export function traitLine(p: Pick<PetState, 'revealedTraits'>, rnd: number): string | null {
  const known = p.revealedTraits.filter((t) => (TRAITS as readonly string[]).includes(t));
  return known.length ? `trait.${pickRnd(known, rnd)}.line` : null;
}

/** Любимая еда — постоянная для питомца (от имени), чтобы «угадывать» было честно. */
export function favoriteFood(p: Pick<PetState, 'name'>, treats: readonly string[]): string {
  return pickBy(treats, `food:${p.name}`);
}
