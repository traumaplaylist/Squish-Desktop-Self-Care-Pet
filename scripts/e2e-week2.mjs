// E2E Недели 2: магазин и гардероб, угощение, приключение, яйцо → микро-питомец, вечерний вопрос → дневник,
// Пути в панели задач, островок. Снимки — smoke-artifacts/week2/.
// node scripts/e2e-week2.mjs   (после npm run build; на Linux — под xvfb-run)
import { _electron as electron } from 'playwright';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = join('smoke-artifacts', 'week2');
mkdirSync(out, { recursive: true });
const args = process.platform === 'linux' ? ['--no-sandbox', '.'] : ['.'];
const app = await electron.launch({
  args,
  env: {
    ...process.env,
    SQUISH_DEBUG: '1',
    SQUISH_SKIP_ONBOARDING: '1',
    SQUISH_SPECIES: process.env.SQUISH_SPECIES ?? 'hamster',
    SQUISH_USER_DATA: mkdtempSync(join(tmpdir(), 'squish-e2e-w2-')),
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

try {
  const widget = await find(async (w) => (await w.locator('.pet-host').count()) > 0, 'widget');
  const dbg = await find(async (w) => w.url().includes('debug'), 'debug');
  await dbg.getByRole('button', { name: '×1', exact: true }).click();
  await dbg.getByRole('button', { name: 'печатаю' }).click();
  await wait(2500);
  // чек-ин дня — ответить, чтобы облачко не мешало
  await widget
    .locator('.bubble')
    .getByRole('button', { name: '🙂' })
    .click()
    .catch(() => {});
  await wait(500);

  check((await widget.locator('.island .scene').count()) === 1, 'островок под питомцем');
  await widget.screenshot({ path: join(out, '01-island.png') });

  // ── Магазин ──
  for (let i = 0; i < 12; i++) await dbg.getByRole('button', { name: 'монеты +50' }).click();
  await app.evaluate(() => globalThis.__squishOpen('home'));
  const home = await find(async (w) => w.url().includes('/renderer/home/'), 'home');
  await home.getByRole('tab', { name: 'Магазин' }).click();
  await wait(400);
  check((await home.locator('.shop-item').count()) >= 17, 'магазин: 12 предметов + 5 угощений');
  const buy = async (name) => {
    const item = home.locator('.shop-item', { hasText: name });
    await item.getByRole('button').click();
    await wait(300);
  };
  await buy('Шапочка');
  await buy('Полосатый шарф');
  await buy('Кружка какао');
  await buy('Фон «Луг»');
  await buy('печенька');
  await buy('сыр');
  await wait(600);
  check(
    (await widget.locator('.acc-beanie').count()) === 1 &&
      (await widget.locator('.acc-scarf').count()) === 1 &&
      (await widget.locator('.acc-mug').count()) === 1,
    'купил — сразу надето: шапочка, шарф, кружка',
  );
  check((await widget.locator('.island .bg-meadow').count()) === 1, 'фон виджета «Луг»');
  await widget.screenshot({ path: join(out, '02-wardrobe.png') });
  await home.screenshot({ path: join(out, '03-shop.png') });
  check(
    (await home.locator('.shop-item', { hasText: 'печенька ×' }).count()) === 1,
    'угощения — в кладовке',
  );
  await home.locator('.shop-item', { hasText: 'печенька ×' }).getByRole('button').click();
  await wait(250);
  check(
    (await widget.locator('.hop[data-reaction="eat"]').count()) === 1 &&
      (await widget.locator('.snack').count()) === 1,
    'угостил — ест',
  );
  await widget.screenshot({ path: join(out, '04-eat.png') });
  await wait(1600);
  // снять шапочку
  await home.locator('.shop-item', { hasText: 'Шапочка' }).getByRole('button').click();
  await wait(400);
  check((await widget.locator('.acc-beanie').count()) === 0, 'снял шапочку');

  // ── Приключение ──
  await dbg.getByRole('button', { name: '🎒 в приключение' }).click();
  // записка появится, когда уйдёт облачко «Ням!»
  await widget
    .locator('.bubble.note')
    .waitFor({ timeout: 8000 })
    .catch(() => {});
  check(
    (await widget.locator('.bubble.note').count()) === 1 &&
      (await widget.locator('.pet-host.away').count()) === 1,
    'ушёл в приключение: записка «вернусь к …»',
  );
  check((await widget.locator('.backpack').count()) === 1, 'рюкзак за спиной');
  await widget.screenshot({ path: join(out, '05-adventure.png') });
  await dbg.getByRole('button', { name: '🏠 вернуться' }).click();
  await widget.locator('.bubble.story').waitFor({ timeout: 5000 });
  check(true, 'вернулся с историей');
  await widget.screenshot({ path: join(out, '06-story.png') });
  await widget.locator('.bubble.story').getByRole('button', { name: 'В дневник' }).click();
  await wait(800);
  check(
    (await home.locator('.diary-entry').count()) >= 1 &&
      (await home.getByRole('tab', { name: 'Дневник' }).getAttribute('class')) === 'on',
    'кнопка «В дневник» открыла дневник',
  );

  // ── Яйцо → микро-питомец ──
  await dbg.getByRole('button', { name: '🥚 яйцо' }).click();
  await dbg.getByRole('button', { name: '🥚 яйцо' }).click();
  await dbg.getByRole('button', { name: '🐣 вылупить' }).click();
  await wait(1200);
  check((await widget.locator('.micro-pets .micro').count()) === 2, 'два микро-питомца в виджете');
  await widget.screenshot({ path: join(out, '07-micro.png') });

  // ── Вечерний вопрос ──
  await dbg.getByRole('button', { name: '🌙 вечерний вопрос' }).click();
  await wait(1200);
  await widget.locator('.bubble').getByRole('button', { name: 'Ответить' }).click();
  await wait(800);
  await home.locator('.evening textarea').fill('Сделал перерывы и выпил воды');
  await home.getByRole('button', { name: 'Сохранить в дневник' }).click();
  await wait(600);
  check(
    (await home.locator('.diary-entry', { hasText: 'Сделал перерывы' }).count()) === 1,
    'ответ на вечерний вопрос — в дневнике',
  );
  await home.screenshot({ path: join(out, '08-diary.png') });
  await home.getByRole('tab', { name: 'Питомец' }).click();
  await wait(400);
  await home.screenshot({ path: join(out, '09-pet-tab.png') });

  // ── Пути ──
  await app.evaluate(() => globalThis.__squishShowTasks('panel'));
  const tasks = await find(
    async (w) => w.url().includes('/renderer/tasks/') && (await w.isVisible('.panel')),
    'tasks',
    10_000,
  ).catch(async () => find(async (w) => w.url().includes('/renderer/tasks/'), 'tasks'));
  await wait(500);
  await tasks.locator('.journeys-new summary').click();
  await tasks.getByRole('button', { name: '+ Спина' }).click();
  await wait(600);
  check(
    (await tasks.locator('.journey').count()) === 1,
    'Путь «Спина» начат, есть полоска прогресса',
  );
  check((await tasks.getByText('Размять спину').count()) >= 1, 'задачи Пути появились в «Сегодня»');
  await tasks.screenshot({ path: join(out, '10-journey.png') });

  // ── Фон перерыва ──
  await dbg.getByRole('button', { name: 'Длинный сейчас' }).click();
  const ov = await find(
    async (w) => (await w.locator('.overlay .steps').count()) > 0,
    'overlay',
    10_000,
  );
  check((await ov.locator('.overlay.bg-gradient1').count()) === 1, 'фон оверлея по настройке');
  await wait(1500);
  await ov.screenshot({ path: join(out, '11-overlay.png') });
} catch (e) {
  check(false, e instanceof Error ? e.message : String(e));
} finally {
  await app.close().catch(() => {});
}
process.exitCode = failed ? 1 : 0;
