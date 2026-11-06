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
  /** Упражнение текущего перерыва и предыдущего (без повторов подряд). */
  exerciseId: string | null;
  lastExerciseId: string | null;
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
  /** После снятия подавления перерывы не начинаются до этого момента. */
  cooldownUntil: Millis | null;
  /** Время прошлого tick — для подсчёта активного времени. null = после старта/сна. */
  lastTickAt: Millis | null;
  /** Текущий отрезок простоя уже засчитан как естественный перерыв. */
  naturalCounted: boolean;
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
/** Вид питомца: SVG-блоб «Сквиш» или зверь из деталей (renderer/pet/species). */
export type SpeciesId = 'blob' | 'hamster';
export const SPECIES: readonly SpeciesId[] = ['blob', 'hamster'];

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
  | 'bounce'
  | 'drink'
  | 'celebrate'
  | 'coinCatch'
  | 'blink'
  | 'straighten'
  | 'hug'
  // SPEC 4.10 (тактильность, P1): погладить, пощекотать, потрясти; угостить — Неделя 2
  | 'purr'
  | 'giggle'
  | 'dizzy'
  | 'eat';

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
  species: SpeciesId;
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
  /** Яйца микро-питомцев (SPEC 4.8): вид определяется при получении, вылупляется через 3 дня заботы. */
  eggs: { receivedAt: Millis; careDaysAtReceive: number; kind?: MicroPetId; source?: string }[];
  /** Купленное в гардеробе (SPEC 4.9). Надетое — accessories. */
  owned: AccessoryId[];
  /** Кладовка с угощениями (SPEC 4.10): id → сколько. Не портится. */
  pantry: Record<string, number>;
  /** Дневник: истории приключений, ответы на вечерний вопрос, черты, яйца (SPEC 2.3). */
  diary: DiaryEntry[];
  /** Вечерний вопрос (SPEC 4.6, P1): раз в логический день. */
  evening: { day: DayKey; questionKey: string | null; answered: boolean };
  /** Восстановление серии (SPEC 4.3, P1): 48 ч, «день-догонялка» (цель ×1,5). */
  streakRestore: { lost: number; until: Millis } | null;
  /** Напоминания задач (SPEC 5.1, P1), уже показанные сегодня. */
  reminded: { day: DayKey; ids: string[] };
  /** Модификатор «Тяжёлый день» (R0: cozy), действует до закрытия логического дня. */
  hardDay: boolean;
  adventure: { startedAt: Millis; returnsAt: Millis } | null;
  /** День, в который цель уже отпраздновали (чтобы радоваться один раз). */
  goalDay: DayKey | null;
  /** Чек-ин настроения (SPEC 4.6): питомец спрашивает первым, раз в логический день. */
  checkin: { day: DayKey; mood: 1 | 2 | 3 | 4 | 5 | null };
  /** «Аптечка» тяжёлого дня: что уже сделано сегодня. */
  firstAid: { day: DayKey; done: string[] };
}

