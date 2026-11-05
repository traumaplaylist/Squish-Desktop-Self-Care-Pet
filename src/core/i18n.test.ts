import { describe, expect, it } from 'vitest';
import { translate } from './i18n';
import ru from '../renderer/i18n/ru.json';
import en from '../renderer/i18n/en.json';

describe('translate', () => {
  it('подставляет параметры', () => {
    expect(translate({ a: 'Через {n} мин' }, 'a', { n: 12 })).toBe('Через 12 мин');
  });
  it('нет ключа → ключ', () => {
    expect(translate({}, 'tray.quit')).toBe('tray.quit');
  });
  it('неизвестный параметр остаётся как есть', () => {
    expect(translate({ a: '{x} и {y}' }, 'a', { x: 1 })).toBe('1 и {y}');
  });
});

describe('i18n ru/en', () => {
  it('одинаковые наборы ключей', () => {
    const r = Object.keys(ru).sort();
    const e = Object.keys(en).sort();
    expect(r.filter((k) => !e.includes(k))).toEqual([]);
    expect(e.filter((k) => !r.includes(k))).toEqual([]);
  });
  it('нет пустых строк', () => {
    for (const d of [ru, en] as Record<string, string>[]) {
      for (const [k, v] of Object.entries(d)) expect(v.trim(), k).not.toBe('');
    }
  });
});
