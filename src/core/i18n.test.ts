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

describe('i18n — тексты Недели 2 есть для всего, что выдаёт ядро', () => {
  it('приключения, черты, предметы, угощения, микро-питомцы, Пути, вечерние вопросы', async () => {
    const { FRAGMENTS } = await import('./adventure');
    const { TRAITS } = await import('./traits');
    const { WARDROBE, TREATS } = await import('./shop');
    const { MICRO_PETS } = await import('./microPets');
    const { JOURNEY_TEMPLATES } = await import('./journeys');
    const { EVENING_QUESTIONS } = await import('./evening');
    const need: string[] = [];
    for (let i = 1; i <= FRAGMENTS; i++)
      need.push(`adv.place.${i}`, `adv.event.${i}`, `adv.find.${i}`);
    for (const t of TRAITS) need.push(`trait.${t}`, `trait.${t}.line`);
    for (const i of WARDROBE) need.push(`item.${i.id}`);
    for (const t of TREATS) need.push(`treat.${t.id}`);
    for (const m of MICRO_PETS) need.push(`micro.${m}`);
    for (const [id, keys] of Object.entries(JOURNEY_TEMPLATES)) need.push(`journey.${id}`, ...keys);
    need.push(...EVENING_QUESTIONS);
    for (const d of [ru, en] as Record<string, string>[])
      expect(need.filter((k) => !(k in d))).toEqual([]);
  });
});
