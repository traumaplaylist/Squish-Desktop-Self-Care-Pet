import { getExercise } from './exercises';
import type { SchedulerView } from './scheduler';
import type { PetVisualState } from './types';

/** Не дольше этого без ввода — питомец засыпает (SPEC 4.2). */
export const SLEEP_IDLE_MS = 15 * 60 * 1000;

/**
 * Визуальное состояние питомца по приоритету SPEC 4.2 (R0: перерыв главнее сна).
 * День 2: перерывы, тишина, сон. Потребности (thirsty/tired/happy) — День 5.
 */
export function selectVisual(
  v: SchedulerView,
  ctx: { idleMs: number; nightNoInput: boolean },
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
  if (v.phase === 'suppressed') return 'quiet';
  return 'idle';
}
