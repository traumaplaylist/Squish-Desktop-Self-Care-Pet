export type Dict = Record<string, string>;

/** Подстановка {name} в строку. Нет ключа — возвращаем сам ключ, чтобы дыра была видна. */
export function translate(dict: Dict, key: string, params?: Record<string, string | number>): string {
  const raw = dict[key];
  if (raw === undefined) return key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, p: string) => (p in params ? String(params[p]) : m));
}
