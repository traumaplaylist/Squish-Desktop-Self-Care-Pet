import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initFileLog, log, rotate } from './log';

let dir = '';
afterEach(() => dir && fs.rmSync(dir, { recursive: true, force: true }));

describe('файловый лог', () => {
  it('пишет строки с временем', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squish-log-'));
    initFileLog(dir);
    log('привет', { a: 1 }, new Error('бум'));
    const text = fs.readFileSync(path.join(dir, 'squish.log'), 'utf8');
    expect(text).toMatch(/^\d{4}-\d{2}-\d{2}T.* привет \{"a":1\} Error: бум/);
  });
  it('ротация: не больше 5 файлов, свежий — squish.log', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squish-log-'));
    for (let i = 0; i < 8; i++) {
      fs.writeFileSync(path.join(dir, 'squish.log'), `файл ${i} `.padEnd(50, 'x'));
      rotate(dir, 40, 5);
    }
    const files = fs.readdirSync(dir).sort();
    expect(files).toEqual(['squish.1.log', 'squish.2.log', 'squish.3.log', 'squish.4.log']);
    expect(fs.readFileSync(path.join(dir, 'squish.1.log'), 'utf8')).toContain('файл 7');
    expect(fs.readFileSync(path.join(dir, 'squish.4.log'), 'utf8')).toContain('файл 4');
  });
  it('маленький файл не ротируется', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squish-log-'));
    fs.writeFileSync(path.join(dir, 'squish.log'), 'мало');
    rotate(dir, 1000, 5);
    expect(fs.readdirSync(dir)).toEqual(['squish.log']);
  });
});
