/**
 * Типизированный контракт IPC между main, preload и renderer. Только типы.
 * Renderer шлёт команды; main — единственный источник истины и рассылает снапшот.
 */
import type { Palette, PetReaction, PetVisualState, Snapshot } from './types';

export interface ProbeResult {
  platform: string;
  koffi: { loaded: boolean; version: string | null; error: string | null };
  /** Код SHQueryUserNotificationState или 'unknown' (не Windows / ошибка). */
  notificationState: number | 'unknown';
}

/** main → renderer */
export interface MainEvents {
  snapshot: Snapshot;
  'pet:play': PetReaction;
  /** Направление взгляда в [-1, 1] или null — смотреть прямо. */
  'pet:eyes': { x: number; y: number } | null;
  'pet:paused': boolean;
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
  'debug:setVisual': PetVisualState | null;
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

export const RENDERER_COMMANDS: readonly (keyof RendererCommands)[] = [
  'widget:click',
  'widget:dragStart',
  'widget:dragEnd',
  'widget:contextMenu',
  'widget:hover',
  'debug:setVisual',
  'debug:play',
  'debug:setPalette',
  'debug:resetPosition',
];

export const RENDERER_INVOKES: readonly (keyof RendererInvokes)[] = [
  'app:getSnapshot',
  'app:getLangDict',
  'debug:probe',
];

export const MAIN_EVENTS: readonly (keyof MainEvents)[] = [
  'snapshot',
  'pet:play',
  'pet:eyes',
  'pet:paused',
];

export interface SquishApi {
  invoke<K extends keyof RendererInvokes>(channel: K): Promise<RendererInvokes[K]['result']>;
  send<K extends keyof RendererCommands>(channel: K, payload: RendererCommands[K]): void;
  on<K extends keyof MainEvents>(channel: K, cb: (payload: MainEvents[K]) => void): () => void;
}
