/**
 * Склейка core и окружения (CLAUDE.md): tick раз в секунду, команды из UI, эффекты, снапшот.
 * Electron сюда не импортируется — всё внешнее приходит через EngineDeps (так движок тестируется).
 */
import type { Clock } from '../core/clock';
import { isOffHours } from '../core/day';
import type { AppEvent, Effect } from '../core/events';
import {
  nextBreak,
  reduceScheduler,
  resumeScheduler,
  schedulerConfigFrom,
  schedulerView,
  type SchedulerConfig,
  type SchedulerEvent,
} from '../core/scheduler';
import type {
  BreakKind,
  PersistedState,
  PetVisualState,
  SchedulerState,
  Settings,
  Snapshot,
  SuppressReason,
} from '../core/types';
import { selectVisual } from '../core/visual';

export interface EngineDeps {
  clock: Clock;
  /** Реальное время (для простоя и блокировки — они всегда в реальных мс). */
  realNow: () => number;
  timeScale: () => number;
  /** Простой ввода в реальных мс (powerMonitor.getSystemIdleTime). */
  getIdleMs: () => number;
  getState: () => PersistedState;
  setState: (s: PersistedState, delayMs?: number) => void;
  getSettings: () => Settings;
  appendEvent: (e: AppEvent) => void;
  onEffects: (fx: Effect[]) => void;
  debug: boolean;
}

const BUBBLE_DEFAULT_MS = 4000;

export class Engine {
  private sched: SchedulerState;
  private simSuppression: { reason: SuppressReason; until: number } | null = null;
  private detectorSuppression: { reason: SuppressReason; app: string | null } | null = null;
  private lockedSinceReal: number | null = null;
  private bubble: {
    textKey: string;
    params?: Record<string, string | number>;
    untilReal: number;
  } | null = null;
  private visualOverride: PetVisualState | null = null;
  private lastIdleMs = 0;
  private fakeIdleMs: number | null = null;

  constructor(private readonly d: EngineDeps) {
    this.sched = resumeScheduler(d.getState().scheduler, d.clock.now());
  }

  cfg(): SchedulerConfig {
    return schedulerConfigFrom(this.d.getSettings(), {
      hardDay: this.d.getState().pet.hardDay,
      timeScale: this.d.timeScale(),
    });
  }

  tick(): void {
    const realNow = this.d.realNow();
    let idle = this.fakeIdleMs ?? this.d.getIdleMs();
    if (this.lockedSinceReal !== null) idle = Math.max(idle, realNow - this.lockedSinceReal);
    this.lastIdleMs = idle;
    const now = this.d.clock.now();
    if (this.simSuppression && now >= this.simSuppression.until) this.simSuppression = null;
    if (this.bubble && realNow >= this.bubble.untilReal) this.bubble = null;
    const suppression =
      this.lockedSinceReal !== null
        ? null
        : this.simSuppression
          ? { reason: this.simSuppression.reason, app: 'debug' }
          : this.detectorSuppression;
    this.apply({
      type: 'tick',
      idleMs: idle,
      suppression,
      offHours: isOffHours(this.d.getSettings().smartPause.workHours, now),
    });
  }

  dispatch(ev: Exclude<SchedulerEvent, { type: 'tick' }>): void {
    this.apply(ev);
  }

  /** «Сделать перерыв сейчас» из трея/хоткея: вид — ближайший по расписанию. */
  breakNowAuto(): void {
    const kind: BreakKind = nextBreak(this.sched, this.cfg())?.kind ?? 'micro';
    this.dispatch({ type: 'breakNow', kind });
  }

  setLocked(locked: boolean): void {
    this.lockedSinceReal = locked ? this.d.realNow() : null;
    if (!locked) this.dispatch({ type: 'wake' });
  }

  setDetectorSuppression(s: { reason: SuppressReason; app: string | null } | null): void {
    this.detectorSuppression = s;
  }

  setSimSuppression(s: { reason: SuppressReason; minutes: number } | null): void {
    this.simSuppression = s
      ? { reason: s.reason, until: this.d.clock.now() + s.minutes * 60_000 }
      : null;
  }

  /** Debug: подменить простой ввода (0 — «печатаю», большое — «отошёл»), null — реальный. */
  setFakeIdle(ms: number | null): void {
    this.fakeIdleMs = ms;
  }

  setVisualOverride(v: PetVisualState | null): void {
    this.visualOverride = v;
  }

  showBubble(
    textKey: string,
    params?: Record<string, string | number>,
    ttlMs = BUBBLE_DEFAULT_MS,
  ): void {
    this.bubble = { textKey, untilReal: this.d.realNow() + ttlMs, ...(params ? { params } : {}) };
  }

  getSchedulerState(): SchedulerState {
    return this.sched;
  }

  /** Сохранить немедленно (выход). */
  persistNow(): void {
    this.d.setState({ ...this.d.getState(), scheduler: this.sched }, 0);
  }

  snapshot(): Snapshot {
    const st = this.d.getState();
    const settings = this.d.getSettings();
    const now = this.d.clock.now();
    const cfg = this.cfg();
    const view = schedulerView(this.sched, now, cfg);
    const hour = new Date(now).getHours();
    const visual =
      this.visualOverride ??
      selectVisual(view, {
        idleMs: this.lastIdleMs,
        nightNoInput: hour < 6 && this.lastIdleMs > 60_000,
      });
    return {
      debug: this.d.debug,
      lang: settings.lang,
      pet: {
        name: st.pet.name,
        palette: st.pet.palette,
        stage: st.pet.stage,
        visual,
        cozy: st.pet.hardDay,
        needs: st.pet.needs,
      },
      tasksToday: { done: 0, total: 0 },
      scheduler: view,
      overlayOpacity: settings.breaks.overlayOpacity,
      bubble: this.bubble
        ? {
            textKey: this.bubble.textKey,
            ...(this.bubble.params ? { params: this.bubble.params } : {}),
          }
        : null,
      hotkeysFailed: [],
      debugInfo: this.d.debug
        ? {
            speed: this.d.timeScale(),
            now,
            activeSinceMicroSec: Math.round(this.sched.activeSinceMicro / 1000),
            activeSinceLongSec: Math.round(this.sched.activeSinceLong / 1000),
            dueBreak: this.sched.dueBreak?.kind ?? null,
            cooldownSec: this.sched.cooldownUntil
              ? Math.max(0, Math.round((this.sched.cooldownUntil - now) / 1000))
              : null,
            simSuppression: this.simSuppression
              ? {
                  reason: this.simSuppression.reason,
                  untilSec: Math.round((this.simSuppression.until - now) / 1000),
                }
              : null,
            fakeIdleMs: this.fakeIdleMs,
          }
        : null,
    };
  }

  private apply(ev: SchedulerEvent): void {
    const now = this.d.clock.now();
    const r = reduceScheduler(this.sched, ev, now, this.cfg());
    this.sched = r.state;
    for (const e of r.effects) {
      if (e.type === 'log') this.d.appendEvent(e.event);
      if (e.type === 'bubble') this.showBubble(e.textKey, e.params, e.ttlMs);
    }
    // Состояние пишем не чаще раза в 10 с (SPEC 6); команды пользователя — сразу.
    this.d.setState(
      { ...this.d.getState(), scheduler: this.sched },
      ev.type === 'tick' ? 10_000 : 0,
    );
    if (r.effects.length) this.d.onEffects(r.effects);
  }
}
