// E2E зверя из деталей (хомяк): все состояния, наряд, реакции, оверлей; снимки для проверки глазами.
// node scripts/e2e-species.mjs   (после npm run build; на Linux — под xvfb-run)
import { _electron as electron } from 'playwright';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = join('smoke-artifacts', 'species');
mkdirSync(out, { recursive: true });
const args = process.platform === 'linux' ? ['--no-sandbox', '.'] : ['.'];
const app = await electron.launch({
  args,
  env: {
    ...process.env,
    SQUISH_DEBUG: '1',
    SQUISH_SKIP_ONBOARDING: '1',
    SQUISH_USER_DATA: mkdtempSync(join(tmpdir(), 'squish-e2e-sp-')),
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
  await widget
    .locator('.bubble')
    .getByRole('button', { name: '🙂' })
    .click()
    .catch(() => {});
  await dbg.getByRole('button', { name: 'Хомяк-булочка' }).click();
  await widget.locator('.pet.species-hamster.species-hamster').waitFor({ timeout: 5000 });
  check(true, 'Debug → «Хомяк-булочка»: виджет перерисован хомяком');
  check((await widget.locator('.pet.species-hamster .arm').count()) === 2, 'лапки на месте');
  await wait(1200);
  await widget.screenshot({ path: join(out, '01-idle.png') });

  const states = ['happy', 'sleeping', 'waving', 'quiet', 'thirsty', 'tired', 'onBreak:stretchUp'];
  for (const st of states) {
    await dbg.getByRole('button', { name: st, exact: true }).click();
    await wait(900);
    check(
      (await widget.locator(`.pet.species-hamster[data-state="${st}"]`).count()) === 1,
      `состояние ${st}`,
    );
    await widget.screenshot({ path: join(out, `02-${st.replace(':', '-')}.png`) });
    await dbg.getByRole('button', { name: st, exact: true }).click(); // снять переопределение
  }
  await wait(600);
  // Моргание: в позе «радость» глаза и так дугами — проверяем в обычной позе (idle)
  await dbg.getByRole('button', { name: 'idle', exact: true }).click();
  // Моргание: в течение ~8 с хотя бы раз будет .blink
  let blinked = false;
  for (let i = 0; i < 80 && !blinked; i++) {
    blinked = (await widget.locator('.pet.species-hamster.blink').count()) > 0;
    await wait(100);
  }
  check(blinked, 'моргает сам (раз в 3–7 с)');
  await dbg.getByRole('button', { name: 'idle', exact: true }).click();

  for (const r of ['bounce', 'drink', 'hug', 'celebrate']) {
    await dbg.getByRole('button', { name: r, exact: true }).click();
    await wait(r === 'drink' ? 500 : 300);
    check(
      (await widget.locator(`.pet.species-hamster .hop[data-reaction="${r}"]`).count()) === 1,
      `реакция ${r}`,
    );
    await widget.screenshot({ path: join(out, `03-${r}.png`) });
    await wait(1200);
  }

  await dbg.getByRole('button', { name: 'Волшебник' }).click();
  await wait(800);
  check(
    (await widget.locator('.pet.outfit-wizard .wizard-cone').count()) === 1 &&
      (await widget.locator('.pet.outfit-wizard .wizard-brim').count()) === 1,
    'наряд «Волшебник»: колпак (конус + поля)',
  );
  check(
    (await widget.locator('.pet.outfit-wizard .arm-r .wizard-wand').count()) === 1,
    'палочка в лапке',
  );
  await widget.screenshot({ path: join(out, '04-wizard.png') });
  await dbg.getByRole('button', { name: 'стадия +1' }).click();
  await dbg.getByRole('button', { name: 'стадия +1' }).click();
  await wait(800);
  await widget.screenshot({ path: join(out, '05-wizard-adult.png') });

  // Оверлей перерыва с хомяком
  await dbg.getByRole('button', { name: 'Длинный сейчас' }).click();
  const ov = await find(
    async (w) => (await w.locator('.overlay .steps').count()) > 0,
    'overlay',
    10_000,
  );
  await ov.locator('.big-pet .pet.species-hamster').waitFor({ timeout: 5000 });
  check(true, 'на оверлее — тоже хомяк');
  await wait(1500);
  await ov.screenshot({ path: join(out, '06-overlay.png') });

  // Назад к блобу
  await dbg.getByRole('button', { name: 'Сквиш', exact: true }).click();
  await wait(800);
  check(
    (await widget.locator('.pet:not(.species-hamster)').count()) === 1,
    'обратно на Сквиша — без перезапуска',
  );
} catch (e) {
  check(false, e instanceof Error ? e.message : String(e));
} finally {
  await app.close().catch(() => {});
}
process.exitCode = failed ? 1 : 0;
