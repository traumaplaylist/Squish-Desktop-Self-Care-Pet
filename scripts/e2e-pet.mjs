// E2E питомца (День 5): чек-ин → 😞 → «Тяжёлый день» → аптечка; жажда; рост; поглаживание.
// node scripts/e2e-pet.mjs   (после npm run build; на Linux — под xvfb-run)
import { _electron as electron } from 'playwright';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = 'smoke-artifacts';
mkdirSync(out, { recursive: true });
const args = process.platform === 'linux' ? ['--no-sandbox', '.'] : ['.'];
const app = await electron.launch({
  args,
  env: { ...process.env, SQUISH_DEBUG: '1', SQUISH_USER_DATA: mkdtempSync(join(tmpdir(), 'squish-e2e-pet-')) },
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const find = async (pred, label, timeout = 30_000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    for (const w of app.windows()) if (await pred(w).catch(() => false)) return w;
    await wait(200);
  }
  throw new Error(`нет окна: ${label}`);
};
let failed = false;
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed = true;
};

try {
  const widget = await find(async (w) => (await w.locator('.pet-host').count()) > 0, 'widget');
  const dbg = await find(async (w) => w.url().includes('debug'), 'debug');
  await dbg.getByRole('button', { name: '×1', exact: true }).click();
  await dbg.getByRole('button', { name: 'печатаю' }).click();

  // Чек-ин: питомец спрашивает первым
  await widget.locator('.bubble', { hasText: 'Как ты сегодня?' }).waitFor({ timeout: 10_000 });
  check(true, 'чек-ин: «Как ты сегодня?» с пятью эмодзи');
  check((await widget.locator('.bubble button').count()) === 5, 'пять кнопок настроения');
  await widget.screenshot({ path: join(out, 'e2e-checkin.png') });
  await widget.locator('.bubble').getByRole('button', { name: '😞' }).click();
  await wait(300);
  check((await widget.locator('.hearts').count()) === 1, '😞 → обнимашки (сердечки)');
  check(((await widget.locator('.bubble').textContent()) ?? '').includes('Тяжёлый день'), 'предложение включить «Тяжёлый день»');
  await widget.locator('.bubble').getByRole('button', { name: 'Включить «Тяжёлый день»' }).click();
  await wait(400);
  check((await widget.locator('.scarf').count()) === 1, '«Тяжёлый день»: питомец в шарфике (cozy)');
  let snap = await widget.evaluate(() => window.squish.invoke('app:getSnapshot'));
  check(snap.economy.goal === 10, `цель дня стала 10 (сейчас ${snap.economy.goal})`);
  check(snap.scheduler.strictness === 'soft', 'строгость перерывов — мягкая');
  await widget.screenshot({ path: join(out, 'e2e-hardday.png') });

  // Аптечка в панели задач
  await app.evaluate(() => globalThis.__squishShowTasks('panel'));
  const tasks = await find(async (w) => w.url().includes('/tasks/'), 'tasks');
  await tasks.locator('.first-aid').waitFor({ timeout: 5000 });
  check((await tasks.locator('.fa').count()) === 6, '«Аптечка»: 6 действий');
  await tasks.locator('.fa').nth(1).click();
  await wait(400);
  snap = await widget.evaluate(() => window.squish.invoke('app:getSnapshot'));
  // чек-ин +2, аптечка +1
  check(snap.economy.energyToday === 3, `энергия после чек-ина и аптечки: ${snap.economy.energyToday} (ожидалось 3)`);
  await tasks.screenshot({ path: join(out, 'e2e-firstaid.png') });
  await tasks.keyboard.press('Escape');

  // Потребности: жажда
  await dbg.getByRole('button', { name: 'потребности → 10' }).click();
  await wait(1500);
  check((await widget.locator('.pet[data-state="thirsty"]').count()) === 1, 'вода < 25 → хочет пить');
  check((await widget.locator('.empty-glass').count()) === 1, 'рядом пустой стакан');
  check((await widget.locator('.need.low').count()) === 3, 'три полоски потребностей «низко»');
  await widget.screenshot({ path: join(out, 'e2e-thirsty.png') });

  // Рост: стадии
  for (const [n, stage, mark] of [
    [1, 'teen', '.sprout'],
    [1, 'adult', '.tuft'],
    [1, 'wise', '.glasses'],
  ]) {
    for (let i = 0; i < n; i++) await dbg.getByRole('button', { name: 'стадия +1' }).click();
    await wait(1300);
    check((await widget.locator(`.pet.stage-${stage} ${mark}`).count()) === 1, `стадия ${stage}`);
    await widget.screenshot({ path: join(out, `e2e-stage-${stage}.png`) });
  }

  // Погладить: водим курсором туда-обратно над питомцем
  await widget.mouse.move(80, 220);
  for (let i = 0; i < 7; i++) {
    await widget.mouse.move(i % 2 ? 80 : 160, 220, { steps: 6 });
    await wait(60);
  }
  await wait(100);
  check((await widget.locator('.hop[data-reaction="purr"]').count()) === 1, 'погладить → жмурится (purr)');
  await widget.screenshot({ path: join(out, 'e2e-purr.png') });
} catch (e) {
  check(false, e instanceof Error ? e.message : String(e));
} finally {
  await app.close().catch(() => {});
}
process.exitCode = failed ? 1 : 0;
