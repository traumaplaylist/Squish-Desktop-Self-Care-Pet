import { describe, expect, it } from 'vitest';
import { MINUTE, SECOND } from './clock';
import { DEFAULT_SETTINGS, defaultState } from './defaults';
import type { Effect } from './events';
import { EXERCISES } from './exercises';
import {
  IDLE_PHASE_MS,
  reduceScheduler,
  resumeScheduler,
  schedulerConfigFrom,
  schedulerView,
  type SchedulerConfig,
  type SchedulerEvent,
} from './scheduler';
import type { SchedulerState, Settings, SuppressReason } from './types';

const T0 = 1_700_000_000_000;

function cfgWith(patch: (s: Settings) => void = () => {}, hardDay = false): SchedulerConfig {
  const s = structuredClone(DEFAULT_SETTINGS);
  patch(s);
  return schedulerConfigFrom(s, { hardDay, timeScale: 1 });
}

/** Мини-симулятор: держит состояние, время и все эффекты. */
class Sim {
  state: SchedulerState;
  now = T0;
  effects: Effect[] = [];
  idleMs = 0;
  suppression: { reason: SuppressReason; app: string | null } | null = null;
  offHours = false;

  constructor(public cfg: SchedulerConfig = cfgWith()) {
    // Симулятор стартует «на ходу»: первый tick после запуска приложения время не копит (это проверено отдельно).
    this.state = { ...defaultState(T0).scheduler, lastTickAt: T0 };
  }

  send(ev: SchedulerEvent): Effect[] {
    const r = reduceScheduler(this.state, ev, this.now, this.cfg);
    this.state = r.state;
    this.effects.push(...r.effects);
    return r.effects;
  }

  tick(): Effect[] {
    return this.send({
      type: 'tick',
      idleMs: this.idleMs,
      suppression: this.suppression,
      offHours: this.offHours,
    });
  }

  /** Прожить ms по секундным тикам; idle растёт, если `idleGrows`. */
  run(ms: number, opts: { idleGrows?: boolean } = {}): void {
    for (let t = 0; t < ms; t += SECOND) {
      this.now += SECOND;
      if (opts.idleGrows) this.idleMs += SECOND;
      this.tick();
    }
  }

  /** Работать (ввод постоянно): idle 0. */
  work(ms: number): void {
    this.idleMs = 0;
    this.run(ms);
  }

  /** Пока не наступит фаза (с защитой от бесконечного цикла). */
  workUntil(phase: SchedulerState['phase'], limitMs = 3 * 60 * MINUTE): void {
    this.idleMs = 0;
    for (let t = 0; t < limitMs && this.state.phase !== phase; t += SECOND) {
      this.now += SECOND;
      this.tick();
    }
    if (this.state.phase !== phase)
      throw new Error(`не дошли до ${phase}, сейчас ${this.state.phase}`);
  }

  logged(type: string) {
    return this.effects
      .filter((e) => e.type === 'log' && e.event.type === type)
      .map((e) => (e as { event: unknown }).event);
  }

  has(type: Effect['type']): boolean {
    return this.effects.some((e) => e.type === type);
  }
}

