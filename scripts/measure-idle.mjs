// Замер CPU в покое (Linux, /proc): суммарно по всем процессам приложения.
// node scripts/measure-idle.mjs [путь-к-исполняемому]  (по умолчанию dist/linux-unpacked/squish)
// На Windows пользуйся Process Explorer — методика в PROGRESS.md.
import { _electron as electron } from 'playwright';
import { readFileSync, mkdtempSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exe = process.argv[2] ?? 'dist/linux-unpacked/squish';
const app = await electron.launch({
  executablePath: exe,
  args: ['--no-sandbox'],
  env: { ...process.env, SQUISH_USER_DATA: mkdtempSync(join(tmpdir(), 'squish-idle-')) },
});
const pid = app.process().pid;
const tree = () => [
  pid,
  ...execSync(`pgrep -P ${pid} || true`).toString().split('\n').filter(Boolean).map(Number),
];
const allPids = () => {
  const seen = new Set();
  const stack = tree();
  while (stack.length) {
    const p = stack.pop();
    if (seen.has(p)) continue;
    seen.add(p);
    for (const c of execSync(`pgrep -P ${p} || true`).toString().split('\n').filter(Boolean))
      stack.push(Number(c));
  }
  return [...seen];
};
const ticks = () =>
  allPids().reduce((s, p) => {
    try {
      const f = readFileSync(`/proc/${p}/stat`, 'utf8').split(') ')[1].split(' ');
      return s + Number(f[11]) + Number(f[12]);
    } catch {
      return s;
    }
  }, 0);
const rssMb = () =>
  allPids().reduce((s, p) => {
    try {
      const m = /VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${p}/status`, 'utf8'));
      return s + (m ? Number(m[1]) / 1024 : 0);
    } catch {
      return s;
    }
  }, 0);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const measure = async (label, sec = 15) => {
  const a = ticks();
  await wait(sec * 1000);
  console.log(
    `${label}: CPU ${((ticks() - a) / sec).toFixed(1)}% ядра, RSS ${rssMb().toFixed(0)} МБ`,
  );
};

await wait(5000);
await measure('виджет виден');
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.hide()));
await measure('виджет скрыт');
await app.close();
