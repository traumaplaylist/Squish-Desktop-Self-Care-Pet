/**
 * Типы состояния Squish (SPEC разделы 2–7, с уточнениями R0 из docs/REVIEW.md).
 * Только типы и константы-перечисления, без логики.
 */

// ───────────── Общее ─────────────
export type Millis = number;
/** Логический день 06:00–06:00 (R0), формат 'YYYY-MM-DD' по дате начала. */
export type DayKey = string;
/** 'HH:MM' */
export type TimeOfDay = string;
export type Lang = 'ru' | 'en';

// ───────────── Перерывы (SPEC 3) ─────────────
export type BreakKind = 'micro' | 'long';
export type Strictness = 'soft' | 'normal' | 'strict';

export type SchedulerPhase =
  | 'working'
  | 'preBreak'
  | 'waitingForPause'
  | 'onBreak'
  | 'paused'
  | 'suppressed'
  | 'idle'
  | 'offHours';

export type SuppressReason =
  'fullscreen' | 'game' | 'presentation' | 'mic' | 'camera' | 'capture' | 'app';

export interface SchedulerState {
  phase: SchedulerPhase;
  /** Накопленное активное время с последнего микро/длинного перерыва. */
  activeSinceMicro: Millis;
  activeSinceLong: Millis;
  /** Какой перерыв сейчас готовится/идёт. */
  pendingKind: BreakKind | null;
  phaseStartedAt: Millis;
  /** Когда закончится текущий перерыв (onBreak). */
  breakEndsAt: Millis | null;
  /** Отложений подряд (сбрасывается после completed/skipped/natural, R0). */
  postponesInRow: number;
  /** Конец ручной паузы. */
  pausedUntil: Millis | null;
  suppression: {
    reason: SuppressReason;
    /** Имя приложения, если известно (exe), — для трея «Тихо: созвон — Discord». */
    app: string | null;
    since: Millis;
  } | null;
  /** Перерыв, наступивший во время подавления, — придёт через кулдаун. */
  dueBreak: { kind: BreakKind; dueSince: Millis } | null;
  lastExerciseId: string | null;
}

export interface Exercise {
  id: string;
  titleKey: string;
  stepsKeys: string[];
  durationSec: number;
  petAnimation: PetAnimation;
}

export type PetAnimation = 'lookFar' | 'stretchUp' | 'breathe' | 'neckRoll' | 'walk' | 'drinkWater';

// ───────────── Питомец (SPEC 4, 7) ─────────────
export type GrowthStage = 'egg' | 'baby' | 'teen' | 'adult' | 'wise';
export type Palette = 'mint' | 'peach' | 'lavender';

export type PetVisualState =
  | 'idle'
  | 'happy'
  | 'sleeping'
  | 'waving'
  | 'adventure'
  | 'quiet'
  | 'thirsty'
  | 'tired'
  | `onBreak:${PetAnimation}`;

export type PetReaction =
  'bounce' | 'drink' | 'celebrate' | 'coinCatch' | 'blink' | 'straighten' | 'hug';

export type AccessoryId = string;
export type MicroPetId = string;
export type TraitId = string;

export interface Needs {
  /** 0–100 */
  water: number;
  eyes: number;
  movement: number;
}

export interface PetState {
  name: string;
  palette: Palette;
  stage: GrowthStage;
  careDays: number;
  streak: number;
  streakFreezes: number;
  needs: Needs;
  energyToday: number;
  accessories: AccessoryId[];
  revealedTraits: TraitId[];
  microPets: { id: MicroPetId; hatchedAt: Millis | null; shown: boolean }[];
  eggs: { receivedAt: Millis; careDaysAtReceive: number }[];
  /** Модификатор «Тяжёлый день» (R0: cozy), действует до закрытия логического дня. */
  hardDay: boolean;
  adventure: { startedAt: Millis; returnsAt: Millis } | null;
}

// ───────────── Задачи (SPEC 5) ─────────────
export type TaskSize = 'S' | 'M' | 'L';
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = воскресенье

