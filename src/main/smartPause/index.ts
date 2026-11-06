/**
 * Детекторы умной паузы (SPEC 3.3): опрос раз в 5 с → { reason, app } | null.
 * Каждый детектор: Detector { name; check(): Promise<результат | 'unknown'> }; выключается в настройках;
 * на не-Windows возвращает 'unknown'. Решение — чистая функция core/smartPause.decideSuppression.
 */
import { basename } from 'node:path';
import { classifyNotificationState } from '../../core/notificationState';
import {
  activeConsentApps,
  decideSuppression,
  findCaptureApp,
  type ConsentEntry,
  type DetectorReadings,
} from '../../core/smartPause';
import type { Settings, SuppressReason } from '../../core/types';
import { log } from '../log';
import { queryUserNotificationState } from './fullscreen';
import {
  foregroundProcess,
  readConsentStore,
  readConsentStoreViaReg,
  runningProcessPaths,
} from './win32';

export interface Detector<T> {
  name: string;
  check(): Promise<T | 'unknown'>;
}

export const POLL_MS = 5000;

export type Suppression = { reason: SuppressReason; app: string | null } | null;

async function consent(capability: 'microphone' | 'webcam'): Promise<ConsentEntry[] | 'unknown'> {
  const viaKoffi = await readConsentStore(capability);
  return viaKoffi === 'unknown' ? readConsentStoreViaReg(capability) : viaKoffi;
}

export class SmartPause {
  private timer: NodeJS.Timeout | null = null;
  private last: Suppression = null;
  private busy = false;
  readings: DetectorReadings = {
    mic: 'unknown',
    camera: 'unknown',
    fullscreen: 'unknown',
    foregroundExe: 'unknown',
    capture: 'unknown',
  };

  private readonly ownExePath = process.execPath;
  private readonly ownExeName = basename(process.execPath);

  constructor(
    private readonly getSettings: () => Settings,
    private readonly onChange: (s: Suppression) => void,
  ) {}

  private deviceDetector(capability: 'microphone' | 'webcam'): Detector<string[]> {
    return {
      name: capability,
      check: async () => {
        const entries = await consent(capability);
        if (entries === 'unknown') return 'unknown';
        const anyInUse = entries.some((e) => e.lastUsedStart > 0n && e.lastUsedStop === 0n);
        const procs = anyInUse ? await runningProcessPaths() : null;
        return activeConsentApps(entries, {
          ownExePath: this.ownExePath,
          ignoreApps: this.getSettings().smartPause.ignoreMicApps,
          isProcessAlive: procs ? (p) => procs.has(p.toLowerCase()) : null,
        });
      },
    };
  }

  private readonly fullscreen: Detector<'fullscreen' | 'game' | 'presentation' | null> = {
    name: 'fullscreen',
    check: async () => {
      const v = classifyNotificationState(await queryUserNotificationState());
      if (v.kind === 'unknown') return 'unknown';
      return v.kind === 'suppress' ? v.reason : null;
    },
  };

  private readonly foreground: Detector<string | null> = {
    name: 'foreground',
    check: async () => {
      const fg = await foregroundProcess();
      if (fg === 'unknown') return 'unknown';
      if (fg.pid === process.pid) return this.ownExeName; // наше окно (оверлей/виджет)
      return fg.path ? basename(fg.path) : null;
    },
  };

  /** Запись экрана (SPEC 3.3.4, P1): OBS, ShareX, Bandicam, Camtasia среди запущенных процессов. */
  private readonly capture: Detector<string | null> = {
    name: 'capture',
    check: async () => {
      const procs = await runningProcessPaths();
      return procs === null ? 'unknown' : findCaptureApp(procs);
    },
  };

  start(): void {
    if (this.timer) return;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), POLL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async poll(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const sp = this.getSettings().smartPause;
      const [mic, camera, fullscreen, foregroundExe, capture] = await Promise.all([
        sp.mic ? this.deviceDetector('microphone').check() : Promise.resolve([] as string[]),
        sp.camera ? this.deviceDetector('webcam').check() : Promise.resolve([] as string[]),
        sp.fullscreen ? this.fullscreen.check() : Promise.resolve(null),
        this.foreground.check(),
        sp.capture ? this.capture.check() : Promise.resolve(null),
      ]);
      this.readings = { mic, camera, fullscreen, foregroundExe, capture };
      const next = decideSuppression(this.readings, sp, this.ownExeName);
      if (next?.reason !== this.last?.reason || next?.app !== this.last?.app) {
        log(`умная пауза: ${next ? `${next.reason}${next.app ? ` (${next.app})` : ''}` : 'нет'}`);
        this.last = next;
        this.onChange(next);
      }
    } catch (e) {
      log(`умная пауза: ошибка опроса: ${(e as Error).message}`);
    } finally {
      this.busy = false;
    }
  }
}
