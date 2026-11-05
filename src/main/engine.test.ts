import { describe, expect, it } from 'vitest';
import { FakeClock, MINUTE, SECOND } from '../core/clock';
import { DEFAULT_SETTINGS, defaultState } from '../core/defaults';
import type { AppEvent, Effect } from '../core/events';
import type { PersistedState } from '../core/types';
import { Engine } from './engine';

function setup(debug = false) {
  const clock = new FakeClock(new Date(2026, 10, 5, 12).getTime());
  let real = 0;
  let idleMs = 0;
  let state: PersistedState = defaultState(clock.now());
  const saves: number[] = [];
  const events: AppEvent[] = [];
  const effects: Effect[] = [];
  const engine = new Engine({
    clock,
    realNow: () => real,
    timeScale: () => 1,
    getIdleMs: () => idleMs,
    getState: () => state,
    setState: (s, delay = 10_000) => {
      state = s;
      saves.push(delay);
    },
    getSettings: () => DEFAULT_SETTINGS,
    appendEvent: (e) => events.push(e),
    onEffects: (fx) => effects.push(...fx),
    debug,
  });
  const step = (ms: number) => {
    for (let t = 0; t < ms; t += SECOND) {
      clock.advance(SECOND);
      real += SECOND;
      engine.tick();
    }
  };
  return {
    engine,
    step,
    clock,
    events,
    effects,
    saves,
    setIdle: (v: number) => (idleMs = v),
    state: () => state,
  };
}

describe('Engine', () => {
  it('ведёт таймеры и сохраняет планировщик в state', () => {
    const t = setup();
    t.step(10 * SECOND);
    expect(t.state().scheduler.activeSinceMicro).toBe(9 * SECOND); // первый tick не копит
    expect(t.saves.at(-1)).toBe(10_000);
  });
  it('доходит до оверлея и пишет события в лог', () => {
    const t = setup();
    t.step(20 * MINUTE);
    t.setIdle(5 * SECOND);
    t.step(SECOND);
    expect(t.effects.some((e) => e.type === 'showOverlay')).toBe(true);
    t.step(20 * SECOND);
    expect(t.events.some((e) => e.type === 'break_completed')).toBe(true);
  });
  it('блокировка экрана = простой: естественный перерыв, подавление игнорируется', () => {
    const t = setup();
    t.engine.setDetectorSuppression({ reason: 'mic', app: null });
    t.engine.setLocked(true);
    t.step(30 * SECOND);
    expect(t.events.some((e) => e.type === 'natural_break')).toBe(true);
    expect(t.engine.getSchedulerState().phase).toBe('working');
  });
  it('имитация подавления на N минут снимается сама', () => {
    const t = setup(true);
    t.engine.setSimSuppression({ reason: 'mic', minutes: 2 });
    t.step(SECOND);
    expect(t.engine.snapshot().scheduler.quiet?.reason).toBe('mic');
    expect(t.engine.snapshot().pet.visual).toBe('quiet');
    t.step(2 * MINUTE);
    expect(t.engine.getSchedulerState().phase).toBe('working');
  });
  it('команда пользователя сохраняется сразу', () => {
    const t = setup();
    t.engine.dispatch({ type: 'breakNow', kind: 'micro' });
    expect(t.saves.at(-1)).toBe(0);
    expect(t.engine.snapshot().pet.visual).toBe('onBreak:lookFar');
  });
  it('breakNowAuto выбирает ближайший вид', () => {
    const t = setup();
    t.state().scheduler.activeSinceLong = 0;
    t.engine.breakNowAuto();
    expect(t.engine.getSchedulerState().pendingKind).toBe('micro');
  });
  it('preBreak → питомец машет; debugInfo только в debug', () => {
    const t = setup();
    t.step(20 * MINUTE - 29 * SECOND);
    expect(t.engine.snapshot().pet.visual).toBe('waving');
    expect(t.engine.snapshot().debugInfo).toBeNull();
  });
});
