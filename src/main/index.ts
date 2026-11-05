import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, screen } from 'electron';
import { AcceleratedClock, type Clock } from '../core/clock';
import { DEFAULT_SETTINGS, defaultState } from '../core/defaults';
import type { ProbeResult, RendererCommands, RendererInvokes } from '../core/ipc';
import { classifyNotificationState } from '../core/notificationState';
import type { PersistedState, PetVisualState, Settings, Snapshot } from '../core/types';
import { getDict, setLang } from './i18n';
import { log } from './log';
import { RealClock } from './realClock';
import { getKoffiError, loadKoffi, queryUserNotificationState } from './smartPause/fullscreen';
import { EventLog, JsonStore } from './storage';
import { buildMenu, createTray } from './tray';
import { getDebugWindow, openDebugWindow } from './windows/debug';
import { createWidgetWindow, type WidgetController } from './windows/widget';

const DEBUG = process.env['SQUISH_DEBUG'] === '1';
const VERSION = app.getVersion();

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

async function main(): Promise<void> {
  const real = new RealClock();
  const clock: Clock = DEBUG ? new AcceleratedClock(real, 60) : real;
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
    version: 1,
    defaults: () => defaultState(clock.now()),
    now: () => real.now(),
    log,
  });
  const events = new EventLog(dataDir);
  const settings = settingsStore.get();
  setLang(settings.lang);

  let visualOverride: PetVisualState | null = null;

  const snapshot = (): Snapshot => {
    const s = stateStore.get();
    return {
      debug: DEBUG,
      lang: settings.lang,
      pet: {
        name: s.pet.name,
        palette: s.pet.palette,
        stage: s.pet.stage,
        visual: visualOverride ?? 'idle',
        cozy: s.pet.hardDay,
        needs: s.pet.needs,
      },
      tasksToday: { done: 0, total: 0 },
      nextBreakInSec: null,
      quiet: null,
      hotkeysFailed: [],
    };
  };

  const broadcast = () => {
    const snap = snapshot();
    for (const w of BrowserWindow.getAllWindows())
      if (!w.isDestroyed()) w.webContents.send('snapshot', snap);
  };

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
    };
  };

  await app.whenReady();
  Menu.setApplicationMenu(null);

  events.append({ type: 'app_start', at: clock.now(), version: VERSION });
  log(`старт ${VERSION}, данные: ${dataDir}, debug=${DEBUG}, state: ${stateStore.lastLoad}`);

  const probeResult = await probe();
  log(
    'проба koffi:',
    JSON.stringify(probeResult),
    '→',
    classifyNotificationState(probeResult.notificationState).kind,
  );
  // Для смоук-теста (Playwright читает это из main).
  (globalThis as Record<string, unknown>)['__squishProbe'] = probeResult;

  const savePosition = (position: PersistedState['widget']['position']) => {
    const s = stateStore.get();
    stateStore.set({ ...s, widget: { ...s.widget, position } }, 0);
  };

  let widget: WidgetController = createWidgetWindow({
    saved: stateStore.get().widget.position,
    hideFromCapture: settings.general.hideFromCapture,
    onPositionChanged: savePosition,
  });

  const toggleWidget = () => {
    const w = widget.win;
    if (w.isDestroyed()) return;
    const visible = !w.isVisible();
    if (visible) w.showInactive();
    else w.hide();
    const s = stateStore.get();
    stateStore.set({ ...s, widget: { ...s.widget, visible } });
  };

  let quitting = false;
  const quit = () => {
    quitting = true;
    app.quit();
  };

  const trayActions = { toggleWidget, openDebug: openDebugWindow, quit, debug: DEBUG };
  createTray(trayActions);
  if (DEBUG) openDebugWindow();

  // Мониторы и DPI поменялись — вернуть виджет на место (R0).
  const onDisplaysChanged = () => widget.reposition(stateStore.get().widget.position);
  screen.on('display-added', onDisplaysChanged);
  screen.on('display-removed', onDisplaysChanged);
  screen.on('display-metrics-changed', onDisplaysChanged);

  // Окно виджета упало или закрылось не по нашей воле — пересоздать.
  widget.win.on('closed', function recreate() {
    if (quitting) return;
    widget = createWidgetWindow({
      saved: stateStore.get().widget.position,
      hideFromCapture: settings.general.hideFromCapture,
      onPositionChanged: savePosition,
    });
    widget.win.on('closed', recreate);
  });

  // ── IPC ──
  const handle = <K extends keyof RendererInvokes>(
    ch: K,
    fn: () => RendererInvokes[K]['result'] | Promise<RendererInvokes[K]['result']>,
  ) => ipcMain.handle(ch, fn);
  const on = <K extends keyof RendererCommands>(
    ch: K,
    fn: (p: RendererCommands[K], sender: Electron.WebContents) => void,
  ) => ipcMain.on(ch, (e, p: RendererCommands[K]) => fn(p, e.sender));

  handle('app:getSnapshot', snapshot);
  handle('app:getLangDict', () => getDict());
  handle('debug:probe', probe);

  on('widget:click', () => log('питомец: клик'));
  on('widget:dragStart', (p) => {
    if (typeof p?.offsetX === 'number' && typeof p?.offsetY === 'number')
      widget.startDrag(p.offsetX, p.offsetY);
  });
  on('widget:dragEnd', () => widget.endDrag());
  on('widget:hover', (h) => widget.setHover(h === true));
  on('widget:contextMenu', () => buildMenu(trayActions).popup({ window: widget.win }));
  on('debug:setVisual', (v) => {
    if (!DEBUG) return;
    visualOverride = v;
    broadcast();
  });
  on('debug:play', (r) => {
    if (!DEBUG) return;
    widget.win.webContents.send('pet:play', r);
  });
  on('debug:setPalette', (palette) => {
    if (!DEBUG || !['mint', 'peach', 'lavender'].includes(palette)) return;
    const s = stateStore.get();
    stateStore.set({ ...s, pet: { ...s.pet, palette } }, 0);
    broadcast();
  });
  on('debug:resetPosition', () => {
    if (!DEBUG) return;
    savePosition(null);
    widget.reposition(null);
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
    events.append({ type: 'app_quit', at: clock.now() });
    stateStore.flush();
    settingsStore.flush();
  });
}
