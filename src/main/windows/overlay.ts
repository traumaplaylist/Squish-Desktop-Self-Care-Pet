import { BrowserWindow, globalShortcut, screen } from 'electron';
import { log } from '../log';
import { lockDown, loadPage, secureWebPreferences } from './common';

/**
 * Оверлей перерыва (SPEC 2.2): окно на КАЖДОМ мониторе, уровень 'screen-saver'.
 * R0: окна создаются скрытыми в начале preBreak (prepare) и уничтожаются после перерыва.
 * Esc и аварийный выход — через globalShortcut только на время показа (Windows может не отдать фокус).
 */
const FADE_OUT_MS = 450;
const CELEBRATE_MS = 1500;
const EMERGENCY = 'Control+Alt+Shift+Escape';

export interface OverlayHandlers {
  onEsc(): void;
  onEmergency(): void;
}

export class OverlayManager {
  private wins: BrowserWindow[] = [];
  private shown = false;
  private hideTimer: NodeJS.Timeout | null = null;

  constructor(private readonly handlers: OverlayHandlers) {}

  get windows(): readonly BrowserWindow[] {
    return this.wins;
  }

  prepare(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
      this.destroyAll();
    }
    if (this.wins.length) return;
    const primaryId = screen.getPrimaryDisplay().id;
    for (const d of screen.getAllDisplays()) {
      const primary = d.id === primaryId;
      const win = new BrowserWindow({
        ...d.bounds,
        title: 'Squish — break',
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        hasShadow: false,
        show: false,
        alwaysOnTop: true,
        webPreferences: { ...secureWebPreferences(), backgroundThrottling: false },
      });
      lockDown(win);
      win.setAlwaysOnTop(true, 'screen-saver');
      win.setVisibleOnAllWorkspaces(true);
      void loadPage(win, 'overlay', { primary: primary ? '1' : '0' });
      this.wins.push(win);
    }
  }

  show(): void {
    this.prepare();
    this.shown = true;
    for (const w of this.wins) {
      if (w.isDestroyed()) continue;
      const showNow = () => {
        if (w.isDestroyed() || !this.shown) return;
        w.setAlwaysOnTop(true, 'screen-saver');
        w.show();
        w.webContents.send('overlay:shown', null);
      };
      if (w.webContents.isLoading()) w.webContents.once('did-finish-load', showNow);
      else showNow();
    }
    this.wins[0]?.focus();
    this.registerKeys();
  }

  /** Досидел перерыв: питомец радуется, затем окна тают. */
  finish(): void {
    if (!this.shown) return this.hide();
    for (const w of this.wins) if (!w.isDestroyed()) w.webContents.send('overlay:done', null);
    this.unregisterKeys();
    this.scheduleDestroy(CELEBRATE_MS);
  }

  hide(): void {
    this.shown = false;
    this.unregisterKeys();
    for (const w of this.wins) if (!w.isDestroyed()) w.webContents.send('overlay:fadeOut', null);
    this.scheduleDestroy(FADE_OUT_MS);
  }

  private scheduleDestroy(afterMs: number): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.shown = false;
      this.destroyAll();
    }, afterMs);
  }

  private destroyAll(): void {
    for (const w of this.wins) if (!w.isDestroyed()) w.destroy();
    this.wins = [];
  }

  private registerKeys(): void {
    const ok1 = globalShortcut.register('Escape', () => this.handlers.onEsc());
    const ok2 = globalShortcut.register(EMERGENCY, () => this.handlers.onEmergency());
    if (!ok1 || !ok2) log(`overlay: хоткеи Esc=${ok1} emergency=${ok2}`);
  }

  private unregisterKeys(): void {
    if (globalShortcut.isRegistered('Escape')) globalShortcut.unregister('Escape');
    if (globalShortcut.isRegistered(EMERGENCY)) globalShortcut.unregister(EMERGENCY);
  }

  dispose(): void {
    this.unregisterKeys();
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.destroyAll();
  }
}
