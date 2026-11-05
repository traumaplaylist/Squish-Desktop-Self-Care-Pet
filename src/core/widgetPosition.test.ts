import { describe, expect, it } from 'vitest';
import type { DisplayInfo } from './types';
import { defaultWidgetRect, resolveWidgetRect, toWidgetPosition, WIDGET_MARGIN } from './widgetPosition';

const size = { width: 220, height: 260 };
const primary: DisplayInfo = { id: 1, primary: true, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
const right: DisplayInfo = { id: 2, primary: false, workArea: { x: 1920, y: 0, width: 2560, height: 1400 } };

describe('widgetPosition', () => {
  it('по умолчанию — правый нижний угол основного монитора с отступом', () => {
    expect(defaultWidgetRect([right, primary], size)).toEqual({
      x: 1920 - 220 - WIDGET_MARGIN,
      y: 1040 - 260 - WIDGET_MARGIN,
      ...size,
    });
  });
  it('без сохранённой позиции → угол', () => {
    expect(resolveWidgetRect(null, [primary], size)).toEqual(defaultWidgetRect([primary], size));
  });
  it('сохранённая позиция на втором мониторе восстанавливается', () => {
    const r = resolveWidgetRect({ displayId: 2, x: 100, y: 200 }, [primary, right], size);
    expect(r).toEqual({ x: 2020, y: 200, ...size });
  });
  it('монитор отключили → угол основного', () => {
    const r = resolveWidgetRect({ displayId: 2, x: 100, y: 200 }, [primary], size);
    expect(r).toEqual(defaultWidgetRect([primary], size));
  });
  it('позиция почти за краем (видно < половины) → угол', () => {
    const r = resolveWidgetRect({ displayId: 1, x: 1850, y: 100 }, [primary], size);
    expect(r).toEqual(defaultWidgetRect([primary], size));
  });
  it('позиция на стыке двух мониторов, видно целиком суммарно → остаётся', () => {
    const r = resolveWidgetRect({ displayId: 1, x: 1850, y: 100 }, [primary, right], size);
    expect(r.x).toBe(1850);
  });
  it('монитор слева с отрицательными координатами', () => {
    const left: DisplayInfo = { id: 3, primary: false, workArea: { x: -1280, y: 0, width: 1280, height: 984 } };
    const r = resolveWidgetRect({ displayId: 3, x: 10, y: 10 }, [primary, left], size);
    expect(r).toEqual({ x: -1270, y: 10, ...size });
  });
  it('toWidgetPosition выбирает монитор по центру окна', () => {
    expect(toWidgetPosition({ x: 2020, y: 200, ...size }, [primary, right])).toEqual({ displayId: 2, x: 100, y: 200 });
  });
  it('toWidgetPosition: центр вне всех мониторов → монитор с наибольшим перекрытием', () => {
    const p = toWidgetPosition({ x: -150, y: 100, ...size }, [primary]);
    expect(p).toEqual({ displayId: 1, x: -150, y: 100 });
  });
  it('круговая проверка: to → resolve даёт то же место', () => {
    const rect = { x: 2500, y: 900, ...size };
    const pos = toWidgetPosition(rect, [primary, right]);
    expect(resolveWidgetRect(pos, [primary, right], size)).toEqual(rect);
  });
});
