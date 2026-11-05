import { describe, expect, it } from 'vitest';
import { ALL_LINE_KEYS, FIRST_AID, LINES, pickLine } from './lines';
import ru from '../renderer/i18n/ru.json';
import en from '../renderer/i18n/en.json';

const base = { hour: 10, pose: 'idle' as const, hardDay: false, click: false };

describe('реплики', () => {
  it('не меньше 20 реплик, у всех есть ru и en', () => {
    expect(ALL_LINE_KEYS.length).toBeGreaterThanOrEqual(20);
    for (const k of ALL_LINE_KEYS) {
      expect(ru, k).toHaveProperty([k]);
      expect(en, k).toHaveProperty([k]);
    }
  });
  it('тяжёлый день — только поддерживающие', () => {
    for (let r = 0; r < 1; r += 0.05)
      expect(LINES.hardDay).toContain(pickLine({ ...base, hardDay: true, pose: 'thirsty' }, r));
  });
  it('потребности важнее времени суток', () => {
    expect(LINES.thirsty).toContain(pickLine({ ...base, pose: 'thirsty' }, 0.9));
    expect(LINES.tired).toContain(pickLine({ ...base, pose: 'tired' }, 0.1));
  });
  it('время суток', () => {
    expect(LINES.morning).toContain(pickLine({ ...base, hour: 8 }, 0.3));
    expect(LINES.day).toContain(pickLine({ ...base, hour: 14 }, 0.3));
    expect(LINES.evening).toContain(pickLine({ ...base, hour: 20 }, 0.3));
    expect(LINES.night).toContain(pickLine({ ...base, hour: 1 }, 0.3));
  });
  it('по клику — иногда «кликовые» реплики; rnd=0.999 не выходит за массив', () => {
    expect(LINES.click).toContain(pickLine({ ...base, click: true }, 0.2));
    expect(typeof pickLine({ ...base, click: true }, 0.999)).toBe('string');
  });
  it('у «Аптечки» 6 действий и тексты на двух языках', () => {
    expect(FIRST_AID).toHaveLength(6);
    for (const id of FIRST_AID) {
      expect(ru).toHaveProperty([`firstAid.${id}`]);
      expect(en).toHaveProperty([`firstAid.${id}`]);
    }
  });
});
