import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  activeConsentApps,
  appNameFromKey,
  decideSuppression,
  exePathFromKey,
  isInUse,
  parseRegQuery,
  type ConsentFilter,
  type DetectorReadings,
} from './smartPause';

const ROOT =
  'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone';
const fx = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf8');
const OWN = 'C:\\Users\\Иван\\AppData\\Local\\Programs\\Squish\\Squish.exe';
const filter = (p: Partial<ConsentFilter> = {}): ConsentFilter => ({
  ownExePath: OWN,
  ignoreApps: [],
  isProcessAlive: null,
  ...p,
});

describe('parseRegQuery (фикстуры формата reg.exe)', () => {
  it('пусто: только Value=Allow, записей нет', () => {
    expect(parseRegQuery(fx('reg-empty.txt'), ROOT)).toEqual([]);
  });
  it('приложение из Store: две записи, одна активна', () => {
    const e = parseRegQuery(fx('reg-store-app.txt'), ROOT);
    expect(e.map((x) => x.key)).toEqual([
      'Microsoft.WindowsSoundRecorder_8wekyb3d8bbwe',
      'MSTeams_8wekyb3d8bbwe',
    ]);
    expect(e.map(isInUse)).toEqual([false, true]);
    expect(activeConsentApps(e, filter())).toEqual(['MSTeams']);
  });
  it('NonPackaged: кириллица в пути, наш exe исключён, остальные не активны', () => {
    const e = parseRegQuery(fx('reg-nonpackaged.txt'), ROOT);
    expect(e).toHaveLength(3);
    expect(e[1]!.key).toContain('Иван');
    expect(activeConsentApps(e, filter())).toEqual([]);
  });
  it('активное использование: Telegram и Discord держат микрофон', () => {
    const e = parseRegQuery(fx('reg-active.txt'), ROOT);
    expect(activeConsentApps(e, filter())).toEqual(['Telegram.exe', 'Discord.exe']);
  });
  it('CRLF-переводы строк (как у настоящего reg.exe)', () => {
    const e = parseRegQuery(fx('reg-active.txt').replace(/\n/g, '\r\n'), ROOT);
    expect(activeConsentApps(e, filter())).toEqual(['Telegram.exe', 'Discord.exe']);
  });
  it('мусор и чужие ключи не ломают разбор', () => {
    expect(
      parseRegQuery(
        'ERROR: The system was unable to find the specified registry key or value.',
        ROOT,
      ),
    ).toEqual([]);
    expect(
      parseRegQuery('HKEY_LOCAL_MACHINE\\Other\n    LastUsedTimeStart    REG_QWORD    0x1\n', ROOT),
    ).toEqual([]);
  });
});

describe('activeConsentApps: фильтры', () => {
  const active = parseRegQuery(fx('reg-active.txt'), ROOT);
  it('«не считать созвоном» без учёта регистра', () => {
    expect(activeConsentApps(active, filter({ ignoreApps: ['discord.EXE'] }))).toEqual([
      'Telegram.exe',
    ]);
  });
  it('залипание: процесс упал — запись не считается (R0)', () => {
    const alive = (p: string) => p.endsWith('Discord.exe');
    expect(activeConsentApps(active, filter({ isProcessAlive: alive }))).toEqual(['Discord.exe']);
  });
  it('пакеты Store нельзя проверить на живость — считаются', () => {
    const e = parseRegQuery(fx('reg-store-app.txt'), ROOT);
    expect(activeConsentApps(e, filter({ isProcessAlive: () => false }))).toEqual(['MSTeams']);
  });
});

describe('имена из ключей', () => {
  it('exePathFromKey', () => {
    expect(exePathFromKey('NonPackaged\\C:#Program Files#Zoom#bin#Zoom.exe')).toBe(
      'C:\\Program Files\\Zoom\\bin\\Zoom.exe',
    );
    expect(exePathFromKey('MSTeams_8wekyb3d8bbwe')).toBeNull();
  });
  it('appNameFromKey', () => {
    expect(appNameFromKey('NonPackaged\\C:#a#Telegram.exe')).toBe('Telegram.exe');
    expect(appNameFromKey('Microsoft.WindowsSoundRecorder_8wekyb3d8bbwe')).toBe(
      'Microsoft.WindowsSoundRecorder',
    );
  });
});

