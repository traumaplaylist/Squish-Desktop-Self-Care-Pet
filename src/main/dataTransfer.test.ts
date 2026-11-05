import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyImport, buildExport, parseExport } from './dataTransfer';

const dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'squish-xfer-'));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

function seed(dir: string, coins: number) {
  fs.writeFileSync(
    path.join(dir, 'state.json'),
    JSON.stringify({ schemaVersion: 5, data: { coins } }),
  );
  fs.writeFileSync(
    path.join(dir, 'tasks.json'),
    JSON.stringify({ schemaVersion: 1, data: { tasks: [] } }),
  );
  fs.mkdirSync(path.join(dir, 'events'));
  fs.writeFileSync(
    path.join(dir, 'events', '2026-11.jsonl'),
    `{"type":"water","at":1,"glasses":${coins}}\n`,
  );
}

describe('экспорт/импорт', () => {
  it('экспорт → импорт на «другом компьютере» переносит всё', () => {
    const a = tmp();
    const b = tmp();
    seed(a, 42);
    seed(b, 1);
    const text = JSON.stringify(buildExport(a, '0.1.0', new Date(0)));
    const p = parseExport(text);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const safe = applyImport(b, p.bundle, 'x');
    expect(JSON.parse(fs.readFileSync(path.join(b, 'state.json'), 'utf8')).data.coins).toBe(42);
    expect(fs.readFileSync(path.join(b, 'events', '2026-11.jsonl'), 'utf8')).toContain(
      '"glasses":42',
    );
    // старое сохранено на всякий случай
    expect(JSON.parse(fs.readFileSync(path.join(safe, 'state.json'), 'utf8')).data.coins).toBe(1);
  });
  it('мусор и чужие файлы отклоняются с причиной, ничего не трогаем', () => {
    expect(parseExport('{oops')).toEqual({ ok: false, reason: 'not-json' });
    expect(parseExport('{"format":"other"}')).toEqual({ ok: false, reason: 'not-squish' });
    expect(
      parseExport(JSON.stringify({ format: 'squish-export', version: 99, stores: {}, events: {} })),
    ).toEqual({
      ok: false,
      reason: 'newer-version',
    });
    expect(
      parseExport(
        JSON.stringify({
          format: 'squish-export',
          version: 1,
          stores: { state: { data: 1 } },
          events: {},
        }),
      ),
    ).toEqual({ ok: false, reason: 'bad-state' });
    expect(
      parseExport(
        JSON.stringify({
          format: 'squish-export',
          version: 1,
          stores: {},
          events: { '../evil': 'x' },
        }),
      ),
    ).toEqual({ ok: false, reason: 'bad-events' });
  });
  it('экспорт пустой папки — валидный пустой файл', () => {
    const b = buildExport(tmp(), '0.1.0', new Date(0));
    expect(parseExport(JSON.stringify(b)).ok).toBe(true);
    expect(b.stores).toEqual({});
  });
});
