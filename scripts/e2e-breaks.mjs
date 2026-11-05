// E2E-сценарий перерывов в debug-режиме (Xvfb/локально): цикл preBreak → ожидание паузы → оверлей → радость.
// node scripts/e2e-breaks.mjs   (после npm run build; на Linux — под xvfb-run)
import { _electron as electron } from 'playwright';
import { mkdirSync, mkdtempSync } from 'node:fs';
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
    SQUISH_USER_DATA: mkdtempSync(join(tmpdir(), 'squish-e2e-')),
  },
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const find = async (pred, label, timeout = 60_000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    for (const w of app.windows()) if (await pred(w).catch(() => false)) return w;
    await wait(200);
  }
  throw new Error(`нет окна: ${label}`);
};
const until = async (fn, label, timeout = 60_000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await fn().catch(() => false)) return;
    await wait(200);
  }
  throw new Error(`не дождались: ${label}`);
};
const phase = () => app.evaluate(() => globalThis.__squishPhase?.() ?? null);
let failed = false;
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed = true;
};

try {
  const widget = await find(async (w) => (await w.locator('.pet-host').count()) > 0, 'widget');
  const dbg = await find(async (w) => (await w.locator('h1').count()) > 0, 'debug');
  await dbg.getByRole('button', { name: 'печатаю' }).click();
  await dbg.getByRole('button', { name: '×60', exact: true }).click();

  // 20 виртуальных минут ≈ 20 с реальных
  await until(async () => (await phase()) === 'preBreak', 'preBreak', 40_000);
  await dbg.getByRole('button', { name: '×1', exact: true }).click();
  check(true, 'после ~20 мин работы — preBreak');
  await widget.waitForTimeout(400);
  check((await widget.locator('.bubble button').count()) >= 2, 'в виджете облачко с кнопками');
  check((await widget.locator('.pet.state-waving').count()) === 1, 'питомец машет');
  await widget.screenshot({ path: join(out, 'e2e-prebreak.png') });

  // Печатает до конца отсчёта → ждём паузу ввода
  await until(async () => (await phase()) === 'waitingForPause', 'waitingForPause', 40_000);
  check(true, 'печатает после отсчёта → waitingForPause');
  await dbg.getByRole('button', { name: 'отошёл' }).click(); // пауза ввода
  await until(async () => (await phase()) === 'onBreak', 'onBreak', 5_000);
  check(true, 'пауза ввода → перерыв начался');
  const overlay = await find(
    async (w) => (await w.locator('.overlay').count()) > 0,
    'overlay',
    10_000,
  );
  await overlay.waitForTimeout(900);
  check(
    (await overlay.locator('.title').textContent())?.includes('вдаль') ?? false,
    'на оверлее микро-упражнение',
  );
  await overlay.screenshot({ path: join(out, 'e2e-overlay-micro.png') });
  await until(
    async () => (await overlay.locator('.overlay.done').count()) === 1,
    'радость после перерыва',
    30_000,
  );
  check(true, 'досидел 20 с → «Готово!»');
  await overlay.screenshot({ path: join(out, 'e2e-overlay-done.png') });
  await until(async () => (await phase()) === 'working', 'снова working', 5_000);

  // Длинный перерыв по кнопке, обычная строгость: «Пропустить» появляется через 5 с
  await dbg.getByRole('button', { name: 'печатаю' }).click();
  await dbg.getByRole('button', { name: 'Длинный сейчас' }).click();
  const ov2 = await find(
    async (w) => (await w.locator('.overlay .steps').count()) > 0,
    'overlay long',
    10_000,
  );
  await ov2.waitForTimeout(1200);
  check(
    (await ov2.getByRole('button', { name: 'Пропустить' }).count()) === 0,
    '«Пропустить» скрыта первые 5 с',
  );
  await ov2.screenshot({ path: join(out, 'e2e-overlay-long.png') });
  await ov2.waitForTimeout(5000);
  check(
    (await ov2.getByRole('button', { name: 'Пропустить' }).count()) === 1,
    '«Пропустить» появилась через 5 с',
  );
  await ov2.getByRole('button', { name: 'Пропустить' }).click();
  await until(async () => (await phase()) === 'working', 'после пропуска working', 5_000);
  check(true, 'пропуск → working');

  // Созвон во время preBreak: перерыв становится должным
  await dbg.getByRole('button', { name: '×60', exact: true }).click();
  await until(async () => (await phase()) === 'preBreak', 'второй preBreak', 40_000);
  await dbg.locator('.row', { hasText: 'mic' }).getByRole('button', { name: '1 мин' }).click();
  await until(async () => (await phase()) === 'suppressed', 'suppressed', 5_000);
  check(
    (await widget.locator('.pet.state-quiet, .pet[data-state="quiet"]').count()) === 1,
    'на созвоне питомец тихий',
  );
  await until(async () => (await phase()) === 'preBreak', 'должный перерыв после кулдауна', 20_000);
  check(true, 'после созвона и кулдауна — снова preBreak');

  // День 3: вода — 💧 при наведении → облачко с «Отменить» → отмена
  await dbg.getByRole('button', { name: 'Снять' }).click();
  await dbg.getByRole('button', { name: '×1', exact: true }).click();
  await widget.locator('.bubble').getByRole('button', { name: 'Пропустить' }).click();
  await until(async () => (await phase()) === 'working', 'пропуск preBreak', 5_000);
  await widget.mouse.move(120, 225);
  await widget.waitForTimeout(300);
  await widget.locator('.hover-buttons.visible button').first().click();
  await widget.waitForTimeout(300);
  check(
    (await widget.locator('.bubble').textContent())?.includes('1 из 8') ?? false,
    'вода: «Глоток! 1 из 8»',
  );
  check((await widget.locator('.glass').count()) === 1, 'вода: питомец пьёт из стакана');
  await widget.screenshot({ path: join(out, 'e2e-water.png') });
  await widget.getByRole('button', { name: 'Отменить' }).click();
  await widget.waitForTimeout(300);
  check(
    (await widget.locator('.bubble').textContent())?.includes('не считаем') ?? false,
    'вода: отмена',
  );
} catch (e) {
  check(false, e instanceof Error ? e.message : String(e));
} finally {
  await app.close().catch(() => {});
}
process.exitCode = failed ? 1 : 0;
