/**
 * Планировщик перерывов (SPEC 3 + уточнения R0 и Дня 2) — чистая функция:
 *   reduceScheduler(state, event, now, cfg) → { state, effects }
 * Время приходит только аргументом `now`; таймеров внутри нет — main шлёт tick раз в секунду.
 *
 * Фазы: working → preBreak → (waitingForPause) → onBreak → working; плюс paused, suppressed, idle, offHours.
 */
import type { AppEvent, Effect } from './events';
import { MICRO_EXERCISE, pickExercise } from './exercises';
import type {
  BreakKind,
  Millis,
  SchedulerState,
  Settings,
  Strictness,
  SuppressReason,
} from './types';
import { MINUTE, SECOND } from './clock';

// ───────────── Константы поведения (SPEC 3.2, 3.4) ─────────────
/** Простой ввода ≥ 3 с в preBreak — «естественный момент», стартуем сразу. */
export const NATURAL_MOMENT_MS = 3 * SECOND;
/** Пауза ввода ≥ 2 с — можно начинать, человек не печатает. */
export const TYPING_PAUSE_MS = 2 * SECOND;
/** Ждём паузы ввода максимум 60 с, потом стартуем в любом случае. */
export const MAX_WAIT_FOR_PAUSE_MS = 60 * SECOND;
/** Простой ≥ 20 с — естественный микро-перерыв; время простоя не считается активным (R0). */
export const NATURAL_BREAK_IDLE_MS = 20 * SECOND;
/** Простой ≥ 5 мин — фаза idle, сброс и длинного таймера. */
export const IDLE_PHASE_MS = 5 * MINUTE;
/** «+5 мин» — 5 минут активного времени (R0). */
export const POSTPONE_MS = 5 * MINUTE;
/** Длинный в пределах 5 мин после микро — показываем длинный (R0). */
export const COINCIDE_WINDOW_MS = 5 * MINUTE;
/** Подавление ≥ 45 мин (долгий созвон) — должный перерыв становится длинным. */
export const LONG_SUPPRESSION_MS = 45 * MINUTE;
/** «Обычная» строгость: «Пропустить» на оверлее появляется через 5 с. */
export const NORMAL_SKIP_DELAY_MS = 5 * SECOND;

export interface SchedulerConfig {
  micro: { enabled: boolean; intervalMs: Millis; durationMs: Millis };
  long: { enabled: boolean; intervalMs: Millis; durationMs: Millis };
  warningMs: Millis;
  strictness: Strictness;
  dontInterruptTyping: boolean;
  cooldownMs: Millis;
  /** Разрыв между tick больше этого — сон/зависание: время не копим, пачек перерывов нет. */
  maxTickGapMs: Millis;
}

/** Конфиг из настроек. hardDay (SPEC 5.6) → строгость мягкая. timeScale — ускорение debug-часов. */
export function schedulerConfigFrom(
  settings: Settings,
  opts: { hardDay: boolean; timeScale: number },
): SchedulerConfig {
  const b = settings.breaks;
  return {
    micro: {
      enabled: b.micro.enabled,
      intervalMs: b.micro.intervalMin * MINUTE,
      durationMs: b.micro.durationSec * SECOND,
    },
    long: {
      enabled: b.long.enabled,
      intervalMs: b.long.intervalMin * MINUTE,
      durationMs: b.long.durationMin * MINUTE,
    },
    warningMs: b.warningSec * SECOND,
    strictness: opts.hardDay ? 'soft' : b.strictness,
    dontInterruptTyping: settings.smartPause.dontInterruptTyping,
    cooldownMs: settings.smartPause.cooldownMin * MINUTE,
    maxTickGapMs: 5 * SECOND * Math.max(1, opts.timeScale),
  };
}

export type SchedulerEvent =
  | {
      type: 'tick';
      /** Простой ввода, мс (при блокировке экрана main передаёт время с момента блокировки). */
      idleMs: number;
      /** Текущее подавление от детекторов умной паузы (уровень, не фронт). */
      suppression: { reason: SuppressReason; app: string | null } | null;
      /** Вне рабочих часов. */
      offHours: boolean;
    }
  | { type: 'startNow' }
  | { type: 'postpone' }
  | { type: 'skip'; emergency?: boolean }
  | { type: 'breakNow'; kind: BreakKind }
  | { type: 'pause'; until: Millis }
  | { type: 'resume' }
  /** Пробуждение после сна / разблокировка — не копить время за разрыв. */
  | { type: 'wake' };

