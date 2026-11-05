import { Menu, nativeImage, Tray, type MenuItemConstructorOptions } from 'electron';
import trayIconPath from '../../resources/tray.png?asset';
import { log } from './log';
import { t } from './i18n';

export interface TrayActions {
  breakNow(): void;
  pause(minutes: number | 'tomorrow'): void;
  resume(): void;
  toggleWidget(): void;
  openDebug(): void;
  quit(): void;
  debug: boolean;
}

export interface TrayState {
  paused: boolean;
}

let tray: Tray | null = null;
let lastTooltip = '';
let lastPaused: boolean | null = null;

/** Меню трея SPEC 2.6. Пункты будущих дней пока логируют. */
export function buildMenu(actions: TrayActions, state: TrayState): Menu {
  const stub = (name: string) => () => log(`tray: «${name}» — пока заглушка`);
  const items: MenuItemConstructorOptions[] = [
    { label: t('tray.breakNow'), click: () => actions.breakNow() },
    { label: t('tray.water'), click: stub('water') },
    { label: t('tray.newTask'), click: stub('newTask') },
    state.paused
      ? { label: t('tray.resume'), click: () => actions.resume() }
      : {
          label: t('tray.pause'),
          submenu: [
            { label: t('tray.pause30'), click: () => actions.pause(30) },
            { label: t('tray.pause60'), click: () => actions.pause(60) },
            { label: t('tray.pauseTomorrow'), click: () => actions.pause('tomorrow') },
          ],
        },
    { label: t('tray.hardDay'), type: 'checkbox', checked: false, click: stub('hardDay') },
    { type: 'separator' },
    { label: t('tray.home'), click: stub('home') },
    { label: t('tray.settings'), click: stub('settings') },
    { label: t('tray.toggleWidget'), click: () => actions.toggleWidget() },
  ];
  if (actions.debug) items.push({ label: t('tray.debug'), click: () => actions.openDebug() });
  items.push({ type: 'separator' }, { label: t('tray.quit'), click: () => actions.quit() });
  return Menu.buildFromTemplate(items);
}

export function createTray(actions: TrayActions): Tray {
  const icon = nativeImage.createFromPath(trayIconPath);
  tray = new Tray(
    icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }),
  );
  tray.setToolTip(t('tray.tooltip'));
  updateTray(actions, { paused: false });
  tray.on('click', () => actions.toggleWidget());
  return tray;
}

/** Меню пересобираем только при смене состояния (пауза ↔ работа). */
export function updateTray(actions: TrayActions, state: TrayState): void {
  if (!tray || state.paused === lastPaused) return;
  lastPaused = state.paused;
  tray.setContextMenu(buildMenu(actions, state));
}

export function setTrayTooltip(text: string): void {
  if (!tray || text === lastTooltip) return;
  lastTooltip = text;
  tray.setToolTip(text);
}