/** Запись дневника. Тексты — i18n-ключи, кроме ответа пользователя (text). */
export interface DiaryEntry {
  at: Millis;
  kind: 'adventure' | 'evening' | 'trait' | 'egg' | 'hatch' | 'journey';
  /** adventure: [место, событие, находка]. */
  parts?: string[];
  params?: Record<string, string | number>;
  questionKey?: string;
  text?: string;
  /** Что нашёл/получил: монеты, предмет, яйцо, черта. */
  loot?: { coins?: number; itemId?: string; egg?: boolean; traitId?: string; microPetId?: string };
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
  /** i18n-ключ шаблона Пути (journey.morning …). */
  title: string;
  startedAt?: Millis;
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
    /** «Минималистичный виджет» (SPEC 4.10): без островка под питомцем. */
    minimalWidget: boolean;
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

/** Действия кнопок в облачке питомца. */
export type BubbleAction =
  | 'water:drink'
  | 'water:undo'
  | 'quiet:ignoreApp'
  | 'dismiss'
  | 'checkin:1'
  | 'checkin:2'
  | 'checkin:3'
  | 'checkin:4'
  | 'checkin:5'
  | 'hardDay:on'
  | 'evening:answer'
  | 'adventure:diary'
  | `task:done:${string}`;

export interface Bubble {
  textKey: string;
  params?: Record<string, string | number>;
  /** Дополнительные i18n-ключи после текста (история приключения: место, событие, находка). */
  parts?: string[];
  actions?: { labelKey: string; action: BubbleAction }[];
}

/** Содержимое state.json. */
export interface PersistedState {
  pet: PetState;
  economy: EconomyState;
  scheduler: SchedulerState;
  water: import('./water').WaterState;
  /** Активное время за логический день (для статистики). */
  activity: { day: DayKey; activeMs: number };
  widget: { position: WidgetPosition | null; visible: boolean };
  onboardingDone: boolean;
  lastDayClosed: DayKey | null;
}

/** Содержимое tasks.json. */
export interface PersistedTasks {
  tasks: Task[];
  journeys: Journey[];
}

/** Задачи для панели (main → окно задач), только при изменении. */
export interface TaskItemView {
  id: string;
  title: string;
  size: TaskSize;
  recurring: boolean;
  remindAt: TimeOfDay | null;
  done: boolean;
  children: { id: string; title: string; done: boolean }[];
}

export interface TasksView {
  open: TaskItemView[];
  done: TaskItemView[];
  counts: { done: number; total: number };
  /** Можно отменить удаление (5 с). */
  canUndoDelete: boolean;
  /** Подсказки self-care (SPEC 5.3), если включены. */
  hints: string[];
  /** «Аптечка» (SPEC 5.6) — только в тяжёлый день. */
  firstAid: { id: string; labelKey: string; done: boolean }[] | null;
  defaultSize: TaskSize;
  /** «Пути» (SPEC 5.5): начатые и доступные. */
  journeys: {
    active: { id: string; titleKey: string; completions: number; next: number | null }[];
    available: string[];
  };
}

/** «Дом питомца» (SPEC 2.3). */
export interface HomeStats {
  today: import('./stats').DayStats & {
    score: number | null;
    waterGoal: number;
    energyGoal: number;
  };
  week: (import('./stats').DayStats & { score: number | null })[];
  pet: {
    name: string;
    species: SpeciesId;
    accessories: AccessoryId[];
    stage: GrowthStage;
    palette: Palette;
    careDays: number;
    streak: number;
    streakFreezes: number;
    coins: number;
    traits: TraitId[];
    /** Любимое угощение — только если черта уже раскрыта. */
    favoriteFood: string | null;
    microPets: { id: MicroPetId; shown: boolean }[];
    eggs: { daysLeft: number }[];
    owned: AccessoryId[];
    pantry: Record<string, number>;
    streakRestore: { lost: number; until: Millis; goal: number } | null;
  };
  /** Магазин: постоянный ассортимент (SPEC 4.9, 4.10). */
  shop: {
    wardrobe: { id: AccessoryId; slot: string; price: number }[];
    treats: { id: string; price: number }[];
  };
  /** Дневник: новые сверху (SPEC 2.3). */
  diary: DiaryEntry[];
  /** Вечерний вопрос, если ещё не отвечен сегодня. */
  evening: { questionKey: string } | null;
  /** Какую вкладку открыть (облачко «ответить» / «в дневник»), один раз. */
  openTab?: 'today' | 'week' | 'pet' | 'diary' | 'shop';
}

/** Снапшот, который main рассылает во все окна. */
export interface Snapshot {
  debug: boolean;
  lang: Lang;
  /** Тема окон по системной (nativeTheme). */
  theme: 'light' | 'dark';
  pet: {
    name: string;
    species: SpeciesId;
    palette: Palette;
    stage: GrowthStage;
    visual: PetVisualState;
    /** Надетое (R0/SPEC 4.9): 'outfit:wizard' и т. п. */
    accessories: AccessoryId[];
    cozy: boolean;
    needs: Needs;
    careDays: number;
    streak: number;
    /** Ушёл в приключение — вернётся к этому времени (SPEC 4.4). */
    adventure: { returnsAt: Millis } | null;
    /** Микро-питомцы на виду (до двух). */
    microPets: MicroPetId[];
  };
  /** Островок под питомцем (SPEC 4.10): выключен в «минималистичном виджете». */
  island: { enabled: boolean; timeOfDay: 'morning' | 'day' | 'evening' | 'night' };
  tasksToday: { done: number; total: number };
  economy: { coins: number; energyToday: number; goal: number };
  sounds: { enabled: boolean; volume: number };
  scheduler: import('./scheduler').SchedulerView;
  overlayOpacity: number;
  /** Фон оверлея (SPEC 2.2, P1): 3 спокойных анимированных градиента. */
  overlayBackground: 'gradient1' | 'gradient2' | 'gradient3';
  /** Реплика питомца в облачке (не связанная с перерывом). */
  bubble: Bubble | null;
  water: { glasses: number; goal: number };
  /** Хоткеи, которые не удалось зарегистрировать (заняты другой программой). */
  hotkeysFailed: string[];
  /** Только в SQUISH_DEBUG. */
  debugInfo: {
    speed: number;
    now: number;
    activeSinceMicroSec: number;
    activeSinceLongSec: number;
    dueBreak: BreakKind | null;
    cooldownSec: number | null;
    simSuppression: { reason: SuppressReason; untilSec: number } | null;
    fakeIdleMs: number | null;
    detectors: {
      mic: string[] | 'unknown';
      camera: string[] | 'unknown';
      fullscreen: string | null;
      foregroundExe: string | null;
    } | null;
  } | null;
}
