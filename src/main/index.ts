import { randomUUID } from 'node:crypto';
import { basename, join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  powerMonitor,
  screen,
} from 'electron';
import { applyImport, buildExport, parseExport } from './dataTransfer';
import { AcceleratedClock, type Clock } from '../core/clock';
import { formatTimeOfDay, nextDayBoundary } from '../core/day';
import { dayKey } from '../core/day';
import { STATE_VERSION, stateMigrations } from '../core/migrations';
import { DEFAULT_SETTINGS, defaultState, defaultTasks } from '../core/defaults';
import type { Effect } from '../core/events';
import type { HomeTab, ProbeResult, RendererCommands, RendererInvokes } from '../core/ipc';
import { classifyNotificationState } from '../core/notificationState';
import {
  SPECIES,
  type SpeciesId,
  type PersistedState,
  type PersistedTasks,
  type Settings,
  type Snapshot,
} from '../core/types';
import { Engine } from './engine';
import { getDict, setLang, t } from './i18n';
import { validateSettings } from '../core/settingsSchema';
import { closePage, openPage, retitlePages } from './windows/pages';
import { initFileLog, log } from './log';
import { RealClock } from './realClock';
import { getKoffiError, loadKoffi, queryUserNotificationState } from './smartPause/fullscreen';
import { dailyBackup, EventLog, JsonStore } from './storage';
import { registerHotkeys, unregisterHotkeys } from './hotkeys';
import { SmartPause } from './smartPause';
import { foregroundProcess, readConsentStore, readConsentStoreViaReg } from './smartPause/win32';
import { buildMenu, createTray, setTrayTooltip, updateTray, type TrayActions } from './tray';
import { getDebugWindow, openDebugWindow } from './windows/debug';
import { OverlayManager } from './windows/overlay';
import { TasksWindow } from './windows/tasks';
import { createWidgetWindow, type WidgetController } from './windows/widget';

const DEBUG = process.env['SQUISH_DEBUG'] === '1';
const VERSION = app.getVersion();
const DEBUG_SPEED = Number(process.env['SQUISH_DEBUG_SPEED'] ?? 60) || 60;

// ── Папка данных: отдельная для debug (ускоренные часы пишут «будущие» метки) и для тестов.
if (process.env['SQUISH_USER_DATA']) {
  app.setPath('userData', process.env['SQUISH_USER_DATA']);
} else if (DEBUG) {
  app.setPath('userData', join(app.getPath('appData'), 'Squish-debug'));
}

app.setAppUserModelId('com.squish.app');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void main();
}

/** Для смоук-теста: koffi-реестр и reg.exe должны видеть одни и те же записи. */
async function probeConsent(): Promise<ProbeResult['consent']> {
  const a = await readConsentStore('microphone');
  const b = await readConsentStoreViaReg('microphone');
  const keys = (x: typeof a) =>
    x === 'unknown'
      ? null
      : x
          .map((e) => e.key.toLowerCase())
          .sort()
          .join('|');
  return {
    koffi: a === 'unknown' ? 'unknown' : a.length,
    reg: b === 'unknown' ? 'unknown' : b.length,
    sameKeys: a === 'unknown' || b === 'unknown' ? null : keys(a) === keys(b),
  };
}

async function probeForeground(): Promise<ProbeResult['foreground']> {
  const fg = await foregroundProcess();
  if (fg === 'unknown') return 'unknown';
  return fg.path ? basename(fg.path) : null;
}

