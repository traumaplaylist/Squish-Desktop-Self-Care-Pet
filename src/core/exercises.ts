import type { Exercise } from './types';

/**
 * Упражнения длинного перерыва (SPEC 3.5). Анимации питомца (R0): P0 — lookFar, stretchUp, breathe;
 * P1 (Неделя 2) — neckRoll, walk, drinkWater;
 * остальные упражнения переиспользуют их. Тексты — только i18n-ключи, без медицинских обещаний.
 */
export const EXERCISES: readonly Exercise[] = [
  ex('head-tilts', 3, 'neckRoll'),
  ex('shoulder-rolls', 3, 'stretchUp'),
  ex('wrists', 3, 'breathe'),
  ex('walk', 2, 'walk'),
  ex('reach-up', 3, 'stretchUp'),
  ex('shoulder-blades', 3, 'stretchUp'),
  ex('window', 2, 'lookFar'),
  ex('slow-breathing', 3, 'breathe'),
  ex('fists', 2, 'breathe'),
  ex('seated-twist', 3, 'stretchUp'),
  ex('water', 2, 'drinkWater'),
  ex('palming', 2, 'lookFar'),
];

/** Микро-перерыв 20-20-20: всегда «посмотреть вдаль». */
export const MICRO_EXERCISE: Exercise = ex('look-far', 1, 'lookFar', 20);

function ex(
  id: string,
  steps: number,
  petAnimation: Exercise['petAnimation'],
  durationSec = 300,
): Exercise {
  return {
    id,
    titleKey: `exercise.${id}.title`,
    stepsKeys: Array.from({ length: steps }, (_, i) => `exercise.${id}.step${i + 1}`),
    durationSec,
    petAnimation,
  };
}

export function getExercise(id: string | null): Exercise {
  if (id === MICRO_EXERCISE.id) return MICRO_EXERCISE;
  return EXERCISES.find((e) => e.id === id) ?? MICRO_EXERCISE;
}

/**
 * Следующее упражнение: псевдослучайно от seed (обычно now), но никогда не повторяет предыдущее.
 * Чистая функция — без Math.random, чтобы тесты были детерминированы.
 */
export function pickExercise(
  lastId: string | null,
  seed: number,
  list: readonly Exercise[] = EXERCISES,
): Exercise {
  if (list.length === 0) return MICRO_EXERCISE;
  const hash = Math.imul(Math.floor(seed / 1000) | 0, 2654435761) >>> 0;
  let idx = hash % list.length;
  if (list.length > 1 && list[idx]!.id === lastId) idx = (idx + 1) % list.length;
  return list[idx]!;
}
