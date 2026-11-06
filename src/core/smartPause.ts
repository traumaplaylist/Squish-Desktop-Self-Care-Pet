/**
 * Умная пауза (SPEC 3.3, R0) — чистая логика. Чтение реестра и WinAPI живут в main/smartPause.
 */
import type { SuppressReason } from './types';

// ───────────── ConsentStore (микрофон / камера) ─────────────
/** Одна запись ConsentStore: подключ приложения и метки FILETIME (0 — нет). */
export interface ConsentEntry {
  /** Путь подключа относительно ConsentStore\<microphone|webcam>, например «NonPackaged\C:#…#Telegram.exe». */
  key: string;
  lastUsedStart: bigint;
  lastUsedStop: bigint;
}

/** Приложение держит устройство прямо сейчас: Start > 0 и Stop == 0. */
export function isInUse(e: ConsentEntry): boolean {
  return e.lastUsedStart > 0n && e.lastUsedStop === 0n;
}

/** Для NonPackaged — полный путь к exe («C:#Program Files#x.exe» → «C:\Program Files\x.exe»). */
export function exePathFromKey(key: string): string | null {
  const m = /(?:^|\\)NonPackaged\\(.+)$/i.exec(key);
  return m ? m[1]!.replace(/#/g, '\\') : null;
}

/** Человекочитаемое имя: «Telegram.exe» или имя пакета Store без суффикса издателя («MSTeams»). */
export function appNameFromKey(key: string): string {
  const exe = exePathFromKey(key);
  if (exe) return exe.split('\\').pop() ?? exe;
  const last = key.split('\\').pop() ?? key;
  return last.replace(/_[a-z0-9]{13}$/i, '');
}

const norm = (s: string) => s.trim().toLowerCase();

export interface ConsentFilter {
  /** Полный путь нашего exe — себя не считаем. */
  ownExePath: string | null;
  /** Настройка «не считать созвоном» (basename exe или имя пакета, без учёта регистра). */
  ignoreApps: readonly string[];
  /** Проверка, что процесс NonPackaged-exe жив (защита от залипания, R0). null — проверить нельзя. */
  isProcessAlive: ((exePath: string) => boolean) | null;
}

/** Кто сейчас держит устройство (имена приложений). Залипшие и игнорируемые записи отброшены. */
export function activeConsentApps(entries: readonly ConsentEntry[], f: ConsentFilter): string[] {
  const ignore = new Set(f.ignoreApps.map(norm));
  const out: string[] = [];
  for (const e of entries) {
    if (!isInUse(e)) continue;
    const exe = exePathFromKey(e.key);
    if (exe && f.ownExePath && norm(exe) === norm(f.ownExePath)) continue;
    const name = appNameFromKey(e.key);
    if (ignore.has(norm(name))) continue;
    if (exe && f.isProcessAlive && !f.isProcessAlive(exe)) continue; // упал с открытым микрофоном
    out.push(name);
  }
  return out;
}

// ───────────── Запасной путь: разбор вывода `reg query … /s` ─────────────
/**
 * Формат reg.exe:
 *   HKEY_CURRENT_USER\…\ConsentStore\microphone\NonPackaged\C:#…#app.exe
 *       LastUsedTimeStart    REG_QWORD    0x1db…
 *       LastUsedTimeStop    REG_QWORD    0x0
 * Имена значений и типы не локализуются. Заголовки ключей — полные пути.
 */
export function parseRegQuery(output: string, rootKey: string): ConsentEntry[] {
  const rootNorm = norm(rootKey);
  const entries: ConsentEntry[] = [];
  let current: ConsentEntry | null = null;
  const flush = () => {
    if (current && (current.lastUsedStart > 0n || current.lastUsedStop > 0n)) entries.push(current);
    current = null;
  };
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line) continue;
    if (/^HKEY_/i.test(line)) {
      flush();
      const idx = norm(line).indexOf(rootNorm);
      if (idx < 0) continue;
      const rel = line.slice(idx + rootKey.length).replace(/^\\/, '');
      if (rel) current = { key: rel, lastUsedStart: 0n, lastUsedStop: 0n };
      continue;
    }
    if (!current) continue;
    const m = /^\s+(LastUsedTimeStart|LastUsedTimeStop)\s+REG_QWORD\s+(0x[0-9a-f]+)$/i.exec(line);
    if (!m) continue;
    const v = BigInt(m[2]!);
    if (m[1]!.toLowerCase() === 'lastusedtimestart') current.lastUsedStart = v;
    else current.lastUsedStop = v;
  }
  flush();
  return entries;
}

// ───────────── Итог по всем детекторам ─────────────
export interface DetectorReadings {
  /** Приложения, держащие микрофон / камеру; 'unknown' — детектор не смог прочитать. */
  mic: string[] | 'unknown';
  camera: string[] | 'unknown';
  /** Результат SHQueryUserNotificationState (уже классифицированный) или null. */
  fullscreen: Extract<SuppressReason, 'fullscreen' | 'game' | 'presentation'> | null | 'unknown';
  /** basename exe окна на переднем плане. */
  foregroundExe: string | null | 'unknown';
  /** Запущенная программа записи экрана (SPEC 3.3.4, P1), basename или null. Поле необязательно. */
  capture?: string | null | 'unknown';
}

/** Программы записи/трансляции экрана (SPEC 3.3.4). Сравнение — basename без учёта регистра. */
export const CAPTURE_APPS = [
  'obs64.exe',
  'obs32.exe',
  'obs.exe',
  'ShareX.exe',
  'Bandicam.exe',
  'bdcam.exe',
  'CamtasiaRecorder.exe',
] as const;

/** Первая найденная программа записи среди запущенных процессов (полные пути или имена). */
export function findCaptureApp(processes: Iterable<string>): string | null {
  const want = new Map(CAPTURE_APPS.map((a) => [norm(a), a] as const));
  for (const p of processes) {
    const base = norm(p.split(/[\\/]/).pop() ?? p);
    const hit = want.get(base);
    if (hit) return hit;
  }
  return null;
}

export interface SmartPauseSettings {
  fullscreen: boolean;
  mic: boolean;
  camera: boolean;
  /** Запись экрана (P1); по умолчанию включено. */
  capture?: boolean;
  exceptionApps: readonly string[];
}

/**
 * Приоритет причин: созвон (микрофон, камера) → полный экран → запись экрана → приложение-исключение.
 * Наш собственный exe на переднем плане никогда не считается фуллскрином (R0).
 */
export function decideSuppression(
  r: DetectorReadings,
  s: SmartPauseSettings,
  ownExeName: string | null,
): { reason: SuppressReason; app: string | null } | null {
  if (s.mic && Array.isArray(r.mic) && r.mic.length) return { reason: 'mic', app: r.mic[0]! };
  if (s.camera && Array.isArray(r.camera) && r.camera.length)
    return { reason: 'camera', app: r.camera[0]! };
  const fg = typeof r.foregroundExe === 'string' ? r.foregroundExe : null;
  const ownFg = !!fg && !!ownExeName && norm(fg) === norm(ownExeName);
  if (s.fullscreen && r.fullscreen && r.fullscreen !== 'unknown' && !ownFg) {
    return { reason: r.fullscreen, app: fg };
  }
  if (s.capture !== false && typeof r.capture === 'string' && r.capture && r.capture !== 'unknown')
    return { reason: 'capture', app: r.capture };
  if (fg && s.exceptionApps.some((a) => norm(a) === norm(fg))) return { reason: 'app', app: fg };
  return null;
}
