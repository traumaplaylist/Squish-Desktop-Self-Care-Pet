import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AppEvent } from '../core/events';

/**
 * Хранилище на JSON (CLAUDE.md, SPEC 6).
 * Файл: { "schemaVersion": N, "data": ... }. Запись атомарная: tmp → fsync → rename.
 * Повреждённый файл переименовывается в <name>.broken-<ts>.json, приложение стартует с дефолтов.
 * Ежедневный бэкап: backups/YYYY-MM-DD/<name>.json, хранятся последние 7 дней.
 * Повреждённый файл → восстановление из самого свежего целого бэкапа (если есть).
 */

export interface StoreOptions<T> {
  dir: string;
  name: string; // без .json
  version: number;
  defaults: () => T;
  /** Миграции: ключ — версия, ИЗ которой мигрируем (v → v+1). */
  migrations?: Record<number, (data: unknown) => unknown>;
  now: () => number;
  log?: (msg: string) => void;
  /** Папка бэкапов (backups/) — для восстановления повреждённого файла. */
  backupDir?: string;
}

interface Envelope {
  schemaVersion: number;
  data: unknown;
}

export type LoadOutcome = 'missing' | 'ok' | 'migrated' | 'broken' | 'restored';

const RENAME_RETRIES = 5;

/** rename на Windows иногда падает с EPERM/EBUSY, пока файл держит антивирус или индексатор. */
function renameWithRetry(from: string, to: string): void {
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (i >= RENAME_RETRIES || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES'))
        throw e;
      const until = Date.now() + 20 * (i + 1);
      while (Date.now() < until) {
        /* короткое ожидание, синхронно — запись маленькая и редкая */
      }
    }
  }
}

export function writeFileAtomic(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, content, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  renameWithRetry(tmp, file);
}

export class JsonStore<T> {
  private readonly file: string;
  private data: T;
  private timer: NodeJS.Timeout | null = null;
  private dirty = false;
  lastLoad: LoadOutcome = 'missing';

  constructor(private readonly opts: StoreOptions<T>) {
    this.file = path.join(opts.dir, `${opts.name}.json`);
    this.data = this.load();
  }

  get(): T {
    return this.data;
  }

