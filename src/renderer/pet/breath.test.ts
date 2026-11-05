import { describe, expect, it } from 'vitest';
import { breathTransform } from './breath';

const parse = (s: string) => {
  const m = /scale\(([\d.]+), ([\d.]+)\) rotate\((-?[\d.]+)deg\)/.exec(s);
  if (!m) throw new Error(s);
  return { sx: Number(m[1]), sy: Number(m[2]), rot: Number(m[3]) };
};

describe('breathTransform', () => {
  it('в начале периода — покой', () => {
    expect(parse(breathTransform('idle', 0))).toEqual({ sx: 1, sy: 1, rot: 0 });
  });
  it('на середине периода idle — максимум: шире и ниже, без покачивания', () => {
    const v = parse(breathTransform('idle', 1800));
    expect(v.sx).toBeCloseTo(1.014, 3);
    expect(v.sy).toBeCloseTo(0.972, 3);
    expect(v.rot).toBe(0);
  });
  it('периодичность', () => {
    expect(breathTransform('idle', 500)).toBe(breathTransform('idle', 500 + 3600));
  });
  it('happy быстрее и покачивается', () => {
    expect(parse(breathTransform('happy', 900)).sy).toBeLessThan(0.98);
    expect(Math.abs(parse(breathTransform('happy', 900)).rot)).toBeGreaterThan(1.9);
  });
  it('sleeping медленнее, неизвестные состояния дышат как idle', () => {
    expect(parse(breathTransform('sleeping', 1800)).sy).toBeGreaterThan(
      parse(breathTransform('idle', 1800)).sy,
    );
    expect(breathTransform('thirsty', 1234)).toBe(breathTransform('idle', 1234));
  });
});
