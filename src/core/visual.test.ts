import { describe, expect, it } from 'vitest';
import type { SchedulerView } from './scheduler';
import { selectVisual, SLEEP_IDLE_MS } from './visual';

const view = (p: Partial<SchedulerView> = {}): SchedulerView => ({
  phase: 'working',
  pendingKind: null,
  preBreakSecLeft: null,
  next: null,
  break: null,
  canSkip: false,
  skipAvailableAt: null,
  canPostpone: false,
  strictness: 'normal',
  quiet: null,
  pausedUntil: null,
  ...p,
});
const fine = { water: 90, eyes: 90, movement: 90 };
const ctx = (p: Partial<Parameters<typeof selectVisual>[1]> = {}) => ({
  idleMs: 0,
  nightNoInput: false,
  needs: fine,
  ...p,
});

describe('selectVisual — приоритет SPEC 4.2', () => {
  it('перерыв главнее всего, даже сна и жажды', () => {
    const v = view({
      phase: 'onBreak',
      break: { kind: 'long', exerciseId: 'reach-up', startedAt: 0, endsAt: 1, secLeft: 1 },
    });
    expect(
      selectVisual(v, ctx({ idleMs: SLEEP_IDLE_MS, needs: { water: 0, eyes: 0, movement: 0 } })),
    ).toBe('onBreak:stretchUp');
  });
  it('preBreak → машет', () => {
    expect(selectVisual(view({ phase: 'preBreak' }), ctx())).toBe('waving');
  });
  it('пауза, вне часов, долгий простой, ночь без ввода → спит', () => {
    expect(selectVisual(view({ phase: 'paused' }), ctx())).toBe('sleeping');
    expect(selectVisual(view({ phase: 'offHours' }), ctx())).toBe('sleeping');
    expect(selectVisual(view(), ctx({ idleMs: SLEEP_IDLE_MS }))).toBe('sleeping');
    expect(selectVisual(view(), ctx({ nightNoInput: true }))).toBe('sleeping');
  });
  it('приключение главнее тишины', () => {
    expect(selectVisual(view({ phase: 'suppressed' }), ctx({ adventure: true }))).toBe('adventure');
  });
  it('созвон → тихо, даже если хочет пить', () => {
    expect(
      selectVisual(
        view({ phase: 'suppressed' }),
        ctx({ needs: { water: 0, eyes: 0, movement: 0 } }),
      ),
    ).toBe('quiet');
  });
  it('потребности: жажда → усталость → радость → обычный', () => {
    expect(selectVisual(view(), ctx({ needs: { water: 10, eyes: 10, movement: 10 } }))).toBe(
      'thirsty',
    );
    expect(selectVisual(view(), ctx({ needs: { water: 80, eyes: 10, movement: 80 } }))).toBe(
      'tired',
    );
    expect(selectVisual(view(), ctx())).toBe('happy');
    expect(selectVisual(view(), ctx({ needs: { water: 50, eyes: 50, movement: 50 } }))).toBe(
      'idle',
    );
  });
});
