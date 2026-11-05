import { describe, expect, it } from 'vitest';
import { EXERCISES, getExercise, MICRO_EXERCISE, pickExercise } from './exercises';
import ru from '../renderer/i18n/ru.json';
import en from '../renderer/i18n/en.json';

describe('exercises', () => {
  it('12 упражнений с уникальными id', () => {
    expect(EXERCISES).toHaveLength(12);
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(12);
  });
  it('только P0-анимации (R0): lookFar, stretchUp, breathe', () => {
    for (const e of [...EXERCISES, MICRO_EXERCISE])
      expect(['lookFar', 'stretchUp', 'breathe']).toContain(e.petAnimation);
  });
  it('у всех текстов есть ключи ru и en', () => {
    for (const e of [...EXERCISES, MICRO_EXERCISE]) {
      for (const k of [e.titleKey, ...e.stepsKeys]) {
        expect(ru, k).toHaveProperty([k]);
        expect(en, k).toHaveProperty([k]);
      }
    }
  });
  it('pickExercise детерминирован и не повторяет предыдущее', () => {
    for (let seed = 0; seed < 200_000; seed += 1000) {
      const a = pickExercise(null, seed);
      expect(pickExercise(null, seed)).toBe(a);
      expect(pickExercise(a.id, seed).id).not.toBe(a.id);
    }
  });
  it('getExercise: неизвестный id → микро', () => {
    expect(getExercise('nope')).toBe(MICRO_EXERCISE);
    expect(getExercise('walk').id).toBe('walk');
  });
});
