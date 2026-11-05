import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventLog, eventFileName, JsonStore, writeFileAtomic } from './storage';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squish-storage-'));
});
afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(dir, { recursive: true, force: true });
});

const make = (extra: Partial<ConstructorParameters<typeof JsonStore<{ n: number }>>[0]> = {}) =>
  new JsonStore<{ n: number }>({
    dir,
    name: 'state',
    version: 1,
    defaults: () => ({ n: 0 }),
    now: () => 1234,
    ...extra,
  });

describe('JsonStore', () => {
  it('нет файла → дефолты, missing', () => {
    const s = make();
    expect(s.get()).toEqual({ n: 0 });
    expect(s.lastLoad).toBe('missing');
  });

  it('запись сразу и чтение после «перезапуска»', () => {
    make().set({ n: 5 }, 0);
    const s2 = make();
    expect(s2.get()).toEqual({ n: 5 });
    expect(s2.lastLoad).toBe('ok');
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
    expect(raw).toEqual({ schemaVersion: 1, data: { n: 5 } });
  });

  it('отложенная запись: до таймера файла нет, после — есть; несколько set → одна запись', () => {
    vi.useFakeTimers();
    const s = make();
    s.set({ n: 1 }, 10_000);
    s.set({ n: 2 }, 10_000);
    expect(fs.existsSync(path.join(dir, 'state.json'))).toBe(false);
    vi.advanceTimersByTime(10_000);
    expect(make().get()).toEqual({ n: 2 });
  });

  it('flush пишет немедленно (выход из приложения)', () => {
    vi.useFakeTimers();
    const s = make();
    s.set({ n: 9 }, 10_000);
    s.flush();
    expect(make().get()).toEqual({ n: 9 });
  });

  it('flush без изменений ничего не пишет', () => {
    make().flush();
    expect(fs.existsSync(path.join(dir, 'state.json'))).toBe(false);
  });

  it('битый JSON → broken-файл, дефолты, без исключения', () => {
    fs.writeFileSync(path.join(dir, 'state.json'), '{ "schemaVersion": 1, "data": {');
    const log = vi.fn();
    const s = make({ log });
    expect(s.get()).toEqual({ n: 0 });
    expect(s.lastLoad).toBe('broken');
    expect(fs.existsSync(path.join(dir, 'state.broken-1234.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'state.json'))).toBe(false);
    expect(log).toHaveBeenCalledOnce();
  });

  it('валидный JSON без конверта → broken', () => {
    fs.writeFileSync(path.join(dir, 'state.json'), '{"n": 3}');
    expect(make().lastLoad).toBe('broken');
  });

  it('файл из будущей версии не затираем молча → broken + дефолты', () => {
    fs.writeFileSync(
      path.join(dir, 'state.json'),
      JSON.stringify({ schemaVersion: 7, data: { n: 1 } }),
    );
    const s = make();
    expect(s.lastLoad).toBe('broken');
    expect(fs.existsSync(path.join(dir, 'state.broken-1234.json'))).toBe(true);
  });

  it('миграция v1 → v2 применяется и сохраняется', () => {
    fs.writeFileSync(
      path.join(dir, 'state.json'),
      JSON.stringify({ schemaVersion: 1, data: { count: 4 } }),
    );
    const s = make({
      version: 2,
      migrations: { 1: (d) => ({ n: (d as { count: number }).count }) },
    });
    expect(s.get()).toEqual({ n: 4 });
    expect(s.lastLoad).toBe('migrated');
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
    expect(raw.schemaVersion).toBe(2);
  });

  it('нет нужной миграции → broken, а не краш', () => {
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ schemaVersion: 1, data: {} }));
    expect(make({ version: 3 }).lastLoad).toBe('broken');
  });

  it('осиротевший .tmp (краш посреди записи) удаляется, старые данные целы', () => {
    make().set({ n: 1 }, 0);
    fs.writeFileSync(path.join(dir, 'state.json.tmp'), 'мусор');
    const s = make();
    expect(s.get()).toEqual({ n: 1 });
    expect(fs.existsSync(path.join(dir, 'state.json.tmp'))).toBe(false);
  });
});

describe('writeFileAtomic', () => {
  it('создаёт папки и не оставляет tmp', () => {
    const f = path.join(dir, 'a', 'b', 'x.json');
    writeFileAtomic(f, '{}');
    expect(fs.readFileSync(f, 'utf8')).toBe('{}');
    expect(fs.existsSync(`${f}.tmp`)).toBe(false);
  });
  it('перезаписывает существующий файл', () => {
    const f = path.join(dir, 'x.json');
    writeFileAtomic(f, '1');
    writeFileAtomic(f, '2');
    expect(fs.readFileSync(f, 'utf8')).toBe('2');
  });
});

describe('EventLog', () => {
  const at = new Date(2026, 10, 5, 12, 0).getTime(); // 5 ноября 2026

  it('имя файла по месяцу', () => {
    expect(eventFileName(at)).toBe('2026-11.jsonl');
    expect(eventFileName(new Date(2027, 0, 1).getTime())).toBe('2027-01.jsonl');
  });

  it('append дописывает строки, readMonth читает', () => {
    const log = new EventLog(dir);
    log.append({ type: 'app_start', at, version: '0.1.0' });
    log.append({ type: 'water', at: at + 1, glasses: 1 });
    expect(log.readMonth(at).map((e) => e.type)).toEqual(['app_start', 'water']);
    expect(
      fs.readFileSync(path.join(dir, 'events', '2026-11.jsonl'), 'utf8').split('\n'),
    ).toHaveLength(3);
  });

  it('битая последняя строка (обрыв при краше) пропускается', () => {
    const log = new EventLog(dir);
    log.append({ type: 'app_quit', at });
    fs.appendFileSync(path.join(dir, 'events', '2026-11.jsonl'), '{"type":"wat');
    expect(log.readMonth(at)).toHaveLength(1);
  });

  it('нет файла → пусто', () => {
    expect(new EventLog(dir).readMonth(at)).toEqual([]);
  });
});
