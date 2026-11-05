// Смоук-тест: запускает приложение, ждёт виджет, проверяет пробу koffi, делает скриншоты.
// Локально (после `npm run build`):  node scripts/smoke.mjs
// Собранный exe (CI Windows):         SQUISH_EXE=dist/win-unpacked/Squish.exe node scripts/smoke.mjs
import { _electron as electron } from 'playwright';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outDir = 'smoke-artifacts';
mkdirSync(outDir, { recursive: true });
const userData = mkdtempSync(join(tmpdir(), 'squish-smoke-'));

const args = [];
if (process.platform === 'linux') args.push('--no-sandbox'); // в контейнере под root
const launch = process.env.SQUISH_EXE
  ? { executablePath: process.env.SQUISH_EXE, args }
  : { args: [...args, '.'] };

const env = { ...process.env, SQUISH_USER_DATA: userData };
if (process.env.SMOKE_DEBUG === '1') env.SQUISH_DEBUG = '1';
delete env.ELECTRON_RENDERER_URL;

const fail = (msg) => {
  console.error(`SMOKE FAIL: ${msg}`);
  process.exitCode = 1;
};

const app = await electron.launch({ ...launch, env, timeout: 60_000 });
const logs = [];
app.process().stdout?.on('data', (d) => logs.push(String(d)));
app.process().stderr?.on('data', (d) => logs.push(String(d)));

try {
  // Ждём окно виджета (по заголовку из i18n).
  let widget = null;
  for (let i = 0; i < 60 && !widget; i++) {
    for (const w of app.windows()) {
      if (
        (await w
          .locator('.pet')
          .count()
          .catch(() => 0)) > 0
      ) {
        widget = w;
      }
    }
    if (!widget) await new Promise((r) => setTimeout(r, 500));
  }
  if (!widget) throw new Error('окно виджета с питомцем не появилось');

  const probe = await app.evaluate(() => globalThis.__squishProbe ?? null);
  console.log('probe:', JSON.stringify(probe));
  writeFileSync(join(outDir, 'probe.json'), JSON.stringify(probe, null, 2));
  if (!probe) fail('нет результата пробы koffi');
  else {
    if (!probe.koffi.loaded) fail(`koffi не загрузился: ${probe.koffi.error}`);
    if (process.platform === 'win32' && typeof probe.notificationState !== 'number') {
      fail(`SHQueryUserNotificationState вернул ${probe.notificationState}`);
    }
  }

  const info = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => ({
      title: w.getTitle(),
      bounds: w.getBounds(),
      visible: w.isVisible(),
      alwaysOnTop: w.isAlwaysOnTop(),
    })),
  );
  console.log('windows:', JSON.stringify(info));
  const wInfo = info.find((w) => w.title.startsWith('Squish —') && w.alwaysOnTop);
  if (!wInfo) fail('виджет не alwaysOnTop');
  else if (wInfo.bounds.width !== 220 || wInfo.bounds.height !== 260)
    fail(`размер виджета ${JSON.stringify(wInfo.bounds)}`);

  await widget.waitForTimeout(800);
  await widget.screenshot({ path: join(outDir, 'widget.png') });
  // Клик по питомцу → bounce.
  // Питомец дышит (элемент «не стабилен» для locator.click) — кликаем мышью в центр питомца.
  await widget.mouse.click(110, 110);
  await widget.waitForTimeout(250);
  const reaction = await widget.locator('.pet .hop').first().getAttribute('data-reaction');
  if (reaction !== 'bounce') fail(`после клика ожидалась реакция bounce, а не «${reaction}»`);
  await widget.screenshot({ path: join(outDir, 'widget-bounce.png') });
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
} finally {
  writeFileSync(join(outDir, 'app.log'), logs.join(''));
  await app.close().catch(() => {});
}
if (!process.exitCode) console.log('SMOKE OK');
