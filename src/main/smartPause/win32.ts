/**
 * Тонкие обёртки над WinAPI через koffi (SPEC 3.3, R0: реестр через advapi32, без reg.exe).
 * Любая ошибка → 'unknown' + один лог, приложение работает дальше (CLAUDE.md п.6).
 * Проверяется на Windows в CI (scripts/smoke.mjs сверяет koffi-реестр с выводом reg.exe).
 */
import { execFile } from 'node:child_process';
import type { ConsentEntry } from '../../core/smartPause';
import { parseRegQuery } from '../../core/smartPause';
import { logOnce } from '../log';
import { loadKoffi } from './fullscreen';

type Fn = (...args: unknown[]) => unknown;
interface Api {
  RegOpenKeyExW: Fn;
  RegEnumKeyExW: Fn;
  RegQueryValueExW: Fn;
  RegCloseKey: Fn;
  GetForegroundWindow: Fn;
  GetWindowThreadProcessId: Fn;
  OpenProcess: Fn;
  QueryFullProcessImageNameW: Fn;
  CloseHandle: Fn;
  K32EnumProcesses: Fn;
}

/** HKEY_CURRENT_USER = (HKEY)(LONG)0x80000001 — на x64 знаковое расширение. */
const HKCU = 0xffffffff80000001n;
const KEY_READ = 0x20019;
const ERROR_SUCCESS = 0;
const ERROR_FILE_NOT_FOUND = 2;
const ERROR_NO_MORE_ITEMS = 259;
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const CONSENT_ROOT =
  'Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore';

let api: Api | null | undefined;

async function getApi(): Promise<Api | null> {
  if (api !== undefined) return api;
  if (process.platform !== 'win32') return (api = null);
  try {
    const koffi = await loadKoffi();
    if (!koffi) return (api = null);
    const advapi32 = koffi.load('advapi32.dll');
    const user32 = koffi.load('user32.dll');
    const kernel32 = koffi.load('kernel32.dll');
    const f = (lib: typeof advapi32, sig: string) => lib.func(sig) as unknown as Fn;
    api = {
      RegOpenKeyExW: f(
        advapi32,
        'long __stdcall RegOpenKeyExW(void *hKey, const char16_t *lpSubKey, uint32_t ulOptions, uint32_t samDesired, _Out_ void **phkResult)',
      ),
      RegEnumKeyExW: f(
        advapi32,
        'long __stdcall RegEnumKeyExW(void *hKey, uint32_t dwIndex, _Out_ uint8_t *lpName, _Inout_ uint32_t *lpcchName, void *lpReserved, void *lpClass, void *lpcchClass, void *lpftLastWriteTime)',
      ),
      RegQueryValueExW: f(
        advapi32,
        'long __stdcall RegQueryValueExW(void *hKey, const char16_t *lpValueName, void *lpReserved, _Out_ uint32_t *lpType, _Out_ uint8_t *lpData, _Inout_ uint32_t *lpcbData)',
      ),
      RegCloseKey: f(advapi32, 'long __stdcall RegCloseKey(void *hKey)'),
      GetForegroundWindow: f(user32, 'void * __stdcall GetForegroundWindow()'),
      GetWindowThreadProcessId: f(
        user32,
        'uint32_t __stdcall GetWindowThreadProcessId(void *hWnd, _Out_ uint32_t *lpdwProcessId)',
      ),
      OpenProcess: f(
        kernel32,
        'void * __stdcall OpenProcess(uint32_t dwDesiredAccess, bool bInheritHandle, uint32_t dwProcessId)',
      ),
      QueryFullProcessImageNameW: f(
        kernel32,
        'bool __stdcall QueryFullProcessImageNameW(void *hProcess, uint32_t dwFlags, _Out_ uint8_t *lpExeName, _Inout_ uint32_t *lpdwSize)',
      ),
      CloseHandle: f(kernel32, 'bool __stdcall CloseHandle(void *hObject)'),
      K32EnumProcesses: f(
        kernel32,
        'bool __stdcall K32EnumProcesses(_Out_ uint8_t *lpidProcess, uint32_t cb, _Out_ uint32_t *lpcbNeeded)',
      ),
    };
    return api;
  } catch (e) {
    logOnce('win32-api', `win32: не удалось привязать WinAPI: ${(e as Error).message}`);
    return (api = null);
  }
}

// ───────────── Реестр ─────────────
function openKey(a: Api, parent: unknown, sub: string): unknown | null {
  const out: unknown[] = [null];
  const rc = a.RegOpenKeyExW(parent, sub, 0, KEY_READ, out) as number;
  if (rc === ERROR_FILE_NOT_FOUND) return null;
  if (rc !== ERROR_SUCCESS) throw new Error(`RegOpenKeyExW(${sub}) = ${rc}`);
  return out[0] ?? null;
}

function enumSubkeys(a: Api, key: unknown): string[] {
  const names: string[] = [];
  const buf = Buffer.alloc(512 * 2);
  for (let i = 0; ; i++) {
    const len = [512];
    const rc = a.RegEnumKeyExW(key, i, buf, len, null, null, null, null) as number;
    if (rc === ERROR_NO_MORE_ITEMS) break;
    if (rc !== ERROR_SUCCESS) throw new Error(`RegEnumKeyExW = ${rc}`);
    names.push(buf.toString('utf16le', 0, (len[0] ?? 0) * 2));
  }
  return names;
}