export interface SchedulerResult {
  state: SchedulerState;
  effects: Effect[];
}

const FULLSCREEN_REASONS: ReadonlySet<SuppressReason> = new Set([
  'fullscreen',
  'game',
  'presentation',
]);
const BREAK_PHASES = new Set(['preBreak', 'waitingForPause', 'onBreak']);

// ───────────── Правила строгости (SPEC 3.4) ─────────────
export function canPostpone(s: SchedulerState, cfg: SchedulerConfig): boolean {
  if (!BREAK_PHASES.has(s.phase)) return false;
  switch (cfg.strictness) {
    case 'soft':
      return true;
    case 'normal':
      return s.postponesInRow < 2;
    case 'strict':
      return s.postponesInRow < 1;
  }
}

export function canSkip(s: SchedulerState, cfg: SchedulerConfig, now: Millis): boolean {
  if (s.phase === 'preBreak' || s.phase === 'waitingForPause') return cfg.strictness !== 'strict';
  if (s.phase !== 'onBreak') return false;
  switch (cfg.strictness) {
    case 'soft':
      return true;
    case 'normal':
      return now - s.phaseStartedAt >= NORMAL_SKIP_DELAY_MS;
    case 'strict':
      return false;
  }
}

/** Сколько осталось активного времени до микро/длинного (Infinity — выключен). */
export function remaining(
  s: SchedulerState,
  cfg: SchedulerConfig,
): { micro: number; long: number } {
  return {
    micro: cfg.micro.enabled ? cfg.micro.intervalMs - s.activeSinceMicro : Infinity,
    long: cfg.long.enabled ? cfg.long.intervalMs - s.activeSinceLong : Infinity,
  };
}

/** Какой перерыв ближайший, с учётом окна совпадения (R0). null — оба выключены. */
export function nextBreak(
  s: SchedulerState,
  cfg: SchedulerConfig,
): { kind: BreakKind; inMs: number } | null {
  const r = remaining(s, cfg);
  if (r.micro === Infinity && r.long === Infinity) return null;
  if (r.long <= r.micro) return { kind: 'long', inMs: Math.max(0, r.long) };
  const kind: BreakKind = r.long - r.micro <= COINCIDE_WINDOW_MS ? 'long' : 'micro';
  return { kind, inMs: Math.max(0, r.micro) };
}

