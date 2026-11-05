import { useEffect, useState } from 'react';
import { translate, type Dict } from '../../core/i18n';

/** Словарь берём у main (он знает текущий язык). Пока словарь грузится — показываем ключи. */
export function useI18n(): (key: string, params?: Record<string, string | number>) => string {
  const [dict, setDict] = useState<Dict>({});
  useEffect(() => {
    void window.squish.invoke('app:getLangDict').then(setDict);
    // Язык сменили в настройках — перечитать словарь без перезапуска (SPEC 2.4).
    return window.squish.on(
      'lang',
      () => void window.squish.invoke('app:getLangDict').then(setDict),
    );
  }, []);
  return (key, params) => translate(dict, key, params);
}
