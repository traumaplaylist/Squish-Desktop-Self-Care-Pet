/**
 * Быстрый ввод (SPEC 2.7): префиксы необязательны, всё остальное — название.
 *   «!» в конце — большая (L) · «каждый день»/«ежедневно» · «по будням» · «по понедельникам и средам»
 *   «в 15:00» / «в 9.30» — напоминание · то же по-английски (every day, weekdays, on mon, at 15:00).
 * Мусорный ввод → null (ничего не создаём).
 */
import type { Recurrence, TaskSize, TimeOfDay, Weekday } from './types';

export interface ParsedTask {
  title: string;
  size: TaskSize;
  recurrence: Recurrence;
  remindAt?: TimeOfDay;
}

const DAY_WORDS: [RegExp, Weekday][] = [
  [/^(понедельник\p{L}*|пн|mon\p{L}*)$/iu, 1],
  [/^(вторник\p{L}*|вт|tue\p{L}*)$/iu, 2],
  [/^(сред\p{L}*|ср|wed\p{L}*)$/iu, 3],
  [/^(четверг\p{L}*|чт|thu\p{L}*)$/iu, 4],
  [/^(пятниц\p{L}*|пт|fri\p{L}*)$/iu, 5],
  [/^(суббот\p{L}*|сб|sat\p{L}*)$/iu, 6],
  [/^(воскресень\p{L}*|вс|sun\p{L}*)$/iu, 0],
];

function weekdayFromWord(w: string): Weekday | null {
  for (const [re, d] of DAY_WORDS) if (re.test(w)) return d;
  return null;
}

const clean = (s: string) =>
  s
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.;:—-]+|[\s,.;:—-]+$/g, '')
    .trim();

export function parseQuickInput(raw: string, defaultSize: TaskSize = 'S'): ParsedTask | null {
  let s = ` ${raw.replace(/[\r\n\t]+/g, ' ')} `;
  let size = defaultSize;
  let recurrence: Recurrence = { kind: 'none' };
  let remindAt: TimeOfDay | undefined;

  // «!» в конце — большая задача
  if (/!\s*$/.test(s)) {
    size = 'L';
    s = s.replace(/!+\s*$/, ' ');
  }

  // напоминание «в 15:00» / «at 9.30»
  const time = /\s(?:в|во|at|@)\s*(\d{1,2})[:.](\d{2})(?=[\s,.!]|$)/iu.exec(s);
  if (time) {
    const h = Number(time[1]);
    const m = Number(time[2]);
    if (h <= 23 && m <= 59) {
      remindAt = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      s = s.replace(time[0], ' ');
    }
  }

  // повтор
  if (/\s(каждый день|ежедневно|every ?day|daily)(?=[\s,.!]|$)/iu.test(s)) {
    recurrence = { kind: 'daily' };
    s = s.replace(/\s(каждый день|ежедневно|every ?day|daily)(?=[\s,.!]|$)/iu, ' ');
  } else if (/\s(по будням|в будни|weekdays|on weekdays)(?=[\s,.!]|$)/iu.test(s)) {
    recurrence = { kind: 'weekdays' };
    s = s.replace(/\s(по будням|в будни|on weekdays|weekdays)(?=[\s,.!]|$)/iu, ' ');
  } else {
    // «по понедельникам и средам», «каждый вторник», «on mon, wed»
    const m =
      /\s(?:по|каждую|каждый|каждое|on|every)\s+([\p{L}]+(?:(?:\s*,\s*|\s+и\s+|\s+and\s+)[\p{L}]+)*)(?=[\s,.!]|$)/iu.exec(
        s,
      );
    if (m) {
      const words = m[1]!.split(/\s*,\s*|\s+и\s+|\s+and\s+/iu);
      const days = words.map(weekdayFromWord);
      if (days.length && days.every((d) => d !== null)) {
        recurrence = { kind: 'days', days: [...new Set(days as Weekday[])].sort() };
        s = s.replace(m[0], ' ');
      }
    }
  }

  const title = clean(s);
  if (!title || !/[\p{L}\p{N}]/u.test(title)) return null;
  return { title: title.slice(0, 200), size, recurrence, ...(remindAt ? { remindAt } : {}) };
}
