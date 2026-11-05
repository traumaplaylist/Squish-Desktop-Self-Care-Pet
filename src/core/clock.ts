/**
 * Всё время в core — только через Clock (CLAUDE.md). Метки времени — миллисекунды Unix epoch.
 * Реальные часы (Date.now) живут в main/realClock.ts, чтобы core оставался чистым.
 */
export interface Clock {
  now(): number;
}

/** Часы для тестов: время двигается только вручную. */
export class FakeClock implements Clock {
  private t: number;

  constructor(start = 0) {
    this.t = start;
  }

  now(): number {
    return this.t;
  }

  advance(ms: number): void {
    if (ms < 0) throw new Error('FakeClock.advance: отрицательный шаг');
    this.t += ms;
  }

  set(t: number): void {
    this.t = t;
  }
}

/**
 * Ускоренные часы для SQUISH_DEBUG: от точки старта время идёт в `factor` раз быстрее.
 * now() = origin + (base.now() - origin) * factor
 */
export class AcceleratedClock implements Clock {
  private readonly origin: number;

  constructor(
    private readonly base: Clock,
    private readonly factor: number,
  ) {
    if (!(factor > 0)) throw new Error('AcceleratedClock: factor должен быть > 0');
    this.origin = base.now();
  }

  now(): number {
    return this.origin + (this.base.now() - this.origin) * this.factor;
  }
}

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