// ───────────── Редьюсер ─────────────
export function reduceScheduler(
  prev: SchedulerState,
  event: SchedulerEvent,
  now: Millis,
  cfg: SchedulerConfig,
): SchedulerResult {
  const s: SchedulerState = { ...prev };
  const fx: Effect[] = [];
  const log = (e: AppEvent) => fx.push({ type: 'log', event: e });

  const enter = (phase: SchedulerState['phase']) => {
    s.phase = phase;
    s.phaseStartedAt = now;
  };

  const resetAfterBreak = (kind: BreakKind) => {
    s.activeSinceMicro = 0;
    if (kind === 'long') s.activeSinceLong = 0;
    s.postponesInRow = 0;
  };

  const leaveBreakPhases = () => {
    if (BREAK_PHASES.has(s.phase)) fx.push({ type: 'hideOverlay' });
    s.pendingKind = null;
    s.breakEndsAt = null;
    s.exerciseId = null;
  };

  const startBreak = () => {
    const kind = s.pendingKind ?? 'micro';
    const exercise = kind === 'micro' ? MICRO_EXERCISE : pickExercise(s.lastExerciseId, now);
    enter('onBreak');
    s.pendingKind = kind;
    s.exerciseId = exercise.id;
    s.lastExerciseId = kind === 'long' ? exercise.id : s.lastExerciseId;
    s.breakEndsAt = now + (kind === 'micro' ? cfg.micro.durationMs : cfg.long.durationMs);
    fx.push({ type: 'showOverlay', kind, exerciseId: exercise.id, endsAt: s.breakEndsAt });
  };

  const enterPreBreak = (kind: BreakKind) => {
    enter('preBreak');
    s.pendingKind = kind;
    fx.push({ type: 'prepareOverlay' });
  };

  const finishBreak = (completed: boolean, emergency = false) => {
    const kind = s.pendingKind ?? 'micro';
    if (completed) log({ type: 'break_completed', at: now, kind, exerciseId: s.exerciseId });
    else log({ type: 'break_skipped', at: now, kind });
    if (emergency) fx.push({ type: 'bubble', textKey: 'break.emergencyExit', ttlMs: 4000 });
    leaveBreakPhases();
    resetAfterBreak(kind);
    fx.push({ type: 'breakFinished', kind, completed });
    enter('working');
  };

  switch (event.type) {
    case 'wake':
      s.lastTickAt = null;
      return { state: s, effects: fx };

    case 'pause':
      leaveBreakPhases();
      s.pausedUntil = event.until;
      enter('paused');
      return { state: s, effects: fx };

    case 'resume':
      if (s.phase !== 'paused') return { state: s, effects: fx };
      s.pausedUntil = null;
      s.lastTickAt = null;
      enter('working');
      return { state: s, effects: fx };

    case 'breakNow':
      if (s.phase === 'onBreak') return { state: s, effects: fx };
      if (s.phase === 'paused') s.pausedUntil = null;
      if (s.phase === 'suppressed') s.suppression = null;
      s.pendingKind = event.kind;
      s.dueBreak = null;
      fx.push({ type: 'prepareOverlay' });
      startBreak();
      return { state: s, effects: fx };

    case 'startNow':
      if (s.phase === 'preBreak' || s.phase === 'waitingForPause') startBreak();
      return { state: s, effects: fx };

    case 'postpone': {
      if (!canPostpone(s, cfg)) return { state: s, effects: fx };
      const kind = s.pendingKind ?? 'micro';
      s.postponesInRow += 1;
      log({ type: 'break_postponed', at: now, kind, inRow: s.postponesInRow });
      // Следующий preBreak — через 5 мин активного времени (R0). Ближе не подпускаем и второй таймер.
      if (kind === 'long')
        s.activeSinceLong = Math.min(s.activeSinceLong, cfg.long.intervalMs - POSTPONE_MS);
      s.activeSinceMicro = Math.min(s.activeSinceMicro, cfg.micro.intervalMs - POSTPONE_MS);
      if (kind === 'micro' && cfg.long.enabled) {
        s.activeSinceLong = Math.min(s.activeSinceLong, cfg.long.intervalMs - POSTPONE_MS);
      }
      leaveBreakPhases();
      enter('working');
      return { state: s, effects: fx };
    }

    case 'skip':
      if (!canSkip(s, cfg, now) && !(event.emergency && s.phase === 'onBreak'))
        return { state: s, effects: fx };
      finishBreak(false, event.emergency === true);
      return { state: s, effects: fx };

    case 'tick':
      return tick(s, fx, event, now, cfg, {
        enter,
        startBreak,
        enterPreBreak,
        finishBreak,
        leaveBreakPhases,
        log,
      });
  }
}

interface Helpers {
  enter: (p: SchedulerState['phase']) => void;
  startBreak: () => void;
  enterPreBreak: (kind: BreakKind) => void;
  finishBreak: (completed: boolean) => void;
  leaveBreakPhases: () => void;
  log: (e: AppEvent) => void;
}

