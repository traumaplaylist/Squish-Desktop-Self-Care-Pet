import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './storage';

/**
 * Экспорт/импорт всех данных (SPEC 6, P1). Формат — один JSON-файл, а не zip:
 * без зависимостей, читается глазами, проверяется целиком перед импортом.
 */
export const EXPORT_FORMAT = 'squish-export';
export const EXPORT_VERSION = 1;
const STORES = ['settings', 'state', 'tasks'] as const;

export interface ExportBundle {
  format: typeof EXPORT_FORMAT;
  version: number;
  appVersion: string;
  exportedAt: string;
  stores: Partial<Record<(typeof STORES)[number], unknown>>;
  /** events/YYYY-MM.jsonl → содержимое. */
  events: Record<string, string>;
}

export function buildExport(dataDir: string, appVersion: string, now: Date): ExportBundle {
  const stores: ExportBundle['stores'] = {};
  for (const n of STORES) {
    try {
      stores[n] = JSON.parse(fs.readFileSync(path.join(dataDir, `${n}.json`), 'utf8'));
    } catch {
      /* нет файла — не беда */
    }
  }
  const events: Record<string, string> = {};
  const evDir = path.join(dataDir, 'events');
  try {
    for (const f of fs.readdirSync(evDir)) {
      if (/^\d{4}-\d{2}\.jsonl$/.test(f)) events[f] = fs.readFileSync(path.join(evDir, f), 'utf8');
    }
  } catch {
    /* событий ещё нет */
  }
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    appVersion,
    exportedAt: now.toISOString(),
    stores,
    events,
  };
}

/** Проверить файл импорта целиком. Ошибка → понятная причина, ничего не трогаем. */
export function parseExport(
  text: string,
): { ok: true; bundle: ExportBundle } | { ok: false; reason: string } {
  let b: unknown;
  try {
    b = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not-json' };
  }
  const x = b as Partial<ExportBundle>;
  if (!x || x.format !== EXPORT_FORMAT) return { ok: false, reason: 'not-squish' };
  if (typeof x.version !== 'number' || x.version > EXPORT_VERSION)
    return { ok: false, reason: 'newer-version' };
  if (typeof x.stores !== 'object' || x.stores === null) return { ok: false, reason: 'no-data' };
  for (const n of STORES) {
    const s = (x.stores as Record<string, unknown>)[n];
    if (s === undefined) continue;
    const env = s as { schemaVersion?: unknown; data?: unknown };
    if (typeof env.schemaVersion !== 'number' || !('data' in env))
      return { ok: false, reason: `bad-${n}` };
  }
  if (typeof x.events !== 'object' || x.events === null) return { ok: false, reason: 'bad-events' };
  for (const k of Object.keys(x.events)) {
    if (
      !/^\d{4}-\d{2}\.jsonl$/.test(k) ||
      typeof (x.events as Record<string, unknown>)[k] !== 'string'
    ) {
      return { ok: false, reason: 'bad-events' };
    }
  }
  return { ok: true, bundle: x as ExportBundle };
}

/**
 * Применить импорт: текущие файлы сначала копируются в backups/before-import-<ts>/, затем
 * записываются атомарно. Миграции схем сработают при следующем запуске (JsonStore).
 */
export function applyImport(dataDir: string, bundle: ExportBundle, stamp: string): string {
  const safe = path.join(dataDir, 'backups', `before-import-${stamp}`);
  fs.mkdirSync(path.join(safe, 'events'), { recursive: true });
  for (const n of STORES) {
    const f = path.join(dataDir, `${n}.json`);
    if (fs.existsSync(f)) fs.copyFileSync(f, path.join(safe, `${n}.json`));
  }
  const evDir = path.join(dataDir, 'events');
  if (fs.existsSync(evDir)) {
    for (const f of fs.readdirSync(evDir))
      fs.copyFileSync(path.join(evDir, f), path.join(safe, 'events', f));
  }
  for (const n of STORES) {
    const s = bundle.stores[n];
    if (s !== undefined)
      writeFileAtomic(path.join(dataDir, `${n}.json`), JSON.stringify(s, null, 2));
  }
  fs.mkdirSync(evDir, { recursive: true });
  for (const [f, text] of Object.entries(bundle.events)) writeFileAtomic(path.join(evDir, f), text);
  return safe;
}
