import { join } from 'node:path';
import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';

/** Безопасные webPreferences для всех окон (CLAUDE.md). */
export function secureWebPreferences(): BrowserWindowConstructorOptions['webPreferences'] {
  return {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    spellcheck: false,
  };
}

/** Загрузить страницу renderer: dev-сервер или собранный файл. */
export function loadPage(
  win: BrowserWindow,
  page: 'widget' | 'debug' | 'overlay',
  query: Record<string, string> = {},
): Promise<void> {
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    const qs = new URLSearchParams(query).toString();
    return win.loadURL(`${devUrl}/${page}/index.html${qs ? `?${qs}` : ''}`);
  }
  return win.loadFile(join(__dirname, `../renderer/${page}/index.html`), { query });
}

/** Окна не уходят никуда: ни навигации, ни новых окон. */
export function lockDown(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  // Заголовок окна задаём мы (i18n), а не <title> страницы.
  win.on('page-title-updated', (e) => e.preventDefault());
}