describe('scheduler: полный цикл', () => {
  it('20 мин работы → preBreak за 30 с до микро', () => {
    const sim = new Sim();
    sim.workUntil('preBreak');
    expect(sim.state.pendingKind).toBe('micro');
    expect(sim.now - T0).toBe(20 * MINUTE - 30 * SECOND);
    expect(sim.has('prepareOverlay')).toBe(true);
  });

  it('preBreak 30 с без ввода → … печатает → waitingForPause → пауза ввода → onBreak → 20 с → completed', () => {
    const sim = new Sim();
    sim.workUntil('preBreak');
    sim.work(30 * SECOND);
    expect(sim.state.phase).toBe('waitingForPause');
    sim.idleMs = 2 * SECOND;
    sim.now += SECOND;
    sim.tick();
    expect(sim.state.phase).toBe('onBreak');
    expect(sim.has('showOverlay')).toBe(true);
    sim.run(20 * SECOND);
    expect(sim.state.phase).toBe('working');
    expect(sim.logged('break_completed')).toHaveLength(1);
    expect(sim.state.activeSinceMicro).toBeLessThan(2 * SECOND);
    expect(sim.effects.some((e) => e.type === 'breakFinished' && e.completed)).toBe(true);
  });

  it('за 60 мин: микро в 20 и 40, длинный в 60 (совпадение → длинный)', () => {
    const sim = new Sim();
    const kinds: string[] = [];
    sim.idleMs = 0;
    for (let i = 0; i < 70 * 60; i++) {
      sim.now += SECOND;
      // «отпустил клавиатуру» в preBreak — естественный момент
      sim.idleMs =
        sim.state.phase === 'preBreak' || sim.state.phase === 'onBreak' ? sim.idleMs + SECOND : 0;
      const fx = sim.tick();
      for (const e of fx) if (e.type === 'showOverlay') kinds.push(e.kind);
    }
    expect(kinds).toEqual(['micro', 'micro', 'long']);
  });

  it('длинный сбрасывает и микро-таймер', () => {
    const sim = new Sim();
    sim.state.activeSinceMicro = 10 * MINUTE;
    sim.send({ type: 'breakNow', kind: 'long' });
    sim.run(5 * MINUTE);
    expect(sim.state.phase).toBe('working');
    expect(sim.state.activeSinceMicro).toBeLessThan(2 * SECOND);
    expect(sim.state.activeSinceLong).toBeLessThan(2 * SECOND);
  });

  it('микро не сбрасывает длинный', () => {
    const sim = new Sim();
    sim.state.activeSinceLong = 30 * MINUTE;
    sim.send({ type: 'breakNow', kind: 'micro' });
    sim.run(20 * SECOND);
    expect(sim.state.activeSinceLong).toBe(30 * MINUTE);
  });
});

describe('scheduler: совпадение микро и длинного (R0, окно 5 мин)', () => {
  it('длинный через ≤ 5 мин после микро → сразу длинный', () => {
    const sim = new Sim();
    sim.state.activeSinceLong = 37 * MINUTE; // длинный через 23, микро через 20
    sim.workUntil('preBreak');
    expect(sim.state.pendingKind).toBe('long');
  });
  it('длинный дальше 5 мин → микро', () => {
    const sim = new Sim();
    sim.state.activeSinceLong = 30 * MINUTE; // длинный через 30, микро через 20
    sim.workUntil('preBreak');
    expect(sim.state.pendingKind).toBe('micro');
  });
  it('микро выключен — только длинные', () => {
    const sim = new Sim(cfgWith((s) => (s.breaks.micro.enabled = false)));
    sim.workUntil('preBreak');
    expect(sim.state.pendingKind).toBe('long');
    expect(sim.now - T0).toBe(60 * MINUTE - 30 * SECOND);
  });
  it('оба выключены — перерывов нет', () => {
    const sim = new Sim(
      cfgWith((s) => {
        s.breaks.micro.enabled = false;
        s.breaks.long.enabled = false;
      }),
    );
    sim.work(3 * 60 * MINUTE);
    expect(sim.state.phase).toBe('working');
    expect(schedulerView(sim.state, sim.now, sim.cfg).next).toBeNull();
  });
});

