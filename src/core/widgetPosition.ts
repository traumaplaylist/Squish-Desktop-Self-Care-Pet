import type { DisplayInfo, Rect, WidgetPosition } from './types';

export const WIDGET_MARGIN = 16;

/** Правый нижний угол workArea основного монитора (над панелью задач). */
export function defaultWidgetRect(displays: DisplayInfo[], size: { width: number; height: number }): Rect {
  const primary = displays.find((d) => d.primary) ?? displays[0];
  if (!primary) return { x: 0, y: 0, ...size };
  const wa = primary.workArea;
  return {
    x: wa.x + wa.width - size.width - WIDGET_MARGIN,
    y: wa.y + wa.height - size.height - WIDGET_MARGIN,
    ...size,
  };
}

function visibleArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Где показать виджет. Сохранённая позиция относительна workArea своего монитора (R0).
 * Если монитора больше нет или видно меньше половины окна — угол по умолчанию.
 */
export function resolveWidgetRect(
  saved: WidgetPosition | null,
  displays: DisplayInfo[],
  size: { width: number; height: number },
): Rect {
  if (!saved) return defaultWidgetRect(displays, size);
  const display = displays.find((d) => d.id === saved.displayId);
  if (!display) return defaultWidgetRect(displays, size);
  const rect: Rect = {
    x: display.workArea.x + saved.x,
    y: display.workArea.y + saved.y,
    ...size,
  };
  const visible = displays.reduce((sum, d) => sum + visibleArea(rect, d.workArea), 0);
  if (visible < (size.width * size.height) / 2) return defaultWidgetRect(displays, size);
  return rect;
}

/** Абсолютный прямоугольник → позиция относительно монитора, где центр окна. */
export function toWidgetPosition(rect: Rect, displays: DisplayInfo[]): WidgetPosition | null {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const display =
    displays.find(
      (d) =>
        cx >= d.workArea.x &&
        cx < d.workArea.x + d.workArea.width &&
        cy >= d.workArea.y &&
        cy < d.workArea.y + d.workArea.height,
    ) ??
    [...displays].sort((a, b) => visibleArea(rect, b.workArea) - visibleArea(rect, a.workArea))[0];
  if (!display) return null;
  return { displayId: display.id, x: rect.x - display.workArea.x, y: rect.y - display.workArea.y };
}
