/**
 * Типизированный контракт IPC между main, preload и renderer. Только типы.
 * Renderer шлёт команды; main — единственный источник истины и рассылает снапшот.
 */
import type {
  BreakKind,
  BubbleAction,
  Palette,
  PetReaction,
  PetVisualState,
  HomeStats,
  Lang,
  Palette as PaletteT,
  Settings,
  Snapshot,
  SpeciesId,
  Strictness,
  SuppressReason,
  TasksView,
} from './types';
import type { SettingsPatch } from './settingsSchema';

export interface ProbeResult {
  platform: string;
  koffi: { loaded: boolean; version: string | null; error: string | null };
  /** Код SHQueryUserNotificationState или 'unknown' (не Windows / ошибка). */
  notificationState: number | 'unknown';
  /** ConsentStore\microphone: число записей через koffi и через reg.exe; одинаковы ли ключи. */
  consent: { koffi: number | 'unknown'; reg: number | 'unknown'; sameKeys: boolean | null };
  /** exe окна на переднем плане (basename). */
  foreground: string | null | 'unknown';
}

/** main → renderer */
export interface MainEvents {
  snapshot: Snapshot;
  'pet:play': PetReaction;
  /** Направление взгляда в [-1, 1] или null — смотреть прямо. */
  'pet:eyes': { x: number; y: number } | null;
  'pet:paused': boolean;
  /** Оверлей: перерыв досижен — радость 1,5 с, потом окно тает. */
  'overlay:done': null;
  /** Оверлей: плавно исчезнуть. */
  'overlay:fadeOut': null;
  /** Оверлей показан (окна создаются заранее скрытыми) — колокольчик начала перерыва. */
  'overlay:shown': null;
  /** Окно задач: список изменился. */
  tasks: TasksView;
  /** Окно задач: показать в режиме быстрого ввода или панели. t0 — момент вызова (для замера < 150 мс). */
  'tasks:mode': { mode: 'quick' | 'panel'; t0: number };
  /** Виджет: монетки летят к питомцу. */
  'pet:coins': { count: number; surprise: boolean };
  /** Язык сменился — перечитать словарь (SPEC 2.4: без перезапуска). */
  lang: Lang;
  /** Настройки изменились (окно настроек). */
  settings: Settings;
  /** «Дом питомца»: открыть вкладку (дневник по вечернему вопросу, гардероб…). */
  'home:tab': HomeTab;
}

export type HomeTab = 'today' | 'week' | 'pet' | 'diary' | 'shop';

export interface OnboardingResult {
  name: string;
  species: SpeciesId;
  palette: PaletteT;
  goalGlasses: number;
  strictness: Strictness;
  tasks: string[];
  autostart: boolean;
}

/** renderer → main (fire-and-forget) */
export interface RendererCommands {
  'widget:click': null;
  /** Начать перетаскивание: смещение курсора внутри окна (DIP). */
  'widget:dragStart': { offsetX: number; offsetY: number };
  'widget:dragEnd': null;
  'widget:contextMenu': null;
  /** Курсор над питомцем/кнопками (true) или над прозрачной пустотой (false). */
  'widget:hover': boolean;
  'break:startNow': null;
  'break:postpone': null;
  'break:skip': null;
  'break:now': BreakKind;
  'water:drink': null;
  'tasks:open': null;
  'tasks:create': { text: string };
  'tasks:complete': string;
  'tasks:uncomplete': string;
  'tasks:split': string;
  'tasks:rename': { id: string; title: string };
  /** Ушли с подзадач родителя — удалить пустые. */
  'tasks:blurSubtasks': string;
  'tasks:delete': string;
  'tasks:undoDelete': null;
  'tasks:reorder': string[];
  'tasks:hide': null;
  'tasks:setMode': 'quick' | 'panel';
  /** Окно задач видно и поле в фокусе: t0 из 'tasks:mode' (замер). */
  'tasks:shown': number;
  'tasks:firstAid': string;
  /** Пути (SPEC 5.5). */
  'journey:start': string;
  'journey:stop': string;
  /** Магазин: предмет гардероба или угощение (SPEC 4.9, 4.10). */
  'shop:buy': string;
  'wardrobe:toggle': string;
  'pet:feed': string;
  /** Показать/скрыть микро-питомца в виджете (номер в коллекции). */
  'micro:toggle': number;
  /** Ответ на вечерний вопрос (SPEC 4.6). */
  'evening:answer': string;
  'app:open': 'home' | 'settings' | 'tasks';
  'settings:update': SettingsPatch;
  /** Сброс прогресса (окно уже дважды спросило). */
  'settings:resetProgress': null;
  'onboarding:finish': OnboardingResult;
  'debug:pet': 'careDay' | 'stageUp' | 'needsLow' | 'energy' | 'coins';
  'debug:species': SpeciesId;
  /** Надеть/снять наряд (до гардероба — только Debug). */
  'debug:outfit': string | null;
  /** Debug: приключение «сейчас» / вернуться сейчас, яйцо, вечерний вопрос. */
  'debug:week2': 'adventure' | 'return' | 'egg' | 'hatch' | 'evening' | 'trait';
  'bubble:action': BubbleAction;
  'debug:setVisual': PetVisualState | null;
  'debug:setSpeed': number;
  /** Имитация простоя ввода (мс) или null — реальный простой. */
  'debug:fakeIdle': number | null;
  'debug:suppress': { reason: SuppressReason; minutes: number } | null;
  'debug:play': PetReaction;
  'debug:setPalette': Palette;
  'debug:resetPosition': null;
}

