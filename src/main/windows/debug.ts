import { BrowserWindow } from 'electron';
import { t } from '../i18n';
import { lockDown, loadPage, secureWebPreferences } from './common';

let debugWin: BrowserWindow | null = null;

export function openDebugWindow(): BrowserWindow {
  if (debugWin && !debugWin.isDestroyed()) {
    debugWin.show();
    debugWin.focus();
    return debugWin;
  }
  debugWin = new BrowserWindow({
    width: 440,
    height: 640,
    title: t('debug.title'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: secureWebPreferences(),
  });
  lockDown(debugWin);
  debugWin.once('ready-to-show', () => debugWin?.show());
  debugWin.on('closed', () => {
    debugWin = null;
  });
  void loadPage(debugWin, 'debug');
  return debugWin;
}

export function getDebugWindow(): BrowserWindow | null {
  return debugWin && !debugWin.isDestroyed() ? debugWin : null;
}
