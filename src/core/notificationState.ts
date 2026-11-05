import type { SuppressReason } from './types';

/**
 * Классификация результата SHQueryUserNotificationState (SPEC 3.3, R0).
 * 1 QUNS_NOT_PRESENT  — блокировка/скринсейвер → idle
 * 2 QUNS_BUSY         — полноэкранное приложение → fullscreen
 * 3 QUNS_RUNNING_D3D_FULL_SCREEN → game
 * 4 QUNS_PRESENTATION_MODE       → presentation
 * 5 QUNS_ACCEPTS_NOTIFICATIONS   → ничего
 * 6 QUNS_QUIET_TIME   — «тихий час» после первого входа, не Focus Assist → ничего
 * 7 QUNS_APP          — полноэкранное Store-приложение → fullscreen
 */
export type NotificationVerdict =
  | { kind: 'suppress'; reason: Extract<SuppressReason, 'fullscreen' | 'game' | 'presentation'> }
  | { kind: 'idle' }
  | { kind: 'none' }
  | { kind: 'unknown' };

export function classifyNotificationState(code: number | 'unknown'): NotificationVerdict {
  switch (code) {
    case 1:
      return { kind: 'idle' };
    case 2:
    case 7:
      return { kind: 'suppress', reason: 'fullscreen' };
    case 3:
      return { kind: 'suppress', reason: 'game' };
    case 4:
      return { kind: 'suppress', reason: 'presentation' };
    case 5:
    case 6:
      return { kind: 'none' };
    default:
      return { kind: 'unknown' };
  }
}
