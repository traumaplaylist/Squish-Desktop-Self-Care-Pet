/**
 * «Мои цели» (решение владельца 2026-11-06, по мотивам онбординга Finch): человек говорит, с чем ему
 * помочь, и как у него со сном, движением и перегрузом. По ответам подстраиваются настройки,
 * предлагается стартовый план (мелкие ежедневные дела) и Пути.
 * Принципы: ничего медицинского и оценочного; возраст/пол/диагнозы НЕ спрашиваем; всё локально;
 * любой ответ можно пропустить и поменять в настройках. Чистые функции.
 */
import type { JourneyTemplate } from './journeys';
import type { SettingsPatch } from './settingsSchema';
import type { Millis, Settings } from './types';

export const AREAS = ['eyes', 'back', 'water', 'sleep', 'stress', 'focus', 'routine'] as const;
export type Area = (typeof AREAS)[number];

export type SleepAnswer = 'ok' | 'little' | 'hardToWake';
export type ActivityAnswer = 'low' | 'some' | 'lots';
export type OverwhelmAnswer = 'rare' | 'sometimes' | 'often';

export interface Goals {
  areas: Area[];
  sleep: SleepAnswer | null;
  activity: ActivityAnswer | null;
  overwhelm: OverwhelmAnswer | null;
  /** Когда заданы — через 7 дней питомец один раз спросит, не поменять ли. */
  setAt: Millis | null;
  reviewAsked: boolean;
}

export const NO_GOALS: Goals = {
  areas: [],
  sleep: null,
  activity: null,
  overwhelm: null,
  setAt: null,
  reviewAsked: false,
};

export const REVIEW_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** Привести присланное из окна к допустимым значениям. */
export function cleanGoals(raw: unknown, now: Millis): Goals {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const one = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
    allowed.includes(v as T) ? (v as T) : null;
  const areas = Array.isArray(r.areas)
    ? [...new Set(r.areas.filter((a): a is Area => (AREAS as readonly string[]).includes(a)))]
    : [];
  return {
    areas,
    sleep: one(r.sleep, ['ok', 'little', 'hardToWake'] as const),
    activity: one(r.activity, ['low', 'some', 'lots'] as const),
    overwhelm: one(r.overwhelm, ['rare', 'sometimes', 'often'] as const),
    setAt: now,
    reviewAsked: false,
  };
}

const wantsSleep = (g: Goals) =>
  g.areas.includes('sleep') || g.sleep === 'little' || g.sleep === 'hardToWake';
const wantsMove = (g: Goals) => g.areas.includes('back') || g.activity === 'low';
const wantsCalm = (g: Goals) => g.areas.includes('stress') || g.overwhelm === 'often';

/**
 * Подстройка настроек. Меняем только то, что связано с ответами, от значений по умолчанию:
 * повторный вызов после правки целей даёт тот же результат (идемпотентно).
 */
export function adaptSettings(g: Goals, base: Settings): SettingsPatch {
  const d = base;
  const patch: SettingsPatch = {};
  const eyes = g.areas.includes('eyes');
  const focus = g.areas.includes('focus');
  patch.breaks = {
    // глаза — микро-перерыв чаще; фокус (без «глаз») — реже, чтобы не дробить работу
    micro: { ...d.breaks.micro, intervalMin: eyes ? 15 : focus ? 25 : 20 },
    long: { ...d.breaks.long, intervalMin: wantsMove(g) ? 45 : 60 },
    // перегруз — мягкая строгость; фокус без перегруза — обычная (кнопки не сразу)
    strictness: wantsCalm(g) ? 'soft' : d.breaks.strictness,
  };
  patch.water = { remindAfterMin: g.areas.includes('water') ? 60 : 90 };
  patch.blinkPosture = { enabled: eyes || wantsMove(g) };
  patch.tasks = { showSelfCareHints: true };
  return patch;
}

/** Что напоминать: «моргни» — при цели «глаза», «выпрямись» — при «спине»/малой активности. */
export function blinkPostureKinds(g: Goals): ('blink' | 'posture')[] {
  const out: ('blink' | 'posture')[] = [];
  if (g.areas.includes('eyes')) out.push('blink');
  if (wantsMove(g)) out.push('posture');
  return out.length ? out : ['blink', 'posture'];
}

/** Стартовый план (i18n-ключи задач): 5–7 мелких ежедневных дел под ответы. */
export function starterPlan(g: Goals): string[] {
  const plan = ['plan.water', 'plan.stretch'];
  if (g.areas.includes('eyes')) plan.push('plan.window');
  if (wantsSleep(g)) plan.push('plan.bedtime');
  if (wantsCalm(g)) plan.push('plan.breaths', 'plan.oneStep');
  if (g.areas.includes('focus')) plan.push('plan.mainThing');
  if (g.areas.includes('routine')) plan.push('plan.morning');
  plan.push('plan.happy');
  if (!wantsCalm(g)) plan.push('plan.breaths');
  return [...new Set(plan)].slice(0, 7);
}

/** Какие Пути предложить (галочками в стартовом плане, по умолчанию сняты — не навязываем). */
export function suggestedJourneys(g: Goals): JourneyTemplate[] {
  const out: JourneyTemplate[] = [];
  if (g.areas.includes('routine')) out.push('morning');
  if (wantsMove(g)) out.push('back');
  if (wantsSleep(g)) out.push('sleep');
  return out;
}

/** Пора спросить «хочешь поменять цели?» — один раз, через неделю. */
export function shouldReviewGoals(g: Goals, now: Millis): boolean {
  return g.setAt !== null && !g.reviewAsked && now - g.setAt >= REVIEW_AFTER_MS;
}
