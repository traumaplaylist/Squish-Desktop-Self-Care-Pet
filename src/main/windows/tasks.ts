import { BrowserWindow, screen } from 'electron';
import { log } from '../log';
import { lockDown, loadPage, secureWebPreferences } from './common';

/**
 * Окно быстрого ввода и панели задач (SPEC 2.7; R0: одно окно, два режима — ради RAM).
 * Создаётся при старте и прячется: появление < 150 мс — требование (замер: t0 → 'tasks:shown').
 */
export type TasksMode = 'quick' | 'panel';
const WIDTH = 340;
const HEIGHT: Record<TasksMode, number> = { quick: 176, panel: 500 };
const GAP = 6;

export class TasksWindow {
  readonly win: BrowserWindow;
  private mode: TasksMode = 'quick';
  lastLatencyMs: number | null = null;

  constructor(opts: { hideFromCapture: boolean; anchor: () => Electron.Rectangle }) {
    this.anchor = opts.anchor;
    this.win = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT.quick,
      title: 'Squish — tasks',
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      show: false,
      webPreferences: { ...secureWebPreferences(), backgroundThrottling: false },
    });
    lockDown(this.win);
    this.win.setAlwaysOnTop(true, 'floating');
    this.win.setContentProtection(opts.hideFromCapture);
    // Ушёл фокус — прячемся, как всплывающее окно.
    this.win.on('blur', () => this.hide());
    void loadPage(this.win, 'tasks');
  }

  private readonly anchor: () => Electron.Rectangle;

  /** Слева от виджета, низом к низу виджета; не вылезать за рабочую область монитора. */
  private placeFor(mode: TasksMode): Electron.Rectangle {
    const a = this.anchor();
    const h = HEIGHT[mode];
    const wa = screen.getDisplayMatching(a).workArea;
    let x = a.x - WIDTH - GAP;
    if (x < wa.x) x = a.x + a.width + GAP; // нет места слева — справа
    x = Math.min(Math.max(x, wa.x), wa.x + wa.width - WIDTH);
    const y = Math.min(Math.max(a.y + a.height - h - 8, wa.y), wa.y + wa.height - h);
    return { x: Math.round(x), y: Math.round(y), width: WIDTH, height: h };
  }

  show(mode: TasksMode): void {
    const t0 = Date.now();
    if (this.win.isDestroyed()) return;
    this.mode = mode;
    this.win.setBounds(this.placeFor(mode));
    this.win.webContents.send('tasks:mode', { mode, t0 });
    this.win.show();
    this.win.focus();
  }

  setMode(mode: TasksMode): void {
    if (mode === this.mode || !this.win.isVisible()) return;
    this.mode = mode;
    this.win.setBounds(this.placeFor(mode));
  }

  toggle(mode: TasksMode): void {
    if (this.win.isVisible() && this.mode === mode) this.hide();
    else this.show(mode);
  }

  hide(): void {
    if (!this.win.isDestroyed() && this.win.isVisible()) this.win.hide();
  }

  /** Renderer подтвердил: окно видно и поле в фокусе. */
  shown(t0: number): void {
    if (typeof t0 !== 'number') return;
    this.lastLatencyMs = Date.now() - t0;
    log(`окно задач: появилось за ${this.lastLatencyMs} мс (бюджет 150)`);
  }

  setContentProtection(on: boolean): void {
    this.win.setContentProtection(on);
  }
}
