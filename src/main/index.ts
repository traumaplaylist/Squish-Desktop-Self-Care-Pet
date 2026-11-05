import { basename, join } from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, powerMonitor, screen } from 'electron';
import { AcceleratedClock, type Clock } from '../core/clock';
import { formatTimeOfDay, nextDayBoundary } from '../core/day';
import { DEFAULT_SETTINGS, defaultState } from '../core/defaults';
import type { Effect } from '../core/events';
import type { ProbeResult, RendererCommands, RendererInvokes } from '../core/ipc';
import { classifyNotificationState } from '../core/notificationState';
import type { PersistedState, Settings, Snapshot } from '../core/types';
import { Engine } from './engine';
import { getDict, setLang, t } from './i18n';
import { log } from './log';
import { RealClock } from './realClock';
import { getKoffiError, loadKoffi, queryUserNotificationState } from './smartPause/fullscreen';
import { EventLog, JsonStore } from './storage';
import { registerHotkeys, unregisterHotkeys } from './hotkeys';
import { SmartPause } from './smartPause';
import { foregroundProcess, readConsentStore, readConsentStoreViaReg } from './smartPause/win32';
import { buildMenu, createTray, setTrayTooltip, updateTray, type TrayActions } from './tray';
import { getDebugWindow, openDebugWindow } from './windows/debug';
import { OverlayManager } from './windows/overlay';
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

  const settingsStore = new JsonStore<Settings>({
    dir: dataDir,
    name: 'settings',
    version: 1,
    defaults: () => structuredClone(DEFAULT_SETTINGS),
    now: () => real.now(),
    log,
  });
  const stateStore = new JsonStore<PersistedState>({
    dir: dataDir,
    name: 'state',
    version: 3,
    defaults: () => defaultState(clock.now()),
    migrations: {
      // v1 (День 1) → v2 (День 2): новые поля планировщика.
      1: (d) => {
        const s = d as PersistedState;
        return { ...s, scheduler: { ...defaultState(clock.now()).scheduler, ...s.scheduler } };
      },
      // v2 → v3 (День 3): учёт воды.
      2: (d) => ({ ...(d as PersistedState), water: defaultState(clock.now()).water }),
    },
    now: () => real.now(),
    log,
  });
  const events = new EventLog(dataDir);
  setLang(settingsStore.get().lang);

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
          break;
        case 'hideOverlay':
          // Досидел — сначала радость, потом окно тает (обрабатывается ниже).
          if (!(finished?.type === 'breakFinished' && finished.completed)) overlay.hide();
          break;
        case 'petReaction':
          widget.win.webContents.send('pet:play', e.reaction);
          break;
        case 'breakFinished':
          if (e.completed) {
            overlay.finish();
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
  });

  // ── Умная пауза: детекторы раз в 5 с (SPEC 3.3) ──
  const smartPause = new SmartPause(
    () => settingsStore.get(),
    (s) => {
      engine.setDetectorSuppression(s);
      publish();
    },
  );
  smartPause.start();

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
    ignoreQuietApp,
    pause: (m) =>
      engine.dispatch({
        type: 'pause',
        until: m === 'tomorrow' ? nextDayBoundary(clock.now()) : clock.now() + m * 60_000,
      }),
    resume: () => engine.dispatch({ type: 'resume' }),
    toggleWidget,
    openDebug: openDebugWindow,
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
    updateTray(trayActions, { paused: v.phase === 'paused', quietApp });
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
  const failed = registerHotkeys(settingsStore.get().hotkeys, {
    quickTask: () => {
      engine.showBubble('tasks.soon');
      publish();
    },
    water: () => engine.drinkWater(),
    breakNow: () => engine.breakNowAuto(),
    toggleWidget,
  });
  engine.setHotkeysFailed(failed);

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
  handle('debug:probe', probe);

  on('widget:click', () => log('питомец: клик'));
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
    }).popup({
      window: widget.win,
    }),
  );
  on('water:drink', () => engine.drinkWater());
  on('tasks:open', () => {
    engine.showBubble('tasks.soon');
    publish();
  });
  on('bubble:action', (a) => {
    if (a === 'water:drink') engine.drinkWater();
    else if (a === 'water:undo') engine.undoWater();
    else if (a === 'quiet:ignoreApp') ignoreQuietApp();
    else if (a === 'dismiss') engine.dismissBubble();
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
    settingsStore.flush();
  });
}
