import type { Clock } from '../core/clock';

/** Настоящие часы. Живут в main, чтобы core не трогал Date.now(). */
export class RealClock implements Clock {
  now(): number {
    return Date.now();
  }
}
