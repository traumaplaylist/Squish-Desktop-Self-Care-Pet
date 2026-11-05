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
  Snapshot,
  SuppressReason,
} from './types';

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
};
const EVENTS: Record<keyof MainEvents, true> = {
  snapshot: true,
  'pet:play': true,
  'pet:eyes': true,
  'pet:paused': true,
  'overlay:done': true,
  'overlay:fadeOut': true,
};

export const RENDERER_COMMANDS = Object.keys(COMMANDS) as (keyof RendererCommands)[];
export const RENDERER_INVOKES = Object.keys(INVOKES) as (keyof RendererInvokes)[];
export const MAIN_EVENTS = Object.keys(EVENTS) as (keyof MainEvents)[];

export interface SquishApi {
  invoke<K extends keyof RendererInvokes>(channel: K): Promise<RendererInvokes[K]['result']>;
  send<K extends keyof RendererCommands>(channel: K, payload: RendererCommands[K]): void;
  on<K extends keyof MainEvents>(channel: K, cb: (payload: MainEvents[K]) => void): () => void;
}
