import { globalShortcut } from 'electron';
import type { Settings } from '../core/types';
import { log } from './log';

/**
 * Глобальные хоткеи (SPEC 7.5). Занято другой программой → не падаем, имя попадает в список
 * «не удалось» (виден в снапшоте; в настройках — День 6). Accelerator — формат Electron («Ctrl+Alt+T»).
 * Внимание (R0): на польской/немецкой раскладке Ctrl+Alt = AltGr — поэтому хоткеи переназначаемые.
 */
export type HotkeyName = keyof Settings['hotkeys'];

export type HotkeyHandlers = Record<HotkeyName, () => void>;

let registered: string[] = [];

export function registerHotkeys(keys: Settings['hotkeys'], handlers: HotkeyHandlers): HotkeyName[] {
  unregisterHotkeys();
  const failed: HotkeyName[] = [];
  for (const name of Object.keys(keys) as HotkeyName[]) {
    const accel = keys[name];
    if (!accel) continue;
    let ok = false;
    try {
      ok = globalShortcut.register(accel, handlers[name]);
    } catch (e) {
      log(`хоткей ${name} «${accel}» некорректен: ${(e as Error).message}`);
    }
    if (ok) registered.push(accel);
    else {
      failed.push(name);
      log(`хоткей ${name} «${accel}» занят другой программой`);
    }
  }
  return failed;
}

export function unregisterHotkeys(): void {
  for (const a of registered) if (globalShortcut.isRegistered(a)) globalShortcut.unregister(a);
  registered = [];
}