function tick(
  s: SchedulerState,
  fx: Effect[],
  ev: Extract<SchedulerEvent, { type: 'tick' }>,
  now: Millis,
  cfg: SchedulerConfig,
  h: Helpers,
): SchedulerResult {
  const rawDelta = s.lastTickAt === null ? 0 : now - s.lastTickAt;
  const delta = rawDelta < 0 || rawDelta > cfg.maxTickGapMs ? 0 : rawDelta;
  s.lastTickAt = now;
  const done = () => ({ state: s, effects: fx });

  // 1. Ручная пауза.
  if (s.phase === 'paused') {
    if (s.pausedUntil !== null && now >= s.pausedUntil) {
      s.pausedUntil = null;
      h.enter('working');
    }
    return done();
  }

  // 2. Перерыв идёт — досиживаем, если не помешал созвон (фуллскрин во время перерыва — это мы сами).
  const suppression =
    ev.suppression && s.phase === 'onBreak' && FULLSCREEN_REASONS.has(ev.suppression.reason)
      ? null
      : ev.suppression;

  // 3. Вне рабочих часов.
  if (ev.offHours) {
    if (s.phase !== 'offHours' && s.phase !== 'onBreak') {
      h.leaveBreakPhases();
      endSuppression(s, h, now, cfg, false);
      h.enter('offHours');
    }
    if (s.phase === 'offHours') return done();
  } else if (s.phase === 'offHours') {
    // Новый рабочий день: начинаем с чистого листа.
    s.activeSinceMicro = 0;
    s.activeSinceLong = 0;
    s.dueBreak = null;
    s.cooldownUntil = null;
    s.postponesInRow = 0;
    h.enter('working');
  }

  // 4. Умная пауза.
  if (suppression) {
    if (s.phase !== 'suppressed') {
      if (BREAK_PHASES.has(s.phase) && s.pendingKind) {
        if (s.phase === 'onBreak' || s.phase === 'preBreak' || s.phase === 'waitingForPause') {
          h.log({
            type: 'break_interrupted',
            at: now,
            kind: s.pendingKind,
            reason: suppression.reason,
          });
        }
        s.dueBreak = { kind: s.pendingKind, dueSince: now };
      }
      h.leaveBreakPhases();
      s.suppression = { reason: suppression.reason, app: suppression.app, since: now };
      h.log({
        type: 'suppressed_start',
        at: now,
        reason: suppression.reason,
        app: suppression.app,
      });
      h.enter('suppressed');
    } else if (
      s.suppression &&
      (s.suppression.reason !== suppression.reason || s.suppression.app !== suppression.app)
    ) {
      s.suppression = { ...s.suppression, reason: suppression.reason, app: suppression.app };
    }
    // Человек у экрана — время идёт; наступивший перерыв становится должным.
    s.activeSinceMicro += delta;
    s.activeSinceLong += delta;
    const next = nextBreak(s, cfg);
    if (next && next.inMs <= 0) {
      if (!s.dueBreak) s.dueBreak = { kind: next.kind, dueSince: now };
      else if (next.kind === 'long' && s.dueBreak.kind === 'micro')
        s.dueBreak = { ...s.dueBreak, kind: 'long' };
    }
    return done();
  }
  if (s.phase === 'suppressed') endSuppression(s, h, now, cfg, true);

  // 5. Перерыв идёт.
  if (s.phase === 'onBreak') {
    if (s.breakEndsAt !== null && now >= s.breakEndsAt) h.finishBreak(true);
    return done();
  }

  // 6. Простой.
  const idle = ev.idleMs;
  if (idle < NATURAL_BREAK_IDLE_MS) s.naturalCounted = false;

  if (s.phase === 'idle') {
    if (idle < NATURAL_BREAK_IDLE_MS) h.enter('working');
    else return done();
  }

  if (s.phase === 'working') {
    if (idle >= IDLE_PHASE_MS) {
      if (!s.naturalCounted) logNatural(s, h, now, idle);
      s.activeSinceMicro = 0;
      s.activeSinceLong = 0;
      s.postponesInRow = 0;
      h.enter('idle');
      return done();
    }
    if (idle >= NATURAL_BREAK_IDLE_MS) {
      if (!s.naturalCounted) logNatural(s, h, now, idle);
      return done(); // время простоя не копим
    }
  }

  // 7. Копим активное время (ввод был недавно).
  if (s.phase === 'working' || s.phase === 'preBreak' || s.phase === 'waitingForPause') {
    s.activeSinceMicro += delta;
    s.activeSinceLong += delta;
  }

  // 8. Переходы к перерыву.
  if (s.phase === 'working') {
    if (s.cooldownUntil !== null) {
      if (now < s.cooldownUntil) return done();
      s.cooldownUntil = null;
    }
    if (s.dueBreak) {
      const kind = s.dueBreak.kind;
      s.dueBreak = null;
      h.enterPreBreak(kind);
      return done();
    }
    const next = nextBreak(s, cfg);
    if (next && next.inMs <= cfg.warningMs) h.enterPreBreak(next.kind);
    return done();
  }

  if (s.phase === 'preBreak') {
    if (idle >= NATURAL_MOMENT_MS) {
      h.startBreak(); // естественный момент: человек как раз оторвался
    } else if (now - s.phaseStartedAt >= cfg.warningMs) {
      if (cfg.dontInterruptTyping && idle < TYPING_PAUSE_MS) h.enter('waitingForPause');
      else h.startBreak();
    }
    return done();
  }

  if (s.phase === 'waitingForPause') {
    if (idle >= TYPING_PAUSE_MS || now - s.phaseStartedAt >= MAX_WAIT_FOR_PAUSE_MS) h.startBreak();
    return done();
  }

  return done();
}