/** renderer → main с ответом */
export interface RendererInvokes {
  'app:getSnapshot': { args: null; result: Snapshot };
  'app:getLangDict': { args: null; result: Record<string, string> };
  'debug:probe': { args: null; result: ProbeResult };
  'tasks:get': { args: null; result: TasksView };
  'home:get': { args: null; result: HomeStats };
  'settings:get': {
    args: null;
    result: { settings: Settings; hotkeysFailed: string[]; version: string };
  };
  /** Экспорт/импорт данных (P1): системный диалог в main. reason — ключ ошибки. */
  'data:export': { args: null; result: { ok: boolean; path?: string; reason?: string } };
  'data:import': { args: null; result: { ok: boolean; path?: string; reason?: string } };
}

/*
 * Белые списки каналов для preload. Record<keyof …, true> — TypeScript не даст забыть канал:
 * новый ключ в интерфейсе без записи здесь — ошибка компиляции.
 */
const COMMANDS: Record<keyof RendererCommands, true> = {
  'widget:click': true,
  'widget:dragStart': true,
  'widget:dragEnd': true,
  'widget:contextMenu': true,
  'widget:hover': true,
  'break:startNow': true,
  'break:postpone': true,
  'break:skip': true,
  'break:now': true,
  'water:drink': true,
  'tasks:open': true,
  'tasks:create': true,
  'tasks:complete': true,
  'tasks:uncomplete': true,
  'tasks:split': true,
  'tasks:rename': true,
  'tasks:blurSubtasks': true,
  'tasks:delete': true,
  'tasks:undoDelete': true,
  'tasks:reorder': true,
  'tasks:hide': true,
  'tasks:setMode': true,
  'tasks:shown': true,
  'tasks:firstAid': true,
  'journey:start': true,
  'journey:stop': true,
  'shop:buy': true,
  'wardrobe:toggle': true,
  'pet:feed': true,
  'micro:toggle': true,
  'evening:answer': true,
  'app:open': true,
  'settings:update': true,
  'settings:resetProgress': true,
  'onboarding:finish': true,
  'debug:pet': true,
  'debug:species': true,
  'debug:outfit': true,
  'debug:week2': true,
  'bubble:action': true,
  'debug:setVisual': true,
  'debug:setSpeed': true,
  'debug:fakeIdle': true,
  'debug:suppress': true,
  'debug:play': true,
  'debug:setPalette': true,
  'debug:resetPosition': true,
};
const INVOKES: Record<keyof RendererInvokes, true> = {
  'app:getSnapshot': true,
  'app:getLangDict': true,
  'debug:probe': true,
  'tasks:get': true,
  'home:get': true,
  'settings:get': true,
  'data:export': true,
  'data:import': true,
};
const EVENTS: Record<keyof MainEvents, true> = {
  snapshot: true,
  'pet:play': true,
  'pet:eyes': true,
  'pet:paused': true,
  'overlay:done': true,
  'overlay:fadeOut': true,
  'overlay:shown': true,
  tasks: true,
  'tasks:mode': true,
  'pet:coins': true,
  lang: true,
  settings: true,
  'home:tab': true,
};

export const RENDERER_COMMANDS = Object.keys(COMMANDS) as (keyof RendererCommands)[];
export const RENDERER_INVOKES = Object.keys(INVOKES) as (keyof RendererInvokes)[];
export const MAIN_EVENTS = Object.keys(EVENTS) as (keyof MainEvents)[];

export interface SquishApi {
  invoke<K extends keyof RendererInvokes>(channel: K): Promise<RendererInvokes[K]['result']>;
  send<K extends keyof RendererCommands>(channel: K, payload: RendererCommands[K]): void;
  on<K extends keyof MainEvents>(channel: K, cb: (payload: MainEvents[K]) => void): () => void;
}