function readQword(a: Api, key: unknown, name: string): bigint {
  const type = [0];
  const data = Buffer.alloc(8);
  const size = [8];
  const rc = a.RegQueryValueExW(key, name, null, type, data, size) as number;
  if (rc !== ERROR_SUCCESS) return 0n;
  return data.readBigUInt64LE(0);
}

function readEntry(a: Api, parent: unknown, sub: string, rel: string): ConsentEntry | null {
  const k = openKey(a, parent, sub);
  if (!k) return null;
  try {
    const start = readQword(a, k, 'LastUsedTimeStart');
    const stop = readQword(a, k, 'LastUsedTimeStop');
    return start > 0n || stop > 0n ? { key: rel, lastUsedStart: start, lastUsedStop: stop } : null;
  } finally {
    a.RegCloseKey(k);
  }
}

/** Записи ConsentStore\<capability> (включая NonPackaged) через advapi32. */
export async function readConsentStore(
  capability: 'microphone' | 'webcam',
): Promise<ConsentEntry[] | 'unknown'> {
  const a = await getApi();
  if (!a) return 'unknown';
  try {
    const root = openKey(a, HKCU, `${CONSENT_ROOT}\\${capability}`);
    if (!root) return []; // доступ к устройству не настраивался — никто не держит
    const out: ConsentEntry[] = [];
    try {
      for (const name of enumSubkeys(a, root)) {
        if (name.toLowerCase() === 'nonpackaged') {
          const np = openKey(a, root, name);
          if (!np) continue;
          try {
            for (const exe of enumSubkeys(a, np)) {
              const e = readEntry(a, np, exe, `NonPackaged\\${exe}`);
              if (e) out.push(e);
            }
          } finally {
            a.RegCloseKey(np);
          }
        } else {
          const e = readEntry(a, root, name, name);
          if (e) out.push(e);
        }
      }
    } finally {
      a.RegCloseKey(root);
    }
    return out;
  } catch (e) {
    logOnce(
      `consent-${capability}`,
      `ConsentStore\\${capability} через koffi: ${(e as Error).message}`,
    );
    return 'unknown';
  }
}

/** Запасной путь (R0): reg.exe, вывод в OEM-кодировке (cp866 для русской Windows). */
export function readConsentStoreViaReg(
  capability: 'microphone' | 'webcam',
): Promise<ConsentEntry[] | 'unknown'> {
  if (process.platform !== 'win32') return Promise.resolve('unknown');
  const root = `HKEY_CURRENT_USER\\${CONSENT_ROOT}\\${capability}`;
  return new Promise((resolve) => {
    execFile(
      'reg',
      ['query', root, '/s'],
      { windowsHide: true, encoding: 'buffer', timeout: 4000 },
      (err, stdout) => {
        if (err && !stdout?.length) {
          // Ключа нет — reg.exe возвращает код 1. Это не ошибка детектора.
          resolve((err as unknown as { code?: unknown }).code === 1 ? [] : 'unknown');
          return;
        }
        let text: string;
        try {
          text = new TextDecoder('ibm866').decode(stdout);
        } catch {
          text = stdout.toString('latin1');
        }
        resolve(parseRegQuery(text, root));
      },
    );
  });
}

// ───────────── Процессы и окно переднего плана ─────────────
function imagePath(a: Api, pid: number): string | null {
  const h = a.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
  if (!h) return null;
  try {
    const buf = Buffer.alloc(1024 * 2);
    const size = [1024];
    if (!a.QueryFullProcessImageNameW(h, 0, buf, size)) return null;
    return buf.toString('utf16le', 0, (size[0] ?? 0) * 2);
  } finally {
    a.CloseHandle(h);
  }
}

/** Окно переднего плана: pid и полный путь exe (SPEC 3.3.5). */
export async function foregroundProcess(): Promise<
  { pid: number; path: string | null } | 'unknown'
> {
  const a = await getApi();
  if (!a) return 'unknown';
  try {
    const hwnd = a.GetForegroundWindow();
    if (!hwnd) return { pid: 0, path: null };
    const pid = [0];
    a.GetWindowThreadProcessId(hwnd, pid);
    const p = pid[0] ?? 0;
    return { pid: p, path: p ? imagePath(a, p) : null };
  } catch (e) {
    logOnce('foreground', `foregroundProcess: ${(e as Error).message}`);
    return 'unknown';
  }
}

let procCache: { at: number; paths: Set<string> } | null = null;

/** Пути exe всех запущенных процессов (нижний регистр), кэш 5 с. null — не удалось. */
export async function runningProcessPaths(): Promise<Set<string> | null> {
  if (procCache && Date.now() - procCache.at < 5000) return procCache.paths;
  const a = await getApi();
  if (!a) return null;
  try {
    const buf = Buffer.alloc(4096 * 4);
    const needed = [0];
    if (!a.K32EnumProcesses(buf, buf.length, needed)) return null;
    const paths = new Set<string>();
    for (let i = 0; i < (needed[0] ?? 0) / 4; i++) {
      const pid = buf.readUInt32LE(i * 4);
      if (!pid) continue;
      const p = imagePath(a, pid);
      if (p) paths.add(p.toLowerCase());
    }
    procCache = { at: Date.now(), paths };
    return paths;
  } catch (e) {
    logOnce('enum-processes', `K32EnumProcesses: ${(e as Error).message}`);
    return null;
  }
}