export type Recurrence =
  { kind: 'none' } | { kind: 'daily' } | { kind: 'weekdays' } | { kind: 'days'; days: Weekday[] };

export interface Task {
  id: string;
  title: string;
  size: TaskSize;
  parentId?: string;
  recurrence: Recurrence;
  remindAt?: TimeOfDay;
  journeyId?: string;
  createdAt: Millis;
  doneAt?: Millis;
  order: number;
  /** Для экземпляров повторяющихся задач — id шаблона и логический день. */
  templateId?: string;
  day?: DayKey;
  /** R0: сколько реально выплачено и сколько списано при снятии галочки. */
  rewardPaid?: { energy: number; coins: number };
  rewardRevoked?: { energy: number; coins: number };
}

export interface Journey {
  id: string;
  title: string;
  completions: number;
  milestonesReached: number[];
}

// ───────────── Экономика (SPEC 5.4) ─────────────
export interface EconomyState {
  coins: number;
  /** Счётчики логического дня. */
  day: DayKey;
  coinsFromTasksToday: number;
  /** Остаток полумонет мягкого потолка (R0). */
  halfCoinRemainder: number;
  creationRewardsToday: number;
  blinkPostureAcksToday: number;
}

// ───────────── Настройки (SPEC 2.4) ─────────────
export interface WorkHours {
  enabled: boolean;
  days: Weekday[];
  from: TimeOfDay;
  to: TimeOfDay;
}

export interface Settings {
  lang: Lang;
  breaks: {
    micro: { enabled: boolean; intervalMin: number; durationSec: number };
    long: { enabled: boolean; intervalMin: number; durationMin: number };
    warningSec: number;
    strictness: Strictness;
    overlayOpacity: number;
    background: 'gradient1' | 'gradient2' | 'gradient3';
  };
  smartPause: {
    fullscreen: boolean;
    mic: boolean;
    camera: boolean;
    capture: boolean;
    exceptionApps: string[];
    /** R0: приложения, которые держат микрофон постоянно и созвоном не считаются. */
    ignoreMicApps: string[];
    dontInterruptTyping: boolean;
    cooldownMin: 1 | 2 | 5;
    workHours: WorkHours;
  };
  water: { goalGlasses: number; glassMl: number; remindAfterMin: number };
  tasks: { defaultSize: TaskSize; showSelfCareHints: boolean };
  blinkPosture: { enabled: boolean; intervalMin: number };
  pet: {
    chatter: 'often' | 'rare' | 'off';
    sounds: boolean;
    volume: number;
    showMicroPets: boolean;
  };
  general: {
    autostart: boolean;
    clickThrough: boolean;
    hideFromCapture: boolean;
  };
  hotkeys: {
    quickTask: string;
    water: string;
    breakNow: string;
    toggleWidget: string;
  };
}

// ───────────── Окна и общее состояние ─────────────
/** R0: позиция относительно workArea монитора. */
export interface WidgetPosition {
  displayId: number;
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayInfo {
  id: number;
  workArea: Rect;
  primary: boolean;
}

/** Содержимое state.json. */
export interface PersistedState {
  pet: PetState;
  economy: EconomyState;
  scheduler: SchedulerState;
  widget: { position: WidgetPosition | null; visible: boolean };
  onboardingDone: boolean;
  lastDayClosed: DayKey | null;
}

/** Содержимое tasks.json. */
export interface PersistedTasks {
  tasks: Task[];
  journeys: Journey[];
}

/** Снапшот, который main рассылает во все окна. */
export interface Snapshot {
  debug: boolean;
  lang: Lang;
  pet: {
    name: string;
    palette: Palette;
    stage: GrowthStage;
    visual: PetVisualState;
    cozy: boolean;
    needs: Needs;
  };
  tasksToday: { done: number; total: number };
  nextBreakInSec: number | null;
  quiet: { reason: SuppressReason; app: string | null } | null;
  hotkeysFailed: string[];
}
