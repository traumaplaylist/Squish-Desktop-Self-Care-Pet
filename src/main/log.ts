import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Лог в консоль и в файл logs/squish.log с ротацией 5 × 1 МБ (SPEC/PROMPTS День 7).
 * Без сети и без телеметрии: файл лежит только у пользователя.
 */
const once = new Set<string>();
let dir: string | null = null;
export const LOG_MAX_BYTES = 1024 * 1024;
export const LOG_FILES = 5;

export function initFileLog(logDir: string): void {
  dir = logDir;
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    dir = null;
  }
}

/** squish.log → squish.1.log → … → squish.4.log (самый старый удаляется). */
export function rotate(logDir: string, maxBytes = LOG_MAX_BYTES, files = LOG_FILES): void {
  const main = path.join(logDir, 'squish.log');
  let size = 0;
  try {
    size = fs.statSync(main).size;
  } catch {
    return;
  }
  if (size < maxBytes) return;
  for (let i = files - 1; i >= 1; i--) {
    const from = i === 1 ? main : path.join(logDir, `squish.${i - 1}.log`);
    const to = path.join(logDir, `squish.${i}.log`);
    try {
      if (fs.existsSync(from)) fs.renameSync(from, to);
    } catch {
      /* лог — не повод падать */
    }
  }
}

function toText(v: unknown): string {
  if (v instanceof Error) return v.stack ?? v.message;
  return typeof v === 'string' ? v : JSON.stringify(v);
}

function writeFile(line: string): void {
  if (!dir) return;
  try {
    rotate(dir);
    fs.appendFileSync(path.join(dir, 'squish.log'), line + '\n', 'utf8');
  } catch {
    /* лог — не повод падать */
  }
}

export function log(msg: string, ...rest: unknown[]): void {
  const text = [msg, ...rest.map(toText)].join(' ');
  console.log(`[squish] ${text}`);
  writeFile(`${new Date().toISOString()} ${text}`);
}

/** Одна запись на ключ за всю жизнь процесса (SPEC 3.3: «ошибка → один лог»). */
export function logOnce(key: string, msg: string, ...rest: unknown[]): void {
  if (once.has(key)) return;
  once.add(key);
  log(msg, ...rest);
}
