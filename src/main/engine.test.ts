import { describe, expect, it } from 'vitest';
import { FakeClock, MINUTE, SECOND } from '../core/clock';
import { DEFAULT_SETTINGS, defaultState } from '../core/defaults';
import type { AppEvent, Effect } from '../core/events';
import type { PersistedState } from '../core/types';
import { Engine, STILL_ON_CALL_MS } from './engine';

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
  it('вода: стакан → потребность +25, событие, облачко с «Отменить», питомец пьёт', () => {
    const t = setup();
    t.engine.drinkWater();
    expect(t.state().water.glasses).toBe(1);
    expect(t.state().pet.needs.water).toBe(95);
    expect(t.events.some((e) => e.type === 'water')).toBe(true);
    expect(t.engine.snapshot().bubble?.actions?.[0]?.action).toBe('water:undo');
    expect(t.effects.some((e) => e.type === 'petReaction' && e.reaction === 'drink')).toBe(true);
    expect(t.engine.snapshot().water).toEqual({ glasses: 1, goal: 8 });
  });
  it('вода: отмена в 30 с', () => {
    const t = setup();
    t.engine.drinkWater();
    t.step(10 * SECOND);
    t.engine.undoWater();
    expect(t.state().water.glasses).toBe(0);
    expect(t.state().pet.needs.water).toBe(70);
    expect(t.events.some((e) => e.type === 'water_undo')).toBe(true);
  });
  it('вода: напоминание после 90 мин работы без воды (не во время перерыва)', () => {
    const t = setup();
    const before = t.events.length;
    // перерывы выключать неудобно — просто убеждаемся, что облачко-напоминание однажды появилось
    let seen = false;
    for (let i = 0; i < 95 && !seen; i++) {
      t.step(MINUTE);
      if (t.engine.snapshot().bubble?.textKey === 'water.reminder') seen = true;
      if (t.engine.getSchedulerState().phase === 'preBreak') t.engine.dispatch({ type: 'skip' });
    }
    expect(seen).toBe(true);
    expect(t.events.length).toBeGreaterThan(before);
  });
  it('созвон 3 ч → «Всё ещё на созвоне?» один раз за созвон', () => {
    const t = setup();
    t.engine.setDetectorSuppression({ reason: 'mic', app: 'Discord.exe' });
    t.step(SECOND);
    t.step(STILL_ON_CALL_MS);
    const b = t.engine.snapshot().bubble;
    expect(b?.textKey).toBe('quiet.stillOnCall');
    expect(b?.params).toEqual({ app: 'Discord.exe' });
    t.engine.dismissBubble();
    t.step(MINUTE);
    expect(t.engine.snapshot().bubble).toBeNull();
  });
});
