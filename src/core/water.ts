/**
 * Вода (SPEC 4.7 + R0). Чистые функции; «вода» в условиях — потребность 0–100, не стаканы.
 * Энергия и монеты за стакан — День 4 (economy.ts); здесь только учёт и напоминание.
 */
import type { AppEvent } from './events';
import type { DayKey, Millis } from './types';
import { MINUTE, SECOND } from './clock';

export const UNDO_MS = 30 * SECOND;
export const NEED_PER_GLASS = 25;
export const REMIND_LOW_NEED = 40;
export const REMIND_MIN_GAP_MS = 45 * MINUTE;

export interface WaterState {
  day: DayKey;
  glasses: number;
  lastDrinkAt: Millis | null;
  /** Активное время с последнего стакана. */
  activeSinceDrinkMs: number;
  lastReminderAt: Millis | null;
  /** Последний стакан можно отменить 30 с. */
  undo: { at: Millis; prevNeed: number } | null;
}

export interface WaterConfig {
  goalGlasses: number;
  remindAfterMs: number;
}

export function defaultWater(day: DayKey = ''): WaterState {
  return {
    day,
    glasses: 0,
    lastDrinkAt: null,
    activeSinceDrinkMs: 0,
    lastReminderAt: null,
    undo: null,
  };
}

/** Новый логический день: стаканы с нуля (потребность сбрасывает pet, R0: → 70). */
export function waterForDay(w: WaterState, day: DayKey): WaterState {
  return w.day === day ? w : { ...defaultWater(day), lastReminderAt: w.lastReminderAt };
}

export function drink(
  w: WaterState,
  need: number,
  now: Millis,
  cfg: WaterConfig,
): { water: WaterState; need: number; events: AppEvent[]; overGoal: boolean } {
  const glasses = w.glasses + 1;
  return {
    water: {
      ...w,
      glasses,
      lastDrinkAt: now,
      activeSinceDrinkMs: 0,
      undo: { at: now, prevNeed: need },
    },
    need: Math.min(100, need + NEED_PER_GLASS),
    events: [{ type: 'water', at: now, glasses }],
    overGoal: glasses > cfg.goalGlasses,
  };
}

export function canUndo(w: WaterState, now: Millis): boolean {
  return !!w.undo && now - w.undo.at <= UNDO_MS && w.glasses > 0;
}

export function undoDrink(
  w: WaterState,
  need: number,
  now: Millis,
): { water: WaterState; need: number; events: AppEvent[] } | null {
  if (!canUndo(w, now) || !w.undo) return null;
  return {
    water: { ...w, glasses: w.glasses - 1, undo: null },
    need: w.undo.prevNeed,
    events: [{ type: 'water_undo', at: now }],
  };
}

/**
 * Каждый tick: копим активное время и решаем, пора ли мягко напомнить (R0):
 * ≥ remindAfter активного времени без воды ИЛИ потребность < 40 — и не чаще раза в 45 мин.
 * canRemind = false во время перерыва, умной паузы, вне рабочих часов.
 */
export function waterTick(
  w: WaterState,
  p: { activeDeltaMs: number; need: number; now: Millis; canRemind: boolean },
  cfg: WaterConfig,
): { water: WaterState; remind: boolean } {
  const water: WaterState = {
    ...w,
    activeSinceDrinkMs: w.activeSinceDrinkMs + Math.max(0, p.activeDeltaMs),
    undo: w.undo && p.now - w.undo.at > UNDO_MS ? null : w.undo,
  };
  const due = water.activeSinceDrinkMs >= cfg.remindAfterMs || p.need < REMIND_LOW_NEED;
  const gapOk = water.lastReminderAt === null || p.now - water.lastReminderAt >= REMIND_MIN_GAP_MS;
  if (p.canRemind && due && gapOk)
    return { water: { ...water, lastReminderAt: p.now }, remind: true };
  return { water, remind: false };
}