describe('scheduler: естественный момент и «не прерывать на полуслове»', () => {
  it('в preBreak простой ввода ≥ 3 с → старт сразу', () => {
    const sim = new Sim();
    sim.workUntil('preBreak');
    sim.run(3 * SECOND, { idleGrows: true });
    expect(sim.state.phase).toBe('onBreak');
  });
  it('простой 2 с в preBreak — ещё не естественный момент', () => {
    const sim = new Sim();
    sim.workUntil('preBreak');
    sim.run(2 * SECOND, { idleGrows: true });
    expect(sim.state.phase).toBe('preBreak');
  });
  it('печатает 60 с без пауз после отсчёта → старт всё равно', () => {
    const sim = new Sim();
    sim.workUntil('preBreak');
    sim.work(30 * SECOND);
    expect(sim.state.phase).toBe('waitingForPause');
    sim.work(59 * SECOND);
    expect(sim.state.phase).toBe('waitingForPause');
    sim.work(1 * SECOND);
    expect(sim.state.phase).toBe('onBreak');
  });
  it('«не прерывать, пока печатаю» выключено → старт ровно по отсчёту', () => {
    const sim = new Sim(cfgWith((s) => (s.smartPause.dontInterruptTyping = false)));
    sim.workUntil('preBreak');
    sim.work(30 * SECOND);
    expect(sim.state.phase).toBe('onBreak');
  });
  it('«Начать сейчас» из preBreak', () => {
    const sim = new Sim();
    sim.workUntil('preBreak');
    sim.send({ type: 'startNow' });
    expect(sim.state.phase).toBe('onBreak');
  });
  it('startNow вне preBreak игнорируется', () => {
    const sim = new Sim();
    sim.send({ type: 'startNow' });
    expect(sim.state.phase).toBe('working');
  });
});

describe('scheduler: строгость и отложения (SPEC 3.4)', () => {
  const postponeTimes = (strictness: 'soft' | 'normal' | 'strict') => {
    const sim = new Sim(cfgWith((s) => (s.breaks.strictness = strictness)));
    let ok = 0;
    for (let i = 0; i < 5; i++) {
      sim.workUntil('preBreak');
      const before = sim.state.postponesInRow;
      sim.send({ type: 'postpone' });
      if (sim.state.postponesInRow > before) ok++;
      else break;
    }
    return { ok, sim };
  };
  it('мягкий: без лимита', () => expect(postponeTimes('soft').ok).toBe(5));
  it('обычный: 2 раза подряд', () => expect(postponeTimes('normal').ok).toBe(2));
  it('строгий: 1 раз', () => expect(postponeTimes('strict').ok).toBe(1));

  it('+5 мин = снова preBreak через 5 мин активного времени (минус предупреждение)', () => {
    const sim = new Sim();
    sim.workUntil('preBreak');
    sim.send({ type: 'postpone' });
    const t = sim.now;
    sim.workUntil('preBreak');
    expect(sim.now - t).toBe(5 * MINUTE - 30 * SECOND);
  });

  it('счётчик «подряд» сбрасывается после завершённого перерыва', () => {
    const sim = new Sim();
    sim.workUntil('preBreak');
    sim.send({ type: 'postpone' });
    sim.workUntil('preBreak');
    sim.send({ type: 'startNow' });
    sim.run(20 * SECOND);
    expect(sim.state.postponesInRow).toBe(0);
  });

  it('обычный: «Пропустить» на оверлее только через 5 с', () => {
    const sim = new Sim();
    sim.send({ type: 'breakNow', kind: 'micro' });
    sim.send({ type: 'skip' });
    expect(sim.state.phase).toBe('onBreak');
    sim.run(5 * SECOND);
    sim.send({ type: 'skip' });
    expect(sim.state.phase).toBe('working');
    expect(sim.logged('break_skipped')).toHaveLength(1);
    expect(sim.effects.some((e) => e.type === 'breakFinished' && !e.completed)).toBe(true);
  });

  it('строгий: пропустить нельзя, только аварийный выход', () => {
    const sim = new Sim(cfgWith((s) => (s.breaks.strictness = 'strict')));
    sim.send({ type: 'breakNow', kind: 'long' });
    sim.run(10 * SECOND);
    sim.send({ type: 'skip' });
    expect(sim.state.phase).toBe('onBreak');
    sim.send({ type: 'skip', emergency: true });
    expect(sim.state.phase).toBe('working');
  });

  it('тяжёлый день → строгость мягкая', () => {
    const cfg = cfgWith((s) => (s.breaks.strictness = 'strict'), true);
    expect(cfg.strictness).toBe('soft');
  });

  it('мягкий: пропустить можно сразу; пропуск сбрасывает таймер как перерыв', () => {
    const sim = new Sim(cfgWith((s) => (s.breaks.strictness = 'soft')));
    sim.workUntil('preBreak');
    sim.send({ type: 'skip' });
    expect(sim.state.phase).toBe('working');
    expect(sim.state.activeSinceMicro).toBe(0);
  });
});

