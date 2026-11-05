import { describe, expect, it } from 'vitest';
import { AcceleratedClock, FakeClock, MINUTE } from './clock';

describe('FakeClock', () => {
  it('стоит на месте, пока не двинешь', () => {
    const c = new FakeClock(1000);
    expect(c.now()).toBe(1000);
    expect(c.now()).toBe(1000);
  });
  it('advance и set', () => {
    const c = new FakeClock();
    c.advance(500);
    expect(c.now()).toBe(500);
    c.set(42);
    expect(c.now()).toBe(42);
  });
  it('не идёт назад', () => {
    expect(() => new FakeClock().advance(-1)).toThrow();
  });
});

describe('AcceleratedClock', () => {
  it('ускоряет время от точки старта ×60', () => {
    const base = new FakeClock(10_000);
    const c = new AcceleratedClock(base, 60);
    expect(c.now()).toBe(10_000);
    base.advance(20_000); // 20 с реального времени
    expect(c.now()).toBe(10_000 + 20 * MINUTE); // = 20 минут
  });
  it('factor 1 = обычное время', () => {
    const base = new FakeClock(5);
    const c = new AcceleratedClock(base, 1);
    base.advance(100);
    expect(c.now()).toBe(105);
  });
  it('setFactor без скачка времени', () => {
    const base = new FakeClock(0);
    const c = new AcceleratedClock(base, 60);
    base.advance(1000);
    expect(c.now()).toBe(60_000);
    c.setFactor(1);
    expect(c.now()).toBe(60_000);
    base.advance(1000);
    expect(c.now()).toBe(61_000);
    expect(c.getFactor()).toBe(1);
  });
  it('factor ≤ 0 запрещён', () => {
    expect(() => new AcceleratedClock(new FakeClock(), 0)).toThrow();
  });
});
