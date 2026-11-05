import { logOnce } from '../log';

/**
 * Обёртка над SHQueryUserNotificationState (shell32.dll) через koffi (SPEC 3.3.1).
 * Любая проблема → 'unknown' и один лог; приложение работает дальше (CLAUDE.md п.6).
 * Классификация кода — чистая функция core/notificationState.ts.
 */

type KoffiModule = typeof import('koffi');
type QueryFn = (out: number[]) => number;

let koffiPromise: Promise<KoffiModule | null> | null = null;
let koffiError: string | null = null;
let queryFn: QueryFn | null | undefined;

export function loadKoffi(): Promise<KoffiModule | null> {
  if (!koffiPromise) {
    koffiPromise = import('koffi')
      .then((m) => ((m as unknown as { default?: KoffiModule }).default ?? m) as KoffiModule)
      .catch((e: unknown) => {
        koffiError = e instanceof Error ? e.message : String(e);
        logOnce('koffi-load', `koffi не загрузился: ${koffiError}`);
        return null;
      });
  }
  return koffiPromise;
}

export function getKoffiError(): string | null {
  return koffiError;
}

export async function queryUserNotificationState(): Promise<number | 'unknown'> {
  if (process.platform !== 'win32') return 'unknown';
  if (queryFn === null) return 'unknown';
  try {
    if (queryFn === undefined) {
      const koffi = await loadKoffi();
      if (!koffi) {
        queryFn = null;
        return 'unknown';
      }
      const shell32 = koffi.load('shell32.dll');
      queryFn = shell32.func(
        'long __stdcall SHQueryUserNotificationState(_Out_ int *pquns)',
      ) as unknown as QueryFn;
    }
    const out = [0];
    const hr = queryFn(out);
    if (hr !== 0) {
      logOnce('quns-hr', `SHQueryUserNotificationState вернул HRESULT ${hr}`);
      return 'unknown';
    }
    return out[0] ?? 'unknown';
  } catch (e) {
    queryFn = null;
    logOnce(
      'quns-error',
      `SHQueryUserNotificationState: ${e instanceof Error ? e.message : String(e)}`,
    );
    return 'unknown';
  }
}