describe('scheduler: пауза', () => {
  it('пауза 30 мин: перерывов нет, потом работа продолжается', () => {
    const sim = new Sim();
    sim.state.activeSinceMicro = 19 * MINUTE;
    sim.send({ type: 'pause', until: sim.now + 30 * MINUTE });
    sim.work(29 * MINUTE);
    expect(sim.state.phase).toBe('paused');
    sim.work(1 * MINUTE);
    expect(sim.state.phase).toBe('working');
    expect(sim.state.activeSinceMicro).toBe(19 * MINUTE); // таймер сохранился, время паузы не копилось
  });
  it('пауза во время перерыва закрывает оверлей', () => {
    const sim = new Sim();
    sim.send({ type: 'breakNow', kind: 'long' });
    const fx = sim.send({ type: 'pause', until: sim.now + 60 * MINUTE });
    expect(fx.some((e) => e.type === 'hideOverlay')).toBe(true);
  });
  it('«до завтра» и ручное возобновление', () => {
    const sim = new Sim();
    sim.send({ type: 'pause', until: sim.now + 16 * 60 * MINUTE });
    sim.work(MINUTE);
    sim.send({ type: 'resume' });
    expect(sim.state.phase).toBe('working');
  });
  it('«перерыв сейчас» из паузы снимает паузу', () => {
    const sim = new Sim();
    sim.send({ type: 'pause', until: sim.now + 60 * MINUTE });
    sim.send({ type: 'breakNow', kind: 'micro' });
    expect(sim.state.phase).toBe('onBreak');
    expect(sim.state.pausedUntil).toBeNull();
  });
});

describe('scheduler: простой и естественные перерывы', () => {
  it('idle 25 с → natural_break, микро-таймер сброшен, длинный — минус время простоя', () => {
    const sim = new Sim();
    sim.work(10 * MINUTE);
    sim.idleMs = 0;
    sim.run(25 * SECOND, { idleGrows: true });
    expect(sim.logged('natural_break')).toHaveLength(1);
    expect(sim.state.activeSinceMicro).toBe(0);
    // 10 мин работы + 19 с простоя накопились, 20 с вычтено задним числом
    expect(sim.state.activeSinceLong).toBe(10 * MINUTE - 1 * SECOND);
  });
  it('один отрезок простоя — один natural_break', () => {
    const sim = new Sim();
    sim.run(3 * MINUTE, { idleGrows: true });
    expect(sim.logged('natural_break')).toHaveLength(1);
  });
  it('idle 5+ мин → фаза idle и сброс длинного; ввод → working', () => {
    const sim = new Sim();
    sim.work(40 * MINUTE - 31 * SECOND); // до preBreak микро не доходим? — двигаем вручную ниже
    sim.state = {
      ...sim.state,
      phase: 'working',
      activeSinceLong: 40 * MINUTE,
      activeSinceMicro: 5 * MINUTE,
    };
    sim.idleMs = 0;
    sim.run(IDLE_PHASE_MS, { idleGrows: true });
    expect(sim.state.phase).toBe('idle');
    expect(sim.state.activeSinceLong).toBe(0);
    sim.work(SECOND);
    expect(sim.state.phase).toBe('working');
  });
  it('простой 10 с — время копится, перерыв не засчитан', () => {
    const sim = new Sim();
    sim.run(10 * SECOND, { idleGrows: true });
    expect(sim.logged('natural_break')).toHaveLength(0);
    expect(sim.state.activeSinceMicro).toBe(10 * SECOND);
  });
});

