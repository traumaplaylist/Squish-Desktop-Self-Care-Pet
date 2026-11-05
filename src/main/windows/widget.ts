import { BrowserWindow, screen } from 'electron';
import type { DisplayInfo, Rect, WidgetPosition } from '../../core/types';
import { resolveWidgetRect, toWidgetPosition } from '../../core/widgetPosition';
import { t } from '../i18n';
import { lockDown, loadPage, secureWebPreferences } from './common';

/** Окно выше питомца: сверху место под облачко (preBreak, реплики). Пустота пропускает клики. */
export const WIDGET_SIZE = { width: 240, height: 360 } as const;
/** Центр питомца внутри окна (для слежения глаз): .pet-host left 30, top 130, 180×180. */
const PET_CENTER = { x: 120, y: 225 } as const;
const EYE_RADIUS = 300;

export function getDisplays(): DisplayInfo[] {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen
    .getAllDisplays()
    .map((d) => ({ id: d.id, workArea: d.workArea, primary: d.id === primaryId }));
}

export interface WidgetController {
  win: BrowserWindow;
  /** Заново поставить окно по сохранённой позиции (смена мониторов/DPI). */
  reposition(saved: WidgetPosition | null): void;
  startDrag(offsetX: number, offsetY: number): void;
  endDrag(): WidgetPosition | null;
  setHover(hover: boolean): void;
  setContentProtection(on: boolean): void;
  destroy(): void;
}

export function createWidgetWindow(opts: {
  saved: WidgetPosition | null;
  hideFromCapture: boolean;
  onPositionChanged: (pos: WidgetPosition | null) => void;
}): WidgetController {
  const rect = resolveWidgetRect(opts.saved, getDisplays(), WIDGET_SIZE);
  const win = new BrowserWindow({
    ...rect,
    title: t('widget.title'),
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
    webPreferences: { ...secureWebPreferences(), backgroundThrottling: true },
  });
  lockDown(win);
  win.setAlwaysOnTop(true, 'floating');
  // SPEC 2.1: питомец не попадает в демонстрацию экрана (Win10 2004+: WDA_EXCLUDEFROMCAPTURE).
  win.setContentProtection(opts.hideFromCapture);
  win.once('ready-to-show', () => win.showInactive());
  void loadPage(win, 'widget');

  // Прозрачные области пропускают клики на рабочий стол (только Windows/macOS поддерживают forward).
  const canForward = process.platform === 'win32' || process.platform === 'darwin';
  let hover = false;
  const applyIgnore = () => {
    if (canForward) win.setIgnoreMouseEvents(!hover && !dragging, { forward: true });
  };

  // ── Перетаскивание: своё, через setBounds с явным размером (R0: лечит «рост» окна на mixed DPI).
  let dragging = false;
  let dragTimer: NodeJS.Timeout | null = null;
  let dragOffset = { x: 0, y: 0 };

  const setRect = (r: Rect) => {
    if (win.isDestroyed()) return;
    win.setBounds({
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: WIDGET_SIZE.width,
      height: WIDGET_SIZE.height,
    });
  };

  // ── Слежение глаз: курсор опрашивается 4 Гц, когда далеко, и 10 Гц — в радиусе 300 px (R0).
  let eyeTimer: NodeJS.Timeout | null = null;
  let eyesNear = false;
  const eyeTick = () => {
    eyeTimer = null;
    if (win.isDestroyed()) return;
    if (win.isVisible()) {
      const p = screen.getCursorScreenPoint();
      const b = win.getBounds();
      const dx = p.x - (b.x + PET_CENTER.x);
      const dy = p.y - (b.y + PET_CENTER.y);
      const dist = Math.hypot(dx, dy);
      if (dist <= EYE_RADIUS) {
        eyesNear = true;
        const clamp = (v: number) => Math.max(-1, Math.min(1, v));
        win.webContents.send('pet:eyes', { x: clamp(dx / 120), y: clamp(dy / 120) });
      } else if (eyesNear) {
        eyesNear = false;
        win.webContents.send('pet:eyes', null);
      }
    }
    eyeTimer = setTimeout(eyeTick, eyesNear ? 100 : 250);
  };
  win.webContents.once('did-finish-load', eyeTick);

  win.on('show', () => win.webContents.send('pet:paused', false));
  win.on('hide', () => win.webContents.send('pet:paused', true));

  // R0: alwaysOnTop теряется после фуллскрин-приложений — переутверждаем раз в 30 с.
  const topTimer = setInterval(() => {
    if (!win.isDestroyed() && win.isVisible()) win.setAlwaysOnTop(true, 'floating');
  }, 30_000);

  return {
    win,
    reposition(saved) {
      setRect(resolveWidgetRect(saved, getDisplays(), WIDGET_SIZE));
      win.setAlwaysOnTop(true, 'floating');
    },
    startDrag(offsetX, offsetY) {
      dragging = true;
      dragOffset = { x: offsetX, y: offsetY };
      applyIgnore();
      if (dragTimer) clearInterval(dragTimer);
      dragTimer = setInterval(() => {
        const p = screen.getCursorScreenPoint();
        setRect({ x: p.x - dragOffset.x, y: p.y - dragOffset.y, ...WIDGET_SIZE });
      }, 16);
    },
    endDrag() {
      if (dragTimer) clearInterval(dragTimer);
      dragTimer = null;
      dragging = false;
      applyIgnore();
      const displays = getDisplays();
      // Отпустили за краем — вернуть в видимую область.
      const pos = toWidgetPosition(win.getBounds(), displays);
      const fixed = resolveWidgetRect(pos, displays, WIDGET_SIZE);
      setRect(fixed);
      const finalPos = toWidgetPosition(fixed, displays);
      opts.onPositionChanged(finalPos);
      return finalPos;
    },
    setHover(h) {
      hover = h;
      applyIgnore();
    },
    setContentProtection(on) {
      win.setContentProtection(on);
    },
    destroy() {
      clearInterval(topTimer);
      if (dragTimer) clearInterval(dragTimer);
      if (eyeTimer) clearTimeout(eyeTimer);
      if (!win.isDestroyed()) win.destroy();
    },
  };
}
