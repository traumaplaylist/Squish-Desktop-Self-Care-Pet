import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './defaults';
import {
  adaptSettings,
  blinkPostureKinds,
  cleanGoals,
  NO_GOALS,
  REVIEW_AFTER_MS,
  shouldReviewGoals,
  starterPlan,
  suggestedJourneys,
  type Goals,
} from './goals';
import { validateSettings } from './settingsSchema';
import ru from '../renderer/i18n/ru.json';
import en from '../renderer/i18n/en.json';

const g = (o: Partial<Goals> = {}): Goals => ({ ...NO_GOALS, ...o });
const apply = (x: Goals) => validateSettings(adaptSettings(x, DEFAULT_SETTINGS), DEFAULT_SETTINGS);

describe('«Мои цели» (онбординг по мотивам Finch)', () => {
  it('мусор из окна отбрасывается, ответы можно пропустить', () => {
    const c = cleanGoals({ areas: ['eyes', 'eyes', 'hack'], sleep: 'nope', activity: 'low' }, 5);
    expect(c).toEqual({ ...NO_GOALS, areas: ['eyes'], activity: 'low', setAt: 5 });
    expect(cleanGoals(null, 1).areas).toEqual([]);
  });
  it('без целей — настройки по умолчанию', () => {
    const s = apply(g());
    expect(s.breaks.micro.intervalMin).toBe(20);
    expect(s.breaks.long.intervalMin).toBe(60);
    expect(s.breaks.strictness).toBe('normal');
    expect(s.blinkPosture.enabled).toBe(false);
  });
  it('глаза → микро чаще и «моргни»; спина/мало движения → разминка чаще и «выпрямись»', () => {
    const s = apply(g({ areas: ['eyes'], activity: 'low' }));
    expect(s.breaks.micro.intervalMin).toBe(15);
    expect(s.breaks.long.intervalMin).toBe(45);
    expect(s.blinkPosture.enabled).toBe(true);
    expect(blinkPostureKinds(g({ areas: ['eyes'] }))).toEqual(['blink']);
    expect(blinkPostureKinds(g({ areas: ['back'] }))).toEqual(['posture']);
  });
  it('перегруз → мягкая строгость; вода → напоминание раньше; фокус → микро реже', () => {
    expect(apply(g({ overwhelm: 'often' })).breaks.strictness).toBe('soft');
    expect(apply(g({ areas: ['water'] })).water.remindAfterMin).toBe(60);
    expect(apply(g({ areas: ['focus'] })).breaks.micro.intervalMin).toBe(25);
  });
  it('идемпотентно: повтор подстройки не «уезжает»', () => {
    const once = apply(g({ areas: ['eyes', 'back'] }));
    const twice = validateSettings(adaptSettings(g({ areas: ['eyes', 'back'] }), once), once);
    expect(twice).toEqual(once);
  });
  it('стартовый план 5–7 дел, под ответы; Пути только предлагаются', () => {
    for (const x of [g(), g({ areas: ['eyes', 'sleep', 'stress', 'focus', 'routine'] })]) {
      const p = starterPlan(x);
      expect(p.length).toBeGreaterThanOrEqual(4);
      expect(p.length).toBeLessThanOrEqual(7);
      expect(new Set(p).size).toBe(p.length);
      for (const k of p)
        for (const d of [ru, en] as Record<string, string>[]) expect(d[k], k).toBeTruthy();
    }
    expect(starterPlan(g({ sleep: 'hardToWake' }))).toContain('plan.bedtime');
    expect(suggestedJourneys(g({ areas: ['routine'], activity: 'low', sleep: 'little' }))).toEqual([
      'morning',
      'back',
      'sleep',
    ]);
  });
  it('через неделю — один вопрос «поменять цели?»', () => {
    expect(shouldReviewGoals(g({ setAt: 0 }), REVIEW_AFTER_MS - 1)).toBe(false);
    expect(shouldReviewGoals(g({ setAt: 0 }), REVIEW_AFTER_MS)).toBe(true);
    expect(shouldReviewGoals(g({ setAt: 0, reviewAsked: true }), REVIEW_AFTER_MS)).toBe(false);
    expect(shouldReviewGoals(g(), REVIEW_AFTER_MS)).toBe(false);
  });
  it('в текстах нет медицинских слов', () => {
    const bad = /(диагноз|лечит|болезн|расстройств|пациент|diagnos|disorder|patient|cure)/i;
    for (const d of [ru, en] as Record<string, string>[])
      for (const [k, v] of Object.entries(d))
        if (/^(onb\.|goal\.|plan\.|goals\.|bp\.)/.test(k)) expect(v, k).not.toMatch(bad);
  });
});
