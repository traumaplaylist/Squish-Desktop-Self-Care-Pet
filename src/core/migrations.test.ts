import { describe, expect, it } from 'vitest';
import { defaultState } from './defaults';
import { migrateState, STATE_VERSION, stateMigrations } from './migrations';

/** Форма state.json Дня 1 (схема v1) — самый старый файл, который может встретиться. */
const V1 = {
  pet: {
    name: 'Старый',
    palette: 'peach',
    stage: 'baby',
    careDays: 2,
    streak: 1,
    streakFreezes: 0,
    needs: { water: 70, eyes: 100, movement: 100 },
    energyToday: 0,
    accessories: [],
    revealedTraits: [],
    microPets: [],
    eggs: [],
    hardDay: false,
    adventure: null,
  },
  economy: {
    coins: 12,
    day: '',
    coinsFromTasksToday: 0,
    halfCoinRemainder: 0,
    creationRewardsToday: 0,
    blinkPostureAcksToday: 0,
  },
  scheduler: {
    phase: 'working',
    activeSinceMicro: 0,
    activeSinceLong: 0,
    pendingKind: null,
    phaseStartedAt: 0,
    breakEndsAt: null,
    postponesInRow: 0,
    pausedUntil: null,
    suppression: null,
    dueBreak: null,
    lastExerciseId: null,
  },
  widget: { position: { displayId: 1, x: 10, y: 20 }, visible: true },
  onboardingDone: false,
  lastDayClosed: null,
};

const keysDeep = (o: unknown, p = ''): string[] =>
  typeof o === 'object' && o !== null && !Array.isArray(o)
    ? Object.entries(o).flatMap(([k, v]) => [`${p}${k}`, ...keysDeep(v, `${p}${k}.`)])
    : [];

describe('миграции state.json', () => {
  it('есть миграция с каждой старой версии', () => {
    const m = stateMigrations(() => 0);
    for (let v = 1; v < STATE_VERSION; v++) expect(m[v], `v${v}`).toBeTypeOf('function');
  });
  it('файл v1 доходит до текущей версии со всеми полями и без потери данных', () => {
    const out = migrateState(V1, 1, () => 0) as ReturnType<typeof defaultState>;
    const need = keysDeep(defaultState(0)).filter((k) => !k.startsWith('widget.position'));
    const have = new Set(keysDeep(out));
    expect(need.filter((k) => !have.has(k))).toEqual([]);
    expect(out.pet.name).toBe('Старый');
    expect(out.economy.coins).toBe(12);
    expect(out.widget.position).toEqual({ displayId: 1, x: 10, y: 20 });
  });
  it('с каждой промежуточной версии — тоже', () => {
    for (let v = 1; v < STATE_VERSION; v++) {
      const partial = migrateState(V1, 1, () => 0);
      expect(() => migrateState(partial, STATE_VERSION, () => 0)).not.toThrow();
    }
  });
});
