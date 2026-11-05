import type { PetVisualState } from '../../core/types';

/** Дыхание: период, амплитуда растяжения и покачивание (градусы) по состоянию. */
const BREATH: Record<
  'idle' | 'happy' | 'sleeping',
  { periodMs: number; amp: number; swayDeg: number }
> = {
  idle: { periodMs: 3600, amp: 0.028, swayDeg: 0 },
  happy: { periodMs: 1800, amp: 0.03, swayDeg: 2 },
  sleeping: { periodMs: 5500, amp: 0.032, swayDeg: 0 },
};
export const BREATH_TICK_MS = 150;

/** Трансформация дыхания в момент t (мс). Чистая функция — проверяется тестом. */
export function breathTransform(state: PetVisualState, t: number): string {
  const b = BREATH[state === 'happy' || state === 'sleeping' ? state : 'idle'];
  const phase = (t / b.periodMs) * Math.PI * 2;
  const k = (1 - Math.cos(phase)) / 2; // 0 → 1 → 0 за период
  const sx = 1 + (b.amp / 2) * k;
  const sy = 1 - b.amp * k;
  const rot = b.swayDeg * Math.sin(phase / 2);
  return `scale(${sx.toFixed(4)}, ${sy.toFixed(4)}) rotate(${rot.toFixed(2)}deg)`;
}