describe('scheduler: умная пауза', () => {
  it('созвон: перерыв не показывается, становится должным, приходит через кулдаун', () => {
    const sim = new Sim();
    sim.state.activeSinceMicro = 15 * MINUTE;
    sim.suppression = { reason: 'mic', app: 'Telegram.exe' };
    sim.work(10 * MINUTE);
    expect(sim.state.phase).toBe('suppressed');
    expect(sim.has('showOverlay')).toBe(false);
    expect(sim.state.dueBreak?.kind).toBe('micro');
    sim.suppression = null;
    sim.work(59 * SECOND);
    expect(sim.state.phase).toBe('working'); // кулдаун 1 мин
    sim.work(2 * SECOND);
    expect(sim.state.phase).toBe('preBreak');
    expect(sim.state.pendingKind).toBe('micro');
  });
  it('созвон ≥ 45 мин → должный перерыв длинный', () => {
    const sim = new Sim();
    sim.suppression = { reason: 'camera', app: null };
    sim.work(50 * MINUTE);
    sim.suppression = null;
    sim.workUntil('preBreak');
    expect(sim.state.pendingKind).toBe('long');
  });
  it('звонок пришёл во время оверлея → оверлей закрыт, break_interrupted, перерыв должный', () => {
    const sim = new Sim();
    sim.send({ type: 'breakNow', kind: 'long' });
    sim.suppression = { reason: 'mic', app: 'Zoom.exe' };
    sim.work(SECOND);
    expect(sim.state.phase).toBe('suppressed');
    expect(sim.has('hideOverlay')).toBe(true);
    expect(sim.logged('break_interrupted')).toHaveLength(1);
    expect(sim.state.dueBreak?.kind).toBe('long');
  });
  it('собственный оверлей (фуллскрин) не подавляет перерыв', () => {
    const sim = new Sim();
    sim.send({ type: 'breakNow', kind: 'micro' });
    sim.suppression = { reason: 'fullscreen', app: null };
    sim.run(20 * SECOND);
    expect(sim.logged('break_completed')).toHaveLength(1);
  });
  it('фуллскрин в preBreak подавляет', () => {
    const sim = new Sim();
    sim.workUntil('preBreak');
    sim.suppression = { reason: 'fullscreen', app: null };
    sim.work(SECOND);
    expect(sim.state.phase).toBe('suppressed');
    expect(sim.state.dueBreak?.kind).toBe('micro');
  });
  it('во время подавления естественные перерывы не засчитываются', () => {
    const sim = new Sim();
    sim.suppression = { reason: 'fullscreen', app: null };
    sim.run(2 * MINUTE, { idleGrows: true });
    expect(sim.logged('natural_break')).toHaveLength(0);
    expect(sim.state.phase).toBe('suppressed');
  });
  it('suppressed_start / suppressed_end с длительностью', () => {
    const sim = new Sim();
    sim.suppression = { reason: 'mic', app: null };
    sim.work(3 * MINUTE);
    sim.suppression = null;
    sim.work(SECOND);
    const end = sim.logged('suppressed_end') as { durationMs: number }[];
    expect(sim.logged('suppressed_start')).toHaveLength(1);
    expect(end[0]?.durationMs).toBe(3 * MINUTE);
  });
  it('кулдаун задерживает и обычный (не должный) перерыв', () => {
    const sim = new Sim(cfgWith((s) => (s.smartPause.cooldownMin = 5)));
    sim.state.activeSinceMicro = 19 * MINUTE + 30 * SECOND - 2 * SECOND;
    sim.suppression = { reason: 'mic', app: null };
    sim.work(SECOND);
    sim.suppression = null;
    sim.work(4 * MINUTE);
    expect(sim.state.phase).toBe('working');
    sim.work(MINUTE + SECOND);
    expect(sim.state.phase).toBe('preBreak');
  });
});

