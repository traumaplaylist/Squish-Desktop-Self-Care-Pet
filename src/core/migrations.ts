/**
 * Миграции state.json (SPEC 6: «схема + версия + миграции»). Ключ — версия, ИЗ которой мигрируем.
 * Новое поле в PersistedState ⇒ новая версия + миграция; тест migrations.test.ts это сторожит.
 */
import { defaultState } from './defaults';
import type { PersistedState } from './types';

export const STATE_VERSION = 7;

export function stateMigrations(now: () => number): Record<number, (d: unknown) => unknown> {
  const def = () => defaultState(now());
  return {
    // v1 (День 1) → v2 (День 2): новые поля планировщика.
    1: (d) => {
      const s = d as PersistedState;
      return { ...s, scheduler: { ...def().scheduler, ...s.scheduler } };
    },
    // v2 → v3 (День 3): учёт воды.
    2: (d) => ({ ...(d as PersistedState), water: def().water }),
    // v3 → v4 (День 5): цель дня, чек-ин, «Аптечка».
    3: (d) => {
      const s = d as PersistedState;
      return { ...s, pet: { ...def().pet, ...s.pet } };
    },
    // v4 → v5 (День 6): активное время за день для статистики.
    4: (d) => ({ ...(d as PersistedState), activity: def().activity }),
    // v5 → v6: вид питомца (блоб по умолчанию — у кого уже был питомец, он не меняется).
    5: (d) => {
      const s = d as PersistedState;
      return { ...s, pet: { ...s.pet, species: s.pet.species ?? 'blob' } };
    },
    // v6 → v7 (Неделя 2): гардероб, кладовка, дневник, вечерний вопрос, восстановление серии,
    // напоминания. Надетый наряд 'outfit:wizard' (Debug) превращается в купленные предметы.
    6: (d) => {
      const s = d as PersistedState;
      const p = def().pet;
      const legacy = (s.pet.accessories ?? []).includes('outfit:wizard');
      const wizard = ['head:wizard', 'neck:cape', 'paw:wand'];
      const accessories = legacy
        ? [...s.pet.accessories.filter((a) => a !== 'outfit:wizard'), ...wizard]
        : (s.pet.accessories ?? []);
      return {
        ...s,
        pet: {
          ...p,
          ...s.pet,
          accessories,
          owned: legacy ? wizard : p.owned,
        },
      };
    },
  };
}

/** Прогнать данные версии `from` до текущей. */
export function migrateState(data: unknown, from: number, now: () => number): unknown {
  const m = stateMigrations(now);
  let d = data;
  for (let v = from; v < STATE_VERSION; v++) {
    const f = m[v];
    if (!f) throw new Error(`нет миграции с версии ${v}`);
    d = f(d);
  }
  return d;
}
