import { translate, type Dict } from '../core/i18n';
import type { Lang } from '../core/types';
import ru from '../renderer/i18n/ru.json';
import en from '../renderer/i18n/en.json';

const dicts: Record<Lang, Dict> = { ru, en };
let current: Lang = 'ru';

export function setLang(lang: Lang): void {
  current = lang;
}

export function getDict(): Dict {
  return dicts[current];
}

export function t(key: string, params?: Record<string, string | number>): string {
  return translate(dicts[current], key, params);
}