describe('decideSuppression', () => {
  const base: DetectorReadings = {
    mic: [],
    camera: [],
    fullscreen: null,
    foregroundExe: 'code.exe',
  };
  const s = { fullscreen: true, mic: true, camera: true, exceptionApps: [] as string[] };
  it('ничего не происходит → null', () => {
    expect(decideSuppression(base, s, 'Squish.exe')).toBeNull();
  });
  it('созвон важнее фуллскрина', () => {
    expect(
      decideSuppression({ ...base, mic: ['Zoom.exe'], fullscreen: 'fullscreen' }, s, null),
    ).toEqual({
      reason: 'mic',
      app: 'Zoom.exe',
    });
  });
  it('камера без микрофона', () => {
    expect(decideSuppression({ ...base, camera: ['obs64.exe'] }, s, null)?.reason).toBe('camera');
  });
  it('фуллскрин с приложением переднего плана', () => {
    expect(
      decideSuppression({ ...base, fullscreen: 'game', foregroundExe: 'eldenring.exe' }, s, null),
    ).toEqual({
      reason: 'game',
      app: 'eldenring.exe',
    });
  });
  it('наш собственный оверлей на переднем плане — не фуллскрин (R0)', () => {
    expect(
      decideSuppression(
        { ...base, fullscreen: 'fullscreen', foregroundExe: 'squish.EXE' },
        s,
        'Squish.exe',
      ),
    ).toBeNull();
  });
  it('детектор выключен в настройках', () => {
    expect(
      decideSuppression({ ...base, mic: ['Zoom.exe'] }, { ...s, mic: false }, null),
    ).toBeNull();
  });
  it('unknown не подавляет', () => {
    expect(
      decideSuppression(
        { mic: 'unknown', camera: 'unknown', fullscreen: 'unknown', foregroundExe: 'unknown' },
        s,
        null,
      ),
    ).toBeNull();
  });
  it('приложение-исключение на переднем плане', () => {
    expect(decideSuppression(base, { ...s, exceptionApps: ['Code.exe'] }, null)).toEqual({
      reason: 'app',
      app: 'code.exe',
    });
  });
});

describe('запись экрана (SPEC 3.3.4, P1)', () => {
  it('находит OBS/ShareX среди процессов, без учёта регистра и пути', async () => {
    const { findCaptureApp } = await import('./smartPause');
    expect(
      findCaptureApp([
        'c:\\windows\\explorer.exe',
        'c:\\program files\\obs-studio\\bin\\64bit\\obs64.exe',
      ]),
    ).toBe('obs64.exe');
    expect(findCaptureApp(['C:\\Tools\\sharex.EXE'])).toBe('ShareX.exe');
    expect(findCaptureApp(['c:\\x\\code.exe'])).toBeNull();
  });
  it('подавляет с причиной capture; выключатель в настройках', async () => {
    const { decideSuppression } = await import('./smartPause');
    const r = {
      mic: [],
      camera: [],
      fullscreen: null,
      foregroundExe: 'code.exe',
      capture: 'obs64.exe',
    } as const;
    const s = { fullscreen: true, mic: true, camera: true, exceptionApps: [] };
    expect(decideSuppression({ ...r, mic: [...r.mic], camera: [...r.camera] }, s, null)).toEqual({
      reason: 'capture',
      app: 'obs64.exe',
    });
    expect(
      decideSuppression({ ...r, mic: [], camera: [] }, { ...s, capture: false }, null),
    ).toBeNull();
  });
});

describe('запись экрана: детектор «не знаю»', () => {
  it("capture: 'unknown' (не Windows) — не подавлять", async () => {
    const { decideSuppression } = await import('./smartPause');
    const r = {
      mic: [],
      camera: [],
      fullscreen: null,
      foregroundExe: null,
      capture: 'unknown' as const,
    };
    expect(
      decideSuppression(r, { fullscreen: true, mic: true, camera: true, exceptionApps: [] }, null),
    ).toBeNull();
  });
});