function logNatural(s: SchedulerState, h: Helpers, now: Millis, idle: number): void {
  s.naturalCounted = true;
  h.log({ type: 'natural_break', at: now, idleSec: Math.round(idle / 1000) });
  // Отрезок простоя успел накопиться как «активный» — вычитаем задним числом (R0).
  s.activeSinceLong = Math.max(0, s.activeSinceLong - Math.min(idle, NATURAL_BREAK_IDLE_MS));
  s.activeSinceMicro = 0;
  s.postponesInRow = 0;
}

function endSuppression(
  s: SchedulerState,
  h: Helpers,
  now: Millis,
  cfg: SchedulerConfig,
  withCooldown: boolean,
): void {
  if (!s.suppression) return;
  const duration = now - s.suppression.since;
  h.log({ type: 'suppressed_end', at: now, reason: s.suppression.reason, durationMs: duration });
  if (s.dueBreak && duration >= LONG_SUPPRESSION_MS && cfg.long.enabled)
    s.dueBreak = { ...s.dueBreak, kind: 'long' };
  s.suppression = null;
  s.cooldownUntil = withCooldown ? now + cfg.cooldownMs : null;
  h.enter('working');
}

/** После старта приложения: незавершённый перерыв не воскрешаем, разрыв не копим. */
export function resumeScheduler(prev: SchedulerState, now: Millis): SchedulerState {
  const s: SchedulerState = { ...prev, lastTickAt: null, naturalCounted: false };
  if (BREAK_PHASES.has(s.phase) || s.phase === 'suppressed' || s.phase === 'idle') {
    s.phase = 'working';
    s.phaseStartedAt = now;
    s.pendingKind = null;
    s.breakEndsAt = null;
    s.exerciseId = null;
    s.suppression = null;
  }
  if (s.phase === 'paused' && s.pausedUntil !== null && now >= s.pausedUntil) {
    s.phase = 'working';
    s.pausedUntil = null;
    s.phaseStartedAt = now;
  }
  return s;
}

// ───────────── Представление для UI ─────────────
export interface SchedulerView {
  phase: SchedulerState['phase'];
  pendingKind: BreakKind | null;
  /** Секунд до старта в preBreak (0 — ждём паузы ввода). */
  preBreakSecLeft: number | null;
  next: { kind: BreakKind; inSec: number } | null;
  break: {
    kind: BreakKind;
    exerciseId: string;
    startedAt: Millis;
    endsAt: Millis;
    secLeft: number;
  } | null;
  canSkip: boolean;
  /** Когда появится «Пропустить» (обычная строгость на оверлее). */
  skipAvailableAt: Millis | null;
  canPostpone: boolean;
  strictness: Strictness;
  quiet: { reason: SuppressReason; app: string | null } | null;
  pausedUntil: Millis | null;
}

export function schedulerView(s: SchedulerState, now: Millis, cfg: SchedulerConfig): SchedulerView {
  const next = s.phase === 'working' || s.phase === 'idle' ? nextBreak(s, cfg) : null;
  const onBreak = s.phase === 'onBreak' && s.breakEndsAt !== null && s.pendingKind !== null;
  return {
    phase: s.phase,
    pendingKind: s.pendingKind,
    preBreakSecLeft:
      s.phase === 'preBreak'
        ? Math.max(0, Math.ceil((cfg.warningMs - (now - s.phaseStartedAt)) / 1000))
        : s.phase === 'waitingForPause'
          ? 0
          : null,
    next: next ? { kind: next.kind, inSec: Math.ceil(next.inMs / 1000) } : null,
    break: onBreak
      ? {
          kind: s.pendingKind!,
          exerciseId: s.exerciseId ?? MICRO_EXERCISE.id,
          startedAt: s.phaseStartedAt,
          endsAt: s.breakEndsAt!,
          secLeft: Math.max(0, Math.ceil((s.breakEndsAt! - now) / 1000)),
        }
      : null,
    canSkip: canSkip(s, cfg, now),
    skipAvailableAt:
      s.phase === 'onBreak' && cfg.strictness === 'normal'
        ? s.phaseStartedAt + NORMAL_SKIP_DELAY_MS
        : null,
    canPostpone: canPostpone(s, cfg),
    strictness: cfg.strictness,
    quiet:
      s.phase === 'suppressed' && s.suppression
        ? { reason: s.suppression.reason, app: s.suppression.app }
        : null,
    pausedUntil: s.phase === 'paused' ? s.pausedUntil : null,
  };
}