async function main(): Promise<void> {
  const real = new RealClock();
  const accel = DEBUG ? new AcceleratedClock(real, DEBUG_SPEED) : null;
  const clock: Clock = accel ?? real;
  const dataDir = app.getPath('userData');
  initFileLog(join(dataDir, 'logs'));
  // Устойчивость (День 7): необработанная ошибка — в лог, приложение живёт дальше.
  process.on('uncaughtException', (e) => log('uncaughtException:', e));
  process.on('unhandledRejection', (e) => log('unhandledRejection:', e));
  app.on('render-process-gone', (_e, wc, details) => {
    log(`окно упало (${details.reason}, код ${details.exitCode}) — перезагружаю`);
    if (!wc.isDestroyed()) wc.reload();
  });
  app.on('child-process-gone', (_e, details) =>
    log(`процесс ${details.type} завершился: ${details.reason}`),
  );

  const settingsStore = new JsonStore<Settings>({
    dir: dataDir,
    name: 'settings',
    version: 1,
    defaults: () => structuredClone(DEFAULT_SETTINGS),
    now: () => real.now(),
    log,
    backupDir: join(dataDir, 'backups'),
  });
  const stateStore = new JsonStore<PersistedState>({
    dir: dataDir,
    name: 'state',
    version: STATE_VERSION,
    defaults: () => defaultState(clock.now()),
    migrations: stateMigrations(() => clock.now()),
    now: () => real.now(),
    log,
    backupDir: join(dataDir, 'backups'),
  });
  const tasksStore = new JsonStore<PersistedTasks>({
    dir: dataDir,
    name: 'tasks',
    version: 1,
    defaults: () => defaultTasks(),
    now: () => real.now(),
    log,
    backupDir: join(dataDir, 'backups'),
  });
  const events = new EventLog(dataDir);
  const backup = (day: string) => dailyBackup(dataDir, ['settings', 'state', 'tasks'], day, 7, log);
  backup(dayKey(clock.now()));
  // Настройки из файла проходят проверку (SPEC 2.4): мусор → значения по умолчанию, без падения.
  {
    const checked = validateSettings(settingsStore.get());
    if (JSON.stringify(checked) !== JSON.stringify(settingsStore.get()))
      settingsStore.set(checked, 0);
  }
  setLang(settingsStore.get().lang);
  const SKIP_ONBOARDING = process.env['SQUISH_SKIP_ONBOARDING'] === '1';
  if (SKIP_ONBOARDING && !stateStore.get().onboardingDone) {
    stateStore.set({ ...stateStore.get(), onboardingDone: true }, 0);
  }
  // Для тестов и замеров: SQUISH_SPECIES=hamster — вид питомца при старте.
  const forcedSpecies = process.env['SQUISH_SPECIES'] as SpeciesId | undefined;
  if (forcedSpecies && SPECIES.includes(forcedSpecies)) {
    stateStore.set(
      { ...stateStore.get(), pet: { ...stateStore.get().pet, species: forcedSpecies } },
      0,
    );
  }

  await app.whenReady();
  Menu.setApplicationMenu(null);

  events.append({ type: 'app_start', at: clock.now(), version: VERSION });
  log(`старт ${VERSION}, данные: ${dataDir}, debug=${DEBUG}, state: ${stateStore.lastLoad}`);

  const probe = async (): Promise<ProbeResult> => {
    const k = await loadKoffi();
    return {
      platform: `${process.platform}-${process.arch}`,
      koffi: {
        loaded: !!k,
        version: k ? String((k as { version?: string }).version ?? '?') : null,
        error: getKoffiError(),
      },
      notificationState: await queryUserNotificationState(),
      consent: await probeConsent(),
      foreground: await probeForeground(),
    };
  };
  const probeResult = await probe();
  log(
    'проба koffi:',
    JSON.stringify(probeResult),
    '→',
    classifyNotificationState(probeResult.notificationState).kind,
  );
  (globalThis as Record<string, unknown>)['__squishProbe'] = probeResult; // для смоук-теста

  // ── Окна ──
  const savePosition = (position: PersistedState['widget']['position']) => {
    const s = stateStore.get();
    stateStore.set({ ...s, widget: { ...s.widget, position } }, 0);
  };
  const makeWidget = () =>
    createWidgetWindow({
      saved: stateStore.get().widget.position,
      hideFromCapture: settingsStore.get().general.hideFromCapture,
      startHidden: !stateStore.get().onboardingDone,
      onPositionChanged: savePosition,
    });
  let widget: WidgetController = makeWidget();
  let quitting = false;

  const broadcast = (snap: Snapshot) => {
    for (const w of BrowserWindow.getAllWindows())
      if (!w.isDestroyed()) w.webContents.send('snapshot', snap);
  };

  // ── Движок ──
  const overlay = new OverlayManager({
    onEsc: () => engine.dispatch({ type: 'skip' }),
    onEmergency: () => engine.dispatch({ type: 'skip', emergency: true }),
  });

  const runEffects = (fx: Effect[]) => {
    const finished = fx.find((e) => e.type === 'breakFinished');
    for (const e of fx) {
      switch (e.type) {
        case 'prepareOverlay':
          overlay.prepare();
          break;
        case 'showOverlay':
          overlay.show();
          // Во время перерыва виджет под оверлеем — его анимации на паузе (SPEC 7.5).
          widget.win.webContents.send('pet:paused', true);
          break;
        case 'hideOverlay':
          // Досидел — сначала радость, потом окно тает (обрабатывается ниже).
          if (!(finished?.type === 'breakFinished' && finished.completed)) overlay.hide();
          if (widget.win.isVisible()) widget.win.webContents.send('pet:paused', false);
          break;
        case 'petReaction':
          widget.win.webContents.send('pet:play', e.reaction);
          break;
        case 'coins':
          if (e.count > 0 || e.surprise) {
            widget.win.webContents.send('pet:coins', { count: e.count, surprise: e.surprise });
            tasksWin.win.webContents.send('pet:coins', { count: e.count, surprise: e.surprise });
          }
          break;
        case 'breakFinished':
          if (e.completed) {
            overlay.finish();
            widget.win.webContents.send('pet:paused', false);
            widget.win.webContents.send('pet:play', 'celebrate');
          }
          break;
        default:
          break;
      }
    }
    publish();
  };

  const engine: Engine = new Engine({
    clock,
    realNow: () => real.now(),
    timeScale: () => accel?.getFactor() ?? 1,
    getIdleMs: () => powerMonitor.getSystemIdleTime() * 1000,
    getState: () => stateStore.get(),
    setState: (s, delay) => stateStore.set(s, delay),
    getSettings: () => settingsStore.get(),
    getTasks: () => tasksStore.get(),
    setTasks: (t, delay) => tasksStore.set(t, delay),
    newId: () => randomUUID(),
    onTasksChanged: (v) => {
      if (!tasksWin.win.isDestroyed()) tasksWin.win.webContents.send('tasks', v);
    },
    onNewDay: (day) => backup(day),
    readEvents: () => {
      const now = real.now();
      const d = new Date(now);
      const prev = new Date(d.getFullYear(), d.getMonth() - 1, 15).getTime();
      return [...events.readMonth(prev), ...events.readMonth(now)];
    },
    theme: () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light'),
    appendEvent: (e) => events.append(e),
    onEffects: runEffects,
    getDetectorReadings: () => {
      const r = smartPause.readings;
      return {
        mic: r.mic,
        camera: r.camera,
        fullscreen: r.fullscreen,
        foregroundExe: r.foregroundExe === 'unknown' ? null : r.foregroundExe,
      };
    },
    debug: DEBUG,
    t: (k) => t(k),
  });

  // «Дом питомца» на нужной вкладке: свежему окну — через home:get, открытому — событием.
  let pendingHomeTab: HomeTab | null = null;
  const openHomeTab = (tab: HomeTab) => {
    const w = openPage('home');
    if (w.webContents.isLoading()) pendingHomeTab = tab;
    else w.webContents.send('home:tab', tab);
  };

  // ── Умная пауза: детекторы раз в 5 с (SPEC 3.3) ──
  const smartPause = new SmartPause(
    () => settingsStore.get(),
    (s) => {
      engine.setDetectorSuppression(s);
      publish();
    },
  );
  smartPause.start();

  // ── Окно задач: создано заранее и спрятано (SPEC 2.7: появление < 150 мс) ──
  const tasksWin = new TasksWindow({
    hideFromCapture: settingsStore.get().general.hideFromCapture,
    anchor: () => widget.win.getBounds(),
  });
  (globalThis as Record<string, unknown>)['__squishTasksLatency'] = () => tasksWin.lastLatencyMs;
  // Для e2e: открыть окно как из трея (меню трея в Xvfb не нажать).
  (globalThis as Record<string, unknown>)['__squishOpen'] = (p: 'home' | 'settings') => openPage(p);
  // Для e2e: показать окно задач так же, как хоткей Ctrl+Alt+T (хоткей в Xvfb не нажать).
  (globalThis as Record<string, unknown>)['__squishShowTasks'] = (m: 'quick' | 'panel') =>
    tasksWin.show(m);

  /** «Не считать это приложение созвоном» (R0): в настройки и сразу переопросить детекторы. */
  const ignoreQuietApp = () => {
    const app = engine.getSchedulerState().suppression?.app;
    if (!app || app === 'debug') return;
    const st = settingsStore.get();
    if (st.smartPause.ignoreMicApps.some((a) => a.toLowerCase() === app.toLowerCase())) return;
    settingsStore.set(
      {
        ...st,
        smartPause: { ...st.smartPause, ignoreMicApps: [...st.smartPause.ignoreMicApps, app] },
      },
      0,
    );
    log(`умная пауза: «${app}» больше не считается созвоном`);
    engine.dismissBubble();
    void smartPause.poll();
  };

  // Для e2e-тестов (только чтение).
  (globalThis as Record<string, unknown>)['__squishPhase'] = () => engine.getSchedulerState().phase;
  // Для замеров CPU/RAM на Windows в CI (только чтение).
  (globalThis as Record<string, unknown>)['__squishMetrics'] = () => app.getAppMetrics();

  const publish = () => {
    const snap = engine.snapshot();
    broadcast(snap);
    updateTrayFromSnapshot(snap);
  };

  // ── Трей ──
  const toggleWidget = () => {
    const w = widget.win;
    if (w.isDestroyed()) return;
    const visible = !w.isVisible();
    if (visible) w.showInactive();
    else w.hide();
    const s = stateStore.get();
    stateStore.set({ ...s, widget: { ...s.widget, visible } });
  };
  const quit = () => {
    quitting = true;
    app.quit();
  };
  const trayActions: TrayActions = {
    breakNow: () => engine.breakNowAuto(),
    water: () => engine.drinkWater(),
    newTask: () => tasksWin.show('quick'),
    toggleHardDay: () => {
      engine.setHardDay(!stateStore.get().pet.hardDay);
      publish();
    },
    ignoreQuietApp,
    pause: (m) =>
      engine.dispatch({
        type: 'pause',
        until: m === 'tomorrow' ? nextDayBoundary(clock.now()) : clock.now() + m * 60_000,
      }),
    resume: () => engine.dispatch({ type: 'resume' }),
    toggleWidget,
    openDebug: openDebugWindow,
    openHome: () => openPage('home'),
    openSettings: () => openPage('settings'),
    quit,
    debug: DEBUG,
  };
  createTray(trayActions);

  function updateTrayFromSnapshot(snap: Snapshot): void {
    const v = snap.scheduler;
    const quietApp =
      v.quiet &&
      (v.quiet.reason === 'mic' || v.quiet.reason === 'camera') &&
      v.quiet.app !== 'debug'
        ? v.quiet.app
        : null;
    updateTray(trayActions, { paused: v.phase === 'paused', quietApp, hardDay: snap.pet.cozy });
    let tip = t('tray.tooltip');
    if (v.quiet) {
      tip =
        v.quiet.app && v.quiet.app !== 'debug'
          ? t('tray.tooltipQuietApp', {
              reason: t(`quiet.${v.quiet.reason}`),
              app: v.quiet.app.replace(/\.exe$/i, ''),
            })
          : t('tray.tooltipQuiet', { reason: t(`quiet.${v.quiet.reason}`) });
    } else if (v.phase === 'paused' && v.pausedUntil)
      tip = t('tray.pausedUntil', { time: formatTimeOfDay(v.pausedUntil) });
    else if (v.phase === 'offHours') tip = t('tray.tooltipOffHours');
    else if (v.phase === 'onBreak') tip = t('tray.tooltipBreak');
    else if (v.next)
      tip = t('tray.tooltipNextBreak', { min: Math.max(1, Math.ceil(v.next.inSec / 60)) });
    setTrayTooltip(tip);
  }

  if (DEBUG) openDebugWindow();

  // ── Хоткеи (SPEC 7.5): занято → не падаем, список — в снапшоте ──
  const applyHotkeys = () =>
    engine.setHotkeysFailed(
      registerHotkeys(settingsStore.get().hotkeys, {
        quickTask: () => tasksWin.toggle('quick'),
        water: () => engine.drinkWater(),
        breakNow: () => engine.breakNowAuto(),
        toggleWidget,
      }),
    );
  applyHotkeys();

  // ── Автозапуск (SPEC 7.5) — только для собранного приложения на Windows ──
  const applyAutostart = () => {
    if (process.platform !== 'win32' || !app.isPackaged) return;
    app.setLoginItemSettings({
      openAtLogin: settingsStore.get().general.autostart,
      args: ['--hidden'],
    });
  };
  applyAutostart();

  /** Применить новые настройки без перезапуска (SPEC 2.4). */
  const updateSettings = (patch: unknown) => {
    const prev = settingsStore.get();
    const next = validateSettings(patch, prev);
    settingsStore.set(next, 0);
    if (next.lang !== prev.lang) {
      setLang(next.lang);
      retitlePages();
      for (const w of BrowserWindow.getAllWindows())
        if (!w.isDestroyed()) w.webContents.send('lang', next.lang);
      updateTray(
        trayActions,
        { paused: false, quietApp: null, hardDay: stateStore.get().pet.hardDay },
        true,
      );
    }
    if (next.general.hideFromCapture !== prev.general.hideFromCapture) {
      widget.setContentProtection(next.general.hideFromCapture);
      tasksWin.setContentProtection(next.general.hideFromCapture);
    }
    if (JSON.stringify(next.hotkeys) !== JSON.stringify(prev.hotkeys)) applyHotkeys();
    if (next.general.autostart !== prev.general.autostart) applyAutostart();
    for (const w of BrowserWindow.getAllWindows())
      if (!w.isDestroyed()) w.webContents.send('settings', next);
    tasksWin.win.webContents.send('tasks', engine.tasksView());
    publish();
  };

  // ── Первый запуск: онбординг вместо виджета (SPEC 2.5) ──
  if (!stateStore.get().onboardingDone) openPage('onboarding');
  nativeTheme.on('updated', () => publish());

  // ── Tick раз в секунду (реального времени) ──
  const tickTimer = setInterval(() => {
    engine.tick();
    publish();
  }, 1000);

  // ── Питание и блокировка ──
  powerMonitor.on('lock-screen', () => engine.setLocked(true));
  powerMonitor.on('unlock-screen', () => engine.setLocked(false));
  powerMonitor.on('suspend', () => engine.persistNow());
  powerMonitor.on('resume', () => engine.dispatch({ type: 'wake' }));

  // Мониторы и DPI поменялись — вернуть виджет на место (R0).
  const onDisplaysChanged = () => widget.reposition(stateStore.get().widget.position);
  screen.on('display-added', onDisplaysChanged);
  screen.on('display-removed', onDisplaysChanged);
  screen.on('display-metrics-changed', onDisplaysChanged);

  // Окно виджета закрылось не по нашей воле — пересоздать.
  widget.win.on('closed', function recreate() {
    if (quitting) return;
    widget = makeWidget();
    widget.win.on('closed', recreate);
  });

  // ── IPC ──
  const handle = <K extends keyof RendererInvokes>(
    ch: K,
    fn: () => RendererInvokes[K]['result'] | Promise<RendererInvokes[K]['result']>,
  ) => ipcMain.handle(ch, fn);
  const on = <K extends keyof RendererCommands>(ch: K, fn: (p: RendererCommands[K]) => void) =>
    ipcMain.on(ch, (_e, p: RendererCommands[K]) => fn(p));

  handle('app:getSnapshot', () => engine.snapshot());
  handle('app:getLangDict', () => getDict());
  handle('tasks:get', () => engine.tasksView());
  handle('debug:probe', probe);

  on('widget:click', () => {
    engine.petClicked();
    publish();
  });
  on('widget:dragStart', (p) => {
    if (typeof p?.offsetX === 'number' && typeof p?.offsetY === 'number')
      widget.startDrag(p.offsetX, p.offsetY);
  });
  on('widget:dragEnd', () => widget.endDrag());
  on('widget:hover', (h) => widget.setHover(h === true));
  on('widget:contextMenu', () =>
    buildMenu(trayActions, {
      paused: engine.getSchedulerState().phase === 'paused',
      quietApp: engine.snapshot().scheduler.quiet?.app ?? null,
      hardDay: stateStore.get().pet.hardDay,
    }).popup({
      window: widget.win,
    }),
  );
  on('water:drink', () => engine.drinkWater());
  on('tasks:open', () => tasksWin.toggle('panel'));
  const taskCmd = <K extends keyof RendererCommands>(ch: K, fn: (p: RendererCommands[K]) => void) =>
    on(ch, (p) => {
      fn(p);
      publish();
    });
  taskCmd('tasks:create', (p) => {
    if (typeof p?.text === 'string') engine.createTaskFromText(p.text);
  });
  taskCmd('tasks:complete', (id) => typeof id === 'string' && engine.completeTask(id));
  taskCmd('tasks:uncomplete', (id) => typeof id === 'string' && engine.uncompleteTask(id));
  taskCmd('tasks:split', (id) => typeof id === 'string' && engine.splitTask(id));
  taskCmd('tasks:rename', (p) => {
    if (typeof p?.id === 'string' && typeof p.title === 'string') engine.renameTask(p.id, p.title);
  });
  taskCmd('tasks:blurSubtasks', (id) => typeof id === 'string' && engine.blurSubtasks(id));
  taskCmd('tasks:delete', (id) => typeof id === 'string' && engine.deleteTask(id));
  taskCmd('tasks:undoDelete', () => engine.undoDelete());
  taskCmd('tasks:reorder', (ids) => Array.isArray(ids) && engine.reorderTasks(ids));
  on('tasks:hide', () => tasksWin.hide());
  on('tasks:setMode', (m) => (m === 'quick' || m === 'panel') && tasksWin.setMode(m));
  on('tasks:shown', (t0) => tasksWin.shown(t0));
  taskCmd('tasks:firstAid', (id) => typeof id === 'string' && engine.firstAid(id));
  handle('home:get', () => {
    const tab = pendingHomeTab;
    pendingHomeTab = null;
    return tab ? { ...engine.homeStats(), openTab: tab } : engine.homeStats();
  });
  on('journey:start', (id) => typeof id === 'string' && engine.startJourney(id));
  on('journey:stop', (id) => typeof id === 'string' && engine.stopJourney(id));
  on('shop:buy', (id) => {
    if (typeof id === 'string') engine.buy(id);
    publish();
  });
  on('wardrobe:toggle', (id) => {
    if (typeof id === 'string') engine.toggleWear(id);
    publish();
  });
  on('pet:feed', (id) => {
    if (typeof id === 'string') engine.feed(id);
    publish();
  });
  on('micro:toggle', (i) => {
    if (typeof i === 'number') engine.toggleMicroPet(i);
    publish();
  });
  on('evening:answer', (text) => {
    if (typeof text === 'string') engine.answerEvening(text);
    publish();
  });
  on('debug:week2', (cmd) => {
    if (!DEBUG) return;
    engine.debugWeek2(cmd);
    publish();
  });
  handle('settings:get', () => ({
    settings: settingsStore.get(),
    hotkeysFailed: engine.snapshot().hotkeysFailed,
    version: VERSION,
  }));
  on('app:open', (w) => {
    if (w === 'home' || w === 'settings') openPage(w);
    else if (w === 'tasks') tasksWin.show('panel');
  });
  on('settings:update', (patch) => updateSettings(patch));
  handle('data:export', async () => {
    // Сначала дописать всё на диск, чтобы экспорт был свежим.
    engine.persistNow();
    stateStore.flush();
    tasksStore.flush();
    settingsStore.flush();
    const r = await dialog.showSaveDialog({
      defaultPath: join(app.getPath('documents'), `squish-${dayKey(clock.now())}.squish.json`),
      filters: [{ name: 'Squish', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false, reason: 'cancelled' };
    try {
      writeFileSync(
        r.filePath,
        JSON.stringify(buildExport(dataDir, VERSION, new Date()), null, 1),
        'utf8',
      );
      log(`экспорт данных: ${r.filePath}`);
      return { ok: true, path: r.filePath };
    } catch (e) {
      log('экспорт не удался:', e);
      return { ok: false, reason: 'write-failed' };
    }
  });
  handle('data:import', async () => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Squish', extensions: ['json'] }],
    });
    const file = r.filePaths[0];
    if (r.canceled || !file) return { ok: false, reason: 'cancelled' };
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      return { ok: false, reason: 'read-failed' };
    }
    const p = parseExport(text);
    if (!p.ok) return { ok: false, reason: p.reason };
    const safe = applyImport(dataDir, p.bundle, new Date().toISOString().replace(/[:.]/g, '-'));
    log(`импорт данных из ${file}; прежние данные сохранены в ${safe} → перезапуск`);
    quitting = true;
    app.relaunch();
    app.exit(0);
    return { ok: true, path: file };
  });
  on('settings:resetProgress', () => {
    // Прогресс — питомец, экономика, задачи. Настройки и позиция виджета остаются.
    const keep = stateStore.get();
    stateStore.set({ ...defaultState(clock.now()), widget: keep.widget, onboardingDone: false }, 0);
    tasksStore.set(defaultTasks(), 0);
    log('сброс прогресса по запросу пользователя → перезапуск');
    quitting = true;
    app.relaunch();
    app.exit(0);
  });
  on('onboarding:finish', (r) => {
    if (!r || typeof r.name !== 'string') return;
    const st = stateStore.get();
    const palette = ['mint', 'peach', 'lavender'].includes(r.palette) ? r.palette : 'mint';
    const species = SPECIES.includes(r.species) ? r.species : 'blob';
    stateStore.set(
      {
        ...st,
        onboardingDone: true,
        pet: {
          ...st.pet,
          name: r.name.trim().slice(0, 24) || st.pet.name,
          species,
          palette,
          stage: 'baby',
        },
      },
      0,
    );
    updateSettings({
      water: { goalGlasses: r.goalGlasses },
      breaks: { strictness: r.strictness },
      general: { autostart: r.autostart === true },
    });
    for (const text of Array.isArray(r.tasks) ? r.tasks.slice(0, 3) : []) {
      if (typeof text === 'string') engine.createTaskFromText(text);
    }
    closePage('onboarding');
    widget.win.showInactive();
    widget.win.webContents.send('pet:play', 'celebrate');
    publish();
  });
  on('debug:species', (sp) => {
    if (!DEBUG || !SPECIES.includes(sp)) return;
    const s = stateStore.get();
    stateStore.set({ ...s, pet: { ...s.pet, species: sp } }, 0);
    publish();
  });
  on('debug:outfit', (o) => {
    if (!DEBUG) return;
    const s = stateStore.get();
    // Наряд «Волшебник» = три предмета гардероба (колпак, плащ, палочка).
    const set = o === 'wizard' ? ['head:wizard', 'neck:cape', 'paw:wand'] : [];
    const owned = [...new Set([...s.pet.owned, ...set])];
    stateStore.set({ ...s, pet: { ...s.pet, accessories: set, owned } }, 0);
    publish();
  });
  on('debug:pet', (cmd) => {
    if (!DEBUG || !['careDay', 'stageUp', 'needsLow', 'energy', 'coins'].includes(cmd)) return;
    engine.debugPet(cmd);
    publish();
  });
  on('bubble:action', (a) => {
    if (a === 'water:drink') engine.drinkWater();
    else if (a === 'water:undo') engine.undoWater();
    else if (a === 'quiet:ignoreApp') ignoreQuietApp();
    else if (a === 'dismiss') engine.dismissBubble();
    else if (a === 'hardDay:on') engine.setHardDay(true);
    else if (a === 'evening:answer' || a === 'adventure:diary') {
      engine.dismissBubble();
      openHomeTab('diary');
    } else if (a.startsWith('task:done:')) {
      engine.dismissBubble();
      engine.completeTask(a.slice('task:done:'.length));
    } else if (a.startsWith('checkin:')) {
      const m = Number(a.slice(8));
      if (m >= 1 && m <= 5) engine.answerCheckin(m as 1 | 2 | 3 | 4 | 5);
    }
    publish();
  });
  on('break:startNow', () => engine.dispatch({ type: 'startNow' }));
  on('break:postpone', () => engine.dispatch({ type: 'postpone' }));
  on('break:skip', () => engine.dispatch({ type: 'skip' }));
  on('break:now', (kind) => {
    if (kind === 'micro' || kind === 'long') engine.dispatch({ type: 'breakNow', kind });
  });

  // Debug-команды работают только в SQUISH_DEBUG.
  on('debug:setVisual', (v) => {
    if (!DEBUG) return;
    engine.setVisualOverride(v);
    publish();
  });
  on('debug:play', (r) => {
    if (DEBUG) widget.win.webContents.send('pet:play', r);
  });
  on('debug:setPalette', (palette) => {
    if (!DEBUG || !['mint', 'peach', 'lavender'].includes(palette)) return;
    const s = stateStore.get();
    stateStore.set({ ...s, pet: { ...s.pet, palette } }, 0);
    publish();
  });
  on('debug:resetPosition', () => {
    if (!DEBUG) return;
    savePosition(null);
    widget.reposition(null);
  });
  on('debug:setSpeed', (n) => {
    if (!DEBUG || !accel || ![1, 10, 60, 600].includes(n)) return;
    accel.setFactor(n);
    publish();
  });
  on('debug:fakeIdle', (ms) => {
    if (!DEBUG) return;
    engine.setFakeIdle(typeof ms === 'number' && ms >= 0 ? ms : null);
    publish();
  });
  on('debug:suppress', (p) => {
    if (!DEBUG) return;
    engine.setSimSuppression(p && typeof p.minutes === 'number' ? p : null);
    publish();
  });

  app.on('second-instance', () => {
    if (!widget.win.isVisible()) toggleWidget();
    getDebugWindow()?.focus();
  });

  app.on('window-all-closed', () => {
    /* живём в трее */
  });

  app.on('before-quit', () => {
    quitting = true;
    clearInterval(tickTimer);
    smartPause.stop();
    unregisterHotkeys();
    overlay.dispose();
    events.append({ type: 'app_quit', at: clock.now() });
    engine.persistNow();
    stateStore.flush();
    tasksStore.flush();
    settingsStore.flush();
  });
}
