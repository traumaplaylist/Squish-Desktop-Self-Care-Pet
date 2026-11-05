// E2E Дня 6: онбординг с нуля → виджет; настройки применяются без перезапуска (язык на лету); «Дом питомца».
// node scripts/e2e-onboarding.mjs   (после npm run build; на Linux — под xvfb-run)
import { _electron as electron } from 'playwright';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = 'smoke-artifacts';
mkdirSync(out, { recursive: true });
const userData = mkdtempSync(join(tmpdir(), 'squish-e2e-onb-'));
const args = process.platform === 'linux' ? ['--no-sandbox', '.'] : ['.'];
const app = await electron.launch({
  args,
  env: { ...process.env, SQUISH_DEBUG: '1', SQUISH_USER_DATA: userData },
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
const visible = (title) =>
  app.evaluate(
    ({ BrowserWindow }, t) =>
      BrowserWindow.getAllWindows().some((w) => w.getTitle().startsWith(t) && w.isVisible()),
    title,
  );
let failed = false;
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed = true;
};

try {
  const onb = await find(async (w) => w.url().includes('/renderer/onboarding/'), 'onboarding');
  await onb.locator('.egg').waitFor();
  await wait(500);
  check(!(await visible('Squish — питомец')), 'первый запуск: виджета нет, сначала знакомство');
  await onb.screenshot({ path: join(out, 'e2e-onb-egg.png') });
  await onb.locator('.egg').click({ force: true }); // яйцо покачивается — не «стабильно» для Playwright
  await wait(600);
  check((await onb.locator('.pet-host .pet').count()) === 1, 'яйцо → вылупился питомец');
  await onb.locator('.name-field input').fill('Пушок');
  await onb.getByRole('button', { name: 'персиковый' }).click();
  await wait(200);
  await onb.screenshot({ path: join(out, 'e2e-onb-name.png') });
  await onb.getByRole('button', { name: 'Дальше' }).click();
  await onb.locator('.choice', { hasText: '10' }).click();
  await onb.getByRole('button', { name: 'Дальше' }).click();
  await onb.locator('.choice', { hasText: 'Мягко' }).click();
  await onb.getByRole('button', { name: 'Дальше' }).click();
  await onb.locator('.chip', { hasText: 'выйти на улицу' }).click();
  await onb.locator('.task-input').nth(1).fill('позвонить маме');
  await onb.screenshot({ path: join(out, 'e2e-onb-tasks.png') });
  await onb.getByRole('button', { name: 'Готово' }).click();
  await wait(1200);
  check(await visible('Squish — питомец'), 'после «Готово» — питомец в углу');
  const widget = await find(async (w) => (await w.locator('.pet-host').count()) > 0, 'widget');
  let snap = await widget.evaluate(() => window.squish.invoke('app:getSnapshot'));
  check(
    snap.pet.name === 'Пушок' && snap.pet.palette === 'peach',
    `имя и цвет: ${snap.pet.name}, ${snap.pet.palette}`,
  );
  check(
    snap.water.goal === 10 && snap.scheduler.strictness === 'soft',
    'вода 10 стаканов, строгость мягкая',
  );
  check(snap.tasksToday.total === 2, `2 дела из онбординга (сейчас ${snap.tasksToday.total})`);
  const state = JSON.parse(readFileSync(join(userData, 'state.json'), 'utf8'));
  check(state.data.onboardingDone === true, 'онбординг отмечен пройденным');

  // Настройки: применяются сразу, язык — на лету
  await app.evaluate(() => globalThis.__squishOpen?.('settings'));
  const st = await find(async (w) => w.url().includes('/renderer/settings/'), 'settings');
  await st.locator('h1').waitFor();
  await st.screenshot({ path: join(out, 'e2e-settings.png'), fullPage: true });
  await st.getByRole('button', { name: 'Строго', exact: true }).click();
  await wait(400);
  snap = await widget.evaluate(() => window.squish.invoke('app:getSnapshot'));
  check(snap.scheduler.strictness === 'strict', 'строгость сменилась без перезапуска');
  await st.getByRole('button', { name: 'English' }).click();
  await wait(800);
  check(
    (await st.locator('h1').textContent()) === 'Settings',
    'язык переключился на лету (окно настроек)',
  );
  check(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((w) => w.getTitle() === 'Settings'),
    ),
    'заголовок окна тоже на английском',
  );
  await st.getByRole('button', { name: 'Русский' }).click();
  await wait(500);
  // мусорное число в поле — main поправит
  const goal = st.getByRole('spinbutton', { name: 'Цель, стаканов' });
  await goal.fill('999');
  await goal.press('Enter');
  await wait(400);
  snap = await widget.evaluate(() => window.squish.invoke('app:getSnapshot'));
  check(snap.water.goal === 20, `цель воды ограничена 20 (сейчас ${snap.water.goal})`);

  // «Дом питомца»
  await app.evaluate(() => globalThis.__squishOpen?.('home'));
  const home = await find(async (w) => w.url().includes('/renderer/home/'), 'home');
  await home.locator('.score-value').waitFor();
  check((await home.locator('.card .field').count()) >= 7, '«Сегодня»: 7 показателей и оценка дня');
  await home.screenshot({ path: join(out, 'e2e-home-today.png') });
  await home.getByRole('tab', { name: 'Неделя' }).click();
  await wait(300);
  check(
    (await home.locator('.chart').count()) === 3,
    '«Неделя»: три графика (перерывы, задачи, вода)',
  );
  check((await home.locator('.chart').first().locator('.axis').count()) === 7, '7 дней на оси');
  await home.screenshot({ path: join(out, 'e2e-home-week.png') });
  await home.getByRole('tab', { name: 'Питомец' }).click();
  await wait(500);
  check(
    ((await home.locator('.pet-name').textContent()) ?? '') === 'Пушок',
    'вкладка «Питомец»: имя',
  );
  await home.screenshot({ path: join(out, 'e2e-home-pet.png') });
} catch (e) {
  check(false, e instanceof Error ? e.message : String(e));
} finally {
  await app.close().catch(() => {});
}
process.exitCode = failed ? 1 : 0;
