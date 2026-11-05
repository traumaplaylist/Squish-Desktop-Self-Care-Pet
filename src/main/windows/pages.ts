import { BrowserWindow } from 'electron';
import { t } from '../i18n';
import { lockDown, loadPage, secureWebPreferences } from './common';

/** Обычные окна-страницы (онбординг, настройки, «Дом питомца»): по одному экземпляру. */
export type PageName = 'onboarding' | 'settings' | 'home';

const SIZES: Record<PageName, { width: number; height: number; titleKey: string }> = {
  onboarding: { width: 460, height: 560, titleKey: 'onboarding.title' },
  settings: { width: 560, height: 680, titleKey: 'settings.title' },
  home: { width: 560, height: 620, titleKey: 'home.title' },
};

const open = new Map<PageName, BrowserWindow>();

export function openPage(page: PageName, opts: { onClosed?: () => void } = {}): BrowserWindow {
  const existing = open.get(page);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return existing;
  }
  const size = SIZES[page];
  const win = new BrowserWindow({
    width: size.width,
    height: size.height,
    title: t(size.titleKey),
    show: false,
    resizable: page !== 'onboarding',
    minimizable: true,
    maximizable: false,
    autoHideMenuBar: true,
    backgroundColor: '#faf7f2',
    webPreferences: secureWebPreferences(),
  });
  lockDown(win);
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    open.delete(page);
    opts.onClosed?.();
  });
  void loadPage(win, page);
  open.set(page, win);
  return win;
}

export function getPage(page: PageName): BrowserWindow | null {
  const w = open.get(page);
  return w && !w.isDestroyed() ? w : null;
}

export function closePage(page: PageName): void {
  getPage(page)?.close();
}

/** Новый язык — обновить заголовки открытых окон. */
export function retitlePages(): void {
  for (const [page, w] of open) if (!w.isDestroyed()) w.setTitle(t(SIZES[page].titleKey));
}
