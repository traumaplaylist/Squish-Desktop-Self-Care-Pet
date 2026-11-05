/** Простой лог в консоль. Файловые логи с ротацией — День 7. */
const once = new Set<string>();

export function log(msg: string, ...rest: unknown[]): void {
  console.log(`[squish] ${msg}`, ...rest);
}

/** Одна запись на ключ за всю жизнь процесса (SPEC 3.3: «ошибка → один лог»). */
export function logOnce(key: string, msg: string, ...rest: unknown[]): void {
  if (once.has(key)) return;
  once.add(key);
  log(msg, ...rest);
}
