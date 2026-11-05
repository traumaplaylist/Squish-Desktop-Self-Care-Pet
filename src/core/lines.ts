/**
 * Реплики питомца (i18n-ключи). Выбор — чистая функция; случайность передаётся снаружи.
 * Тон: мягкий, без давления и медицинских обещаний; в тяжёлый день — только поддержка (SPEC 5.6).
 */
import type { NeedsPose } from './pet';

export const LINES = {
  morning: ['line.morning.1', 'line.morning.2', 'line.morning.3'],
  day: ['line.day.1', 'line.day.2', 'line.day.3'],
  evening: ['line.evening.1', 'line.evening.2', 'line.evening.3'],
  night: ['line.night.1', 'line.night.2'],
  thirsty: ['line.thirsty.1', 'line.thirsty.2'],
  tired: ['line.tired.1', 'line.tired.2'],
  click: ['line.click.1', 'line.click.2', 'line.click.3', 'line.click.4'],
  hardDay: ['line.hard.1', 'line.hard.2', 'line.hard.3', 'line.hard.4'],
} as const;

export const ALL_LINE_KEYS: string[] = Object.values(LINES).flat();

export interface LineContext {
  hour: number;
  pose: NeedsPose;
  hardDay: boolean;
  /** Реплика по клику (иначе — «без повода»). */
  click: boolean;
}

/** rnd ∈ [0, 1). Тяжёлый день — только поддерживающие реплики. */
export function pickLine(c: LineContext, rnd: number): string {
  const pick = (list: readonly string[]) =>
    list[Math.min(list.length - 1, Math.floor(rnd * list.length))]!;
  if (c.hardDay) return pick(LINES.hardDay);
  if (c.pose === 'thirsty') return pick(LINES.thirsty);
  if (c.pose === 'tired') return pick(LINES.tired);
  if (c.click && rnd < 0.5) return pick(LINES.click);
  if (c.hour < 6 || c.hour >= 23) return pick(LINES.night);
  if (c.hour < 12) return pick(LINES.morning);
  if (c.hour < 18) return pick(LINES.day);
  return pick(LINES.evening);
}

/** «Аптечка» тяжёлого дня (SPEC 5.6): 6 действий на 1–2 минуты. */
export const FIRST_AID = ['water', 'breaths', 'window', 'wash', 'message', 'snack'] as const;
