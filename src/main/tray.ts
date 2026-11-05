import { Menu, nativeImage, Tray, type MenuItemConstructorOptions } from 'electron';
import trayIconPath from '../../resources/tray.png?asset';
import { log } from './log';
import { t } from './i18n';

export interface TrayActions {
  toggleWidget(): void;
  openDebug(): void;
  quit(): void;
  debug: boolean;
}

let tray: Tray | null = null;

/** Меню трея SPEC 2.6. На День 1 большинство пунктов только логируют. */
export function buildMenu(actions: TrayActions): Menu {
  const stub = (name: string) => () => log(`tray: «${name}» — пока заглушка`);
  const items: MenuItemConstructorOptions[] = [
    { label: t('tray.breakNow'), click: stub('breakNow') },
    { label: t('tray.water'), click: stub('water') },
    { label: t('tray.newTask'), click: stub('newTask') },
    {
      label: t('tray.pause'),
      submenu: [
        { label: t('tray.pause30'), click: stub('pause30') },
        { label: t('tray.pause60'), click: stub('pause60') },
        { label: t('tray.pauseTomorrow'), click: stub('pauseTomorrow') },
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
  tray.setContextMenu(buildMenu(actions));
  tray.on('click', () => actions.toggleWidget());
  return tray;
}

export function setTrayTooltip(text: string): void {
  tray?.setToolTip(text);
}
