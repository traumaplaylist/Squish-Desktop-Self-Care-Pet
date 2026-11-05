import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Сторож архитектуры CLAUDE.md: core — без Electron/Node API, Date.now() и таймеров. */
const dir = __dirname;
const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

describe('core остаётся чистым', () => {
  it.each(files)('%s', (f) => {
    const src = readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(src).not.toMatch(/Date\.now\s*\(/);
    expect(src).not.toMatch(/new Date\(\s*\)/);
    expect(src).not.toMatch(/\b(setTimeout|setInterval)\s*\(/);
    expect(src).not.toMatch(/from\s+['"](electron|node:[\w/]+|fs|path|os|child_process|koffi)['"]/);
  });
});