describe('scheduler: рабочие часы, сон, перезапуск', () => {
  it('вне рабочих часов перерывов нет; утром таймеры с нуля', () => {
    const sim = new Sim();
    sim.state.activeSinceMicro = 19 * MINUTE;
    sim.offHours = true;
    sim.work(60 * MINUTE);
    expect(sim.state.phase).toBe('offHours');
    expect(sim.has('showOverlay')).toBe(false);
    sim.offHours = false;
    sim.work(SECOND);
    expect(sim.state.phase).toBe('working');
    expect(sim.state.activeSinceMicro).toBeLessThanOrEqual(SECOND);
  });
  it('сон: разрыв между tick больше порога не копится — никаких пачек перерывов', () => {
    const sim = new Sim();
    sim.work(10 * MINUTE);
    sim.now += 3 * 60 * MINUTE; // ноутбук спал 3 часа
    sim.tick();
    expect(sim.state.phase).toBe('working');
    expect(sim.state.activeSinceMicro).toBe(10 * MINUTE);
  });
  it('первый tick после старта время не копит', () => {
    const sim = new Sim();
    sim.state.lastTickAt = null;
    sim.work(SECOND);
    expect(sim.state.activeSinceMicro).toBe(0);
    sim.work(SECOND);
    expect(sim.state.activeSinceMicro).toBe(SECOND);
  });
  it('wake сбрасывает lastTickAt', () => {
    const sim = new Sim();
    sim.work(MINUTE);
    sim.send({ type: 'wake' });
    expect(sim.state.lastTickAt).toBeNull();
  });
  it('перезапуск во время перерыва: оверлей не воскресает, таймеры целы', () => {
    const sim = new Sim();
    sim.state.activeSinceLong = 59 * MINUTE;
    sim.send({ type: 'breakNow', kind: 'long' });
    const s = resumeScheduler(sim.state, sim.now + MINUTE);
    expect(s.phase).toBe('working');
    expect(s.breakEndsAt).toBeNull();
    expect(s.lastTickAt).toBeNull();
  });
  it('перезапуск после окончания паузы → working', () => {
    const sim = new Sim();
    sim.send({ type: 'pause', until: sim.now + MINUTE });
    expect(resumeScheduler(sim.state, sim.now + 2 * MINUTE).phase).toBe('working');
    expect(resumeScheduler(sim.state, sim.now + 30 * SECOND).phase).toBe('paused');
  });
});

describe('scheduler: упражнения и представление', () => {
  it('микро — всегда «посмотреть вдаль»', () => {
    const sim = new Sim();
    sim.send({ type: 'breakNow', kind: 'micro' });
    expect(sim.state.exerciseId).toBe('look-far');
  });
  it('длинные упражнения не повторяются подряд', () => {
    const sim = new Sim(cfgWith((s) => (s.breaks.strictness = 'soft')));
    let last: string | null = null;
    for (let i = 0; i < 40; i++) {
      sim.now += 7777 * SECOND;
      sim.send({ type: 'breakNow', kind: 'long' });
      expect(sim.state.exerciseId).not.toBe(last);
      expect(EXERCISES.some((e) => e.id === sim.state.exerciseId)).toBe(true);
      last = sim.state.exerciseId;
      sim.send({ type: 'skip' });
    }
  });
  it('view: обратный отсчёт preBreak и следующий перерыв', () => {
    const sim = new Sim();
    expect(schedulerView(sim.state, sim.now, sim.cfg).next).toEqual({
      kind: 'micro',
      inSec: 20 * 60,
    });
    sim.workUntil('preBreak');
    sim.work(10 * SECOND);
    const v = schedulerView(sim.state, sim.now, sim.cfg);
    expect(v.preBreakSecLeft).toBe(20);
    expect(v.canPostpone).toBe(true);
    expect(v.canSkip).toBe(true);
  });
  it('view: на оверлее «обычный» — skipAvailableAt через 5 с', () => {
    const sim = new Sim();
    sim.send({ type: 'breakNow', kind: 'micro' });
    const v = schedulerView(sim.state, sim.now, sim.cfg);
    expect(v.break?.secLeft).toBe(20);
    expect(v.canSkip).toBe(false);
    expect(v.skipAvailableAt).toBe(sim.now + 5 * SECOND);
  });
  it('view: тихо — причина и приложение', () => {
    const sim = new Sim();
    sim.suppression = { reason: 'mic', app: 'Discord.exe' };
    sim.work(SECOND);
    expect(schedulerView(sim.state, sim.now, sim.cfg).quiet).toEqual({
      reason: 'mic',
      app: 'Discord.exe',
    });
  });
});
