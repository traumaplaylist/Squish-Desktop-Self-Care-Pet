// E2E задач (День 4): быстрый ввод < 150 мс, галочка < 50 мс, монетки, «Разбить», бонус, удаление с отменой.
// node scripts/e2e-tasks.mjs   (после npm run build; на Linux — под xvfb-run)
import { _electron as electron } from 'playwright';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = 'smoke-artifacts';
mkdirSync(out, { recursive: true });
const args = process.platform === 'linux' ? ['--no-sandbox', '.'] : ['.'];
const app = await electron.launch({
  args,
  env: {
    ...process.env,
    SQUISH_DEBUG: '1',
    SQUISH_SKIP_ONBOARDING: '1',
    SQUISH_USER_DATA: mkdtempSync(join(tmpdir(), 'squish-e2e-tasks-')),
  },
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
const metrics = {};

try {
  const widget = await find(async (w) => (await w.locator('.pet-host').count()) > 0, 'widget');
  const dbg = await find(
    async (w) => (await w.locator('h1').count()) > 0 && w.url().includes('debug'),
    'debug',
  );
  await dbg.getByRole('button', { name: '×1', exact: true }).click();
  await dbg.getByRole('button', { name: 'печатаю' }).click();
  const tasks = await find(async (w) => w.url().includes('/tasks/'), 'tasks window');
  await wait(800);

  // Быстрый ввод: замер «вызов → окно видно и поле в фокусе» (3 раза, берём худший)
  const lat = [];
  for (let i = 0; i < 3; i++) {
    await app.evaluate(() => globalThis.__squishShowTasks('quick'));
    await wait(400);
    lat.push(await app.evaluate(() => globalThis.__squishTasksLatency()));
    await tasks.keyboard.press('Escape');
    await wait(200);
  }
  metrics.quickInputMs = lat;
  check(
    lat.every((x) => typeof x === 'number' && x < 150),
    `быстрый ввод появляется < 150 мс: ${lat.join(', ')} мс`,
  );

  await app.evaluate(() => globalThis.__squishShowTasks('quick'));
  await wait(300);
  check(
    await tasks.locator('.quick-input').evaluate((el) => el === document.activeElement),
    'поле ввода сразу в фокусе',
  );
  check((await tasks.locator('.chip').count()) >= 3, 'подсказки self-care видны');
  await tasks.screenshot({ path: join(out, 'e2e-quick.png') });
  for (const text of ['купить хлеба', 'зарядка каждый день', 'переезд!']) {
    await tasks.locator('.quick-input').fill(text);
    await tasks.keyboard.press('Enter');
    await wait(150);
  }
  await tasks.locator('.link', { hasText: 'Все задачи' }).click();
  await wait(300);
  const titles = await tasks.locator('.item .title').allTextContents();
  check(
    JSON.stringify(titles) === JSON.stringify(['купить хлеба', 'зарядка', 'переезд']),
    `три задачи в панели: ${titles.join(' | ')}`,
  );
  check(
    (await tasks.locator('.size-L').count()) === 1 &&
      (await tasks.locator('.icon', { hasText: '↻' }).count()) === 1,
    '«!» → большая, «каждый день» → ↻',
  );

  // Галочка: время от клика до заливки (оптимистично, < 50 мс)
  const first = tasks.locator('.item').first().locator('.check');
  const checkMs = await first.evaluate(
    (el) =>
      new Promise((resolve) => {
        const t0 = performance.now();
        const obs = new MutationObserver(() => {
          if (el.classList.contains('on')) {
            obs.disconnect();
            resolve(performance.now() - t0);
          }
        });
        obs.observe(el, { attributes: true, attributeFilter: ['class'] });
        el.click();
      }),
  );
  metrics.checkMs = Math.round(checkMs);
  check(checkMs < 50, `галочка откликается < 50 мс: ${Math.round(checkMs)} мс`);
  check((await tasks.locator('.burst .coin').count()) > 0, 'монетки разлетаются из галочки');
  await wait(150);
  check((await widget.locator('.flight .coin').count()) > 0, 'монетки влетают в питомца в виджете');
  await tasks.screenshot({ path: join(out, 'e2e-check.png') });
  await widget.screenshot({ path: join(out, 'e2e-coins.png') });
  await wait(600);
  check(
    ((await widget.locator('.counter').textContent()) ?? '').includes('1/3'),
    'под питомцем «задачи: 1/3»',
  );

  // «Разбить» → 3 подзадачи → заполнить → отметить все → родитель с бонусом
  const move = tasks.locator('.item', { hasText: 'переезд' });
  await move.hover();
  await move.getByRole('button', { name: 'Разбить' }).click();
  await wait(300);
  const subs = move.locator('.sub-input');
  check((await subs.count()) === 3, '«Разбить» → 3 пустые подзадачи');
  check(
    await subs.first().evaluate((el) => el === document.activeElement),
    'фокус на первой подзадаче',
  );
  for (const [i, s] of ['коробки', 'упаковать', 'вызвать машину'].entries()) {
    await subs.nth(i).fill(s);
    await subs.nth(i).press('Enter');
  }
  await wait(300);
  for (let i = 0; i < 3; i++) {
    await move.locator('.row.sub .check').nth(i).click();
    await wait(250);
  }
  await wait(400);
  const snap = await tasks.evaluate(() => window.squish.invoke('app:getSnapshot'));
  metrics.economy = snap.economy;
  // создание 3×1 + хлеб S 1 + подзадачи 3×1 + бонус 2 = 9 монет; энергия 1 + 3 + 1 = 5
  check(snap.economy.coins === 9, `монеты: ${snap.economy.coins} (ожидалось 9)`);
  check(snap.economy.energyToday === 5, `энергия: ${snap.economy.energyToday} (ожидалось 5)`);
  check(
    snap.tasksToday.done === 2,
    `«переезд» отмечен после последней подзадачи: ${JSON.stringify(snap.tasksToday)}`,
  );

  // Удаление с отменой
  const gym = tasks.locator('.item', { hasText: 'зарядка' });
  await gym.hover();
  await gym.getByRole('button', { name: 'Удалить' }).click();
  await wait(200);
  check((await tasks.locator('.toast').count()) === 1, 'тост «Задача удалена» с «Отменить»');
  await tasks.locator('.toast button').click();
  await wait(300);
  check(
    (await tasks.locator('.item', { hasText: 'зарядка' }).count()) === 1,
    'отмена удаления вернула задачу',
  );
  await tasks.locator('.done-toggle').click();
  await wait(200);
  await tasks.screenshot({ path: join(out, 'e2e-panel.png') });
} catch (e) {
  check(false, e instanceof Error ? e.message : String(e));
} finally {
  writeFileSync(join(out, 'tasks-metrics.json'), JSON.stringify(metrics, null, 2));
  await app.close().catch(() => {});
}
process.exitCode = failed ? 1 : 0;
