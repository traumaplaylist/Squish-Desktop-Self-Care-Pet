/**
 * Единый лог событий (SPEC 6 + R0: break_interrupted). Пишется в events/YYYY-MM.jsonl.
 */
import type { BreakKind, Millis, SuppressReason, TaskSize } from './types';

interface Base<T extends string> {
  type: T;
  at: Millis;
}

export type AppEvent =
  | (Base<'break_completed'> & { kind: BreakKind; exerciseId: string | null })
  | (Base<'break_skipped'> & { kind: BreakKind })
  | (Base<'break_postponed'> & { kind: BreakKind; inRow: number })
  | (Base<'break_interrupted'> & { kind: BreakKind; reason: SuppressReason })
  | (Base<'natural_break'> & { idleSec: number })
  | (Base<'water'> & { glasses: number })
  | Base<'water_undo'>
  | (Base<'task_created'> & { taskId: string; size: TaskSize; coins: number })
  | (Base<'task_completed'> & { taskId: string; energy: number; coins: number; surprise: boolean })
  | (Base<'task_uncompleted'> & { taskId: string; energy: number; coins: number })
  | (Base<'task_split'> & { taskId: string; count: number })
  | (Base<'mood_checkin'> & { mood: 1 | 2 | 3 | 4 | 5 })
  | (Base<'evening_answer'> & { questionKey: string; text: string })
  | Base<'blink_ack'>
  | Base<'posture_ack'>
  | (Base<'adventure_started'> & { returnsAt: Millis })
  | (Base<'adventure_finished'> & { storyKey: string; coins: number })
  | (Base<'stage_up'> & { stage: string })
  | (Base<'trait_revealed'> & { traitId: string })
  | (Base<'egg_received'> & { source: string })
  | (Base<'egg_hatched'> & { microPetId: string })
  | (Base<'purchase'> & { itemId: string; price: number })
  | Base<'hard_day_on'>
  | Base<'hard_day_off'>
  | Base<'streak_freeze_used'>
  | Base<'streak_restored'>
  | (Base<'app_start'> & { version: string })
  | Base<'app_quit'>
  | (Base<'suppressed_start'> & { reason: SuppressReason; app: string | null })
  | (Base<'suppressed_end'> & { reason: SuppressReason; durationMs: number });

export type AppEventType = AppEvent['type'];

/** Эффекты, которые core возвращает, а main исполняет. */
export type Effect =
  | { type: 'log'; event: AppEvent }
  | { type: 'showOverlay'; kind: BreakKind; exerciseId: string; endsAt: number }
  | { type: 'prepareOverlay' }
  | { type: 'hideOverlay' }
  | { type: 'petReaction'; reaction: import('./types').PetReaction }
  | { type: 'bubble'; textKey: string; params?: Record<string, string | number>; ttlMs: number }
  | { type: 'save' };