  /** Заменить данные и запланировать запись через delayMs (0 — сразу). */
  set(data: T, delayMs = 10_000): void {
    this.data = data;
    this.dirty = true;
    if (delayMs <= 0) {
      this.flush();
      return;
    }
    if (this.timer) return; // уже запланировано — запишем свежие данные тогда же
    this.timer = setTimeout(() => this.flush(), delayMs);
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty) return;
    const env: Envelope = { schemaVersion: this.opts.version, data: this.data };
    writeFileAtomic(this.file, JSON.stringify(env, null, 2));
    this.dirty = false;
  }

  /** Самый свежий целый бэкап этого файла (с миграцией до текущей версии) или undefined. */
  private restoreFromBackup(): T | undefined {
    const dir = this.opts.backupDir;
    if (!dir) return undefined;
    let days: string[];
    try {
      days = fs
        .readdirSync(dir)
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .sort()
        .reverse();
    } catch {
      return undefined;
    }
    for (const d of days) {
      try {
        const env = JSON.parse(
          fs.readFileSync(path.join(dir, d, `${this.opts.name}.json`), 'utf8'),
        ) as Envelope;
        if (typeof env?.schemaVersion !== 'number' || env.schemaVersion > this.opts.version)
          continue;
        let data = env.data;
        for (let v = env.schemaVersion; v < this.opts.version; v++) {
          const m = this.opts.migrations?.[v];
          if (!m) throw new Error('нет миграции');
          data = m(data);
        }
        return data as T;
      } catch {
        /* этот бэкап тоже битый — пробуем более старый */
      }
    }
    return undefined;
  }

  private load(): T {
    // Хвост прерванной записи: tmp без rename — просто удаляем.
    try {
      fs.rmSync(`${this.file}.tmp`, { force: true });
    } catch {
      /* не критично */
    }
    let raw: string;
    try {
      raw = fs.readFileSync(this.file, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        this.lastLoad = 'missing';
        return this.opts.defaults();
      }
      throw e;
    }
    try {
      const env = JSON.parse(raw) as Partial<Envelope>;
      if (
        typeof env !== 'object' ||
        env === null ||
        typeof env.schemaVersion !== 'number' ||
        !('data' in env)
      ) {
        throw new Error('нет schemaVersion/data');
      }
      if (env.schemaVersion > this.opts.version) {
        throw new Error(`версия схемы ${env.schemaVersion} новее, чем ${this.opts.version}`);
      }
      let data = env.data;
      let v = env.schemaVersion;
      while (v < this.opts.version) {
        const m = this.opts.migrations?.[v];
        if (!m) throw new Error(`нет миграции с версии ${v}`);
        data = m(data);
        v++;
      }
      this.lastLoad = env.schemaVersion === this.opts.version ? 'ok' : 'migrated';
      if (this.lastLoad === 'migrated') {
        this.data = data as T;
        this.dirty = true;
        this.flush();
      }
      return data as T;
    } catch (e) {
      const broken = path.join(this.opts.dir, `${this.opts.name}.broken-${this.opts.now()}.json`);
      try {
        renameWithRetry(this.file, broken);
      } catch {
        /* даже если не смогли переименовать — не падаем */
      }
      const restored = this.restoreFromBackup();
      if (restored !== undefined) {
        this.opts.log?.(
          `storage: ${this.opts.name}.json повреждён (${(e as Error).message}) → восстановлен из бэкапа`,
        );
        this.lastLoad = 'restored';
        this.data = restored;
        this.dirty = true;
        this.flush();
        return restored;
      }
      this.opts.log?.(
        `storage: ${this.opts.name}.json повреждён (${(e as Error).message}) → ${path.basename(broken)}`,
      );
      this.lastLoad = 'broken';
      return this.opts.defaults();
    }
  }
}

export interface StoreRestore<T> {
  restoreFromBackup(): T | undefined;
}

/** Месяц по локальному времени: events/YYYY-MM.jsonl */
export function eventFileName(at: number): string {
  const d = new Date(at);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mm}.jsonl`;
}

export class EventLog {
  private readonly dir: string;

  constructor(baseDir: string) {
    this.dir = path.join(baseDir, 'events');
  }

  append(event: AppEvent): void {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.appendFileSync(
      path.join(this.dir, eventFileName(event.at)),
      `${JSON.stringify(event)}\n`,
      'utf8',
    );
  }

  /** Все события месяца; битые строки пропускаются (обрыв при краше). */
  readMonth(at: number): AppEvent[] {
    const file = path.join(this.dir, eventFileName(at));
    let raw: string;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch {
      return [];
    }
    const out: AppEvent[] = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as AppEvent);
      } catch {
        /* пропускаем битую строку */
      }
    }
    return out;
  }
}

/**
 * Ежедневный бэкап (SPEC 6): копии файлов в backups/<day>/, храним последние `keep` дней.
 * Уже есть бэкап за этот день — ничего не делаем. Ошибки не роняют приложение.
 */
export function dailyBackup(
  baseDir: string,
  names: string[],
  day: string,
  keep = 7,
  log?: (msg: string) => void,
): boolean {
  const root = path.join(baseDir, 'backups');
  const target = path.join(root, day);
  try {
    if (fs.existsSync(target)) return false;
    fs.mkdirSync(target, { recursive: true });
    for (const n of names) {
      const src = path.join(baseDir, `${n}.json`);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(target, `${n}.json`));
    }
    const days = fs
      .readdirSync(root)
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
    for (const old of days.slice(0, Math.max(0, days.length - keep))) {
      fs.rmSync(path.join(root, old), { recursive: true, force: true });
    }
    return true;
  } catch (e) {
    log?.(`backup: ${(e as Error).message}`);
    return false;
  }
}
