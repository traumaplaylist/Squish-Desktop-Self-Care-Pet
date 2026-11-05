import { getExercise } from './exercises';
import { needsPose } from './pet';
import type { SchedulerView } from './scheduler';
import type { Needs, PetVisualState } from './types';

/** Не дольше этого без ввода — питомец засыпает (SPEC 4.2). */
export const SLEEP_IDLE_MS = 15 * 60 * 1000;

/**
 * Визуальное состояние по приоритету SPEC 4.2 (R0: перерыв главнее сна):
 * onBreak → waving → sleeping → adventure → quiet → thirsty → tired → happy → idle.
 */
export function selectVisual(
  v: SchedulerView,
  ctx: { idleMs: number; nightNoInput: boolean; needs: Needs; adventure?: boolean },
): PetVisualState {
  if (v.phase === 'onBreak' && v.break)
    return `onBreak:${getExercise(v.break.exerciseId).petAnimation}`;
  if (v.phase === 'preBreak' || v.phase === 'waitingForPause') return 'waving';
  if (
    v.phase === 'offHours' ||
    v.phase === 'paused' ||
    ctx.idleMs >= SLEEP_IDLE_MS ||
    ctx.nightNoInput
  ) {
    return 'sleeping';
  }
  if (ctx.adventure) return 'adventure';
  if (v.phase === 'suppressed') return 'quiet';
  return needsPose(ctx.needs);
}
