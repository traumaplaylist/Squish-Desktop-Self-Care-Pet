// Замер CPU и памяти в покое через app.getAppMetrics() — работает и на Windows (CI), и на Linux.
// node scripts/measure-idle.mjs                          — dev-сборка из out/
// SQUISH_EXE=dist/win-unpacked/Squish.exe node scripts/measure-idle.mjs — собранное приложение
// Результат: smoke-artifacts/idle-metrics.json. Бюджеты (SPEC 7.5, R0): CPU < 1–2 %, RAM < 300 МБ.
import { _electron as electron } from 'playwright';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.platform === 'linux' ? ['--no-sandbox'] : [];
const launch = process.env.SQUISH_EXE
  ? { executablePath: process.env.SQUISH_EXE, args }
  : { args: [...args, '.'] };
const app = await electron.launch({
  ...launch,
  env: {
    ...process.env,
    SQUISH_SKIP_ONBOARDING: '1',
    SQUISH_USER_DATA: mkdtempSync(join(tmpdir(), 'squish-idle-')),
  },
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const metrics = () => app.evaluate(() => globalThis.__squishMetrics());

/** CPU за окно (сумма по процессам, % одного ядра) и память (МБ). */
async function sample(sec) {
  await metrics(); // сбросить счётчик «с прошлого вызова»
  await wait(sec * 1000);
  const m = await metrics();
  const cpu = m.reduce((s, p) => s + (p.cpu?.percentCPUUsage ?? 0), 0);
  // privateBytes есть только на Windows (честнее для «сколько занимает»), иначе workingSetSize. Оба в КБ.
  const priv = m.reduce((s, p) => s + (p.memory?.privateBytes ?? 0), 0);
  const ws = m.reduce((s, p) => s + (p.memory?.workingSetSize ?? 0), 0);
  return {
    cpuPercent: Math.round(cpu * 100) / 100,
    privateMB: priv ? Math.round(priv / 1024) : null,
    workingSetMB: Math.round(ws / 1024),
    processes: m.map((p) => p.type),
  };
}

await wait(8000); // старт, первый опрос детекторов, отрисовка
const visible = await sample(20);
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.hide()));
const hidden = await sample(15);
await app.close();

const result = { platform: `${process.platform}-${process.arch}`, visible, hidden };
mkdirSync('smoke-artifacts', { recursive: true });
writeFileSync(join('smoke-artifacts', 'idle-metrics.json'), JSON.stringify(result, null, 2));
console.log(
  `покой, виджет виден: CPU ${visible.cpuPercent}% · private ${visible.privateMB ?? '—'} МБ · working set ${visible.workingSetMB} МБ`,
);
console.log(
  `покой, виджет скрыт: CPU ${hidden.cpuPercent}% · private ${hidden.privateMB ?? '—'} МБ · working set ${hidden.workingSetMB} МБ`,
);
console.log(`процессы: ${visible.processes.join(', ')}`);
