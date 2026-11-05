import type { PersistedState, PersistedTasks, Settings } from './types';
import { defaultWater } from './water';

/** Настройки по умолчанию (SPEC 2.4, R0: рабочие часы выключены). */
export const DEFAULT_SETTINGS: Settings = {
  lang: 'ru',
  breaks: {
    micro: { enabled: true, intervalMin: 20, durationSec: 20 },
    long: { enabled: true, intervalMin: 60, durationMin: 5 },
    warningSec: 30,
    strictness: 'normal',
    overlayOpacity: 0.8,
    background: 'gradient1',
  },
  smartPause: {
    fullscreen: true,
    mic: true,
    camera: true,
    capture: true,
    exceptionApps: [],
    ignoreMicApps: [],
    dontInterruptTyping: true,
    cooldownMin: 1,
    workHours: { enabled: false, days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' },
  },
  water: { goalGlasses: 8, glassMl: 250, remindAfterMin: 90 },
  tasks: { defaultSize: 'S', showSelfCareHints: true },
  blinkPosture: { enabled: true, intervalMin: 30 },
  pet: { chatter: 'often', sounds: true, volume: 0.4, showMicroPets: true },
  general: { autostart: true, clickThrough: false, hideFromCapture: true },
  hotkeys: {
    quickTask: 'Ctrl+Alt+T',
    water: 'Ctrl+Alt+W',
    breakNow: 'Ctrl+Alt+B',
    toggleWidget: 'Ctrl+Alt+P',
  },
};

export function defaultState(now: number): PersistedState {
  return {
    pet: {
      name: 'Сквиш',
      palette: 'mint',
      stage: 'baby',
      careDays: 0,
      streak: 0,
      streakFreezes: 0,
      needs: { water: 70, eyes: 100, movement: 100 },
      energyToday: 0,
      accessories: [],
      revealedTraits: [],
      microPets: [],
      eggs: [],
      hardDay: false,
      adventure: null,
      goalDay: null,
      checkin: { day: '', mood: null },
      firstAid: { day: '', done: [] },
    },
    economy: {
      coins: 0,
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
      phaseStartedAt: now,
      breakEndsAt: null,
      exerciseId: null,
      lastExerciseId: null,
      postponesInRow: 0,
      pausedUntil: null,
      suppression: null,
      dueBreak: null,
      cooldownUntil: null,
      lastTickAt: null,
      naturalCounted: false,
    },
    water: defaultWater(),
    activity: { day: '', activeMs: 0 },
    widget: { position: null, visible: true },
    onboardingDone: false,
    lastDayClosed: null,
  };
}

export function defaultTasks(): PersistedTasks {
  return { tasks: [], journeys: [] };
}
