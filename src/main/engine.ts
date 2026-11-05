/**
 * Склейка core и окружения (CLAUDE.md): tick раз в секунду, команды из UI, эффекты, снапшот.
 * Electron сюда не импортируется — всё внешнее приходит через EngineDeps (так движок тестируется).
 */
import type { Clock } from '../core/clock';
import { MINUTE } from '../core/clock';
import { dayKey, isOffHours } from '../core/day';
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
  Bubble,
  PersistedState,
  Task,
  TaskItemView,
  TasksView,
  PetVisualState,
  SchedulerState,
  Settings,
  Snapshot,
  SuppressReason,
} from '../core/types';
import { dailyGoal, economyForDay, payCreation } from '../core/economy';
import { parseQuickInput } from '../core/quickParse';
import { rewardBreak, rewardCompletions, rewardWater, revokeTasks } from '../core/rewards';
import {
  completeTask,
  createTask,
  deleteTask,
  openDay,
  removeEmptySubtasks,
  renameTask,
  reorderTasks,
  restoreTasks,
  setReward,
  splitTask,
  todayView,
  uncompleteTask,
  type TasksState,
} from '../core/tasks';
import { selectVisual } from '../core/visual';
import { drink, undoDrink, waterForDay, waterTick, type WaterConfig } from '../core/water';

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
  getTasks: () => TasksState;
  /** Задачи и экономика пишутся с задержкой 500 мс (R0): краш сразу после галочки её не теряет. */
  setTasks: (t: TasksState, delayMs?: number) => void;
  newId: () => string;
  /** Список задач изменился — разослать в окно задач. */
  onTasksChanged?: (v: TasksView) => void;
  /** Начался новый логический день (бэкап и т. п.). */
  onNewDay?: (day: string) => void;
  appendEvent: (e: AppEvent) => void;
  onEffects: (fx: Effect[]) => void;
  /** Debug: последние показания детекторов. */
  getDetectorReadings?: () => NonNullable<Snapshot['debugInfo']>['detectors'];
  debug: boolean;
}

const BUBBLE_DEFAULT_MS = 4000;
const TASK_SAVE_MS = 500;
const UNDO_DELETE_MS = 5000;
const SELF_CARE_HINTS = [
  'hint.lunch',
  'hint.outside',
  'hint.airing',
  'hint.writeClose',
  'hint.sleep',
  'hint.back',
  'hint.notifications',
];
const UNDO_BUBBLE_MS = 30_000;
const REMINDER_BUBBLE_MS = 60_000;
/** R0: созвон дольше 3 ч подряд — спросить, точно ли это созвон. */
export const STILL_ON_CALL_MS = 3 * 60 * MINUTE;

export class Engine {
  private sched: SchedulerState;
  private simSuppression: { reason: SuppressReason; until: number } | null = null;
  private detectorSuppression: { reason: SuppressReason; app: string | null } | null = null;
  private lockedSinceReal: number | null = null;
  private bubble: (Bubble & { untilReal: number }) | null = null;
  private askedStillOnCallFor: number | null = null;
  private hotkeysFailed: string[] = [];
  private lastDeleted: { removed: Task[]; untilReal: number } | null = null;
  private currentDay: string | null = null;
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
    this.rollDay(now);
    const before = this.sched;
    this.apply({
      type: 'tick',
      idleMs: idle,
      suppression,
      offHours: isOffHours(this.d.getSettings().smartPause.workHours, now),
    });
    this.afterTick(before, now);
  }

  /**
   * Смена логического дня (06:00, R0): дневные счётчики экономики и энергия — с нуля,
   * тяжёлый день выключается, задачи — новые экземпляры повторяющихся. Догон нескольких
   * пропущенных дней для серии/заморозок — День 5 (pet.ts).
   */
  private rollDay(now: number): void {
    const day = dayKey(now);
    if (day === this.currentDay) return;
    const st = this.d.getState();
    const wasDay = st.economy.day;
    this.currentDay = day;
    if (wasDay === day) {
      // старт приложения в тот же день — только убедиться, что экземпляры на сегодня есть
      this.saveTasks(openDay(this.d.getTasks(), day, now, () => this.d.newId()).state);
      return;
    }
    this.d.setState(
      {
        ...st,
        economy: economyForDay(st.economy, day),
        pet: { ...st.pet, energyToday: 0, hardDay: false },
        water: waterForDay(st.water, day),
      },
      0,
    );
    if (st.pet.hardDay) this.d.appendEvent({ type: 'hard_day_off', at: now });
    this.saveTasks(openDay(this.d.getTasks(), day, now, () => this.d.newId()).state);
    this.d.onNewDay?.(day);
  }

  /** Вода и «всё ещё на созвоне?» — после шага планировщика. */
  private afterTick(before: SchedulerState, now: number): void {
    const after = this.sched;
    // Активное время за tick = прирост длинного таймера (сброс после перерыва даёт 0 — это 1 с, не важно).
    const activeDelta = Math.max(0, after.activeSinceLong - before.activeSinceLong);
    const st = this.d.getState();
    const water0 = waterForDay(st.water, dayKey(now));
    const r = waterTick(
      water0,
      {
        activeDeltaMs: activeDelta,
        need: st.pet.needs.water,
        now,
        canRemind: after.phase === 'working',
      },
      this.waterCfg(),
    );
    if (r.water !== st.water) this.d.setState({ ...this.d.getState(), water: r.water }, 10_000);
    if (r.remind && !this.bubble) {
      this.setBubble(
        {
          textKey: 'water.reminder',
          actions: [{ labelKey: 'water.drinkNow', action: 'water:drink' }],
        },
        REMINDER_BUBBLE_MS,
      );
    }
    const sup = after.suppression;
    if (
      after.phase === 'suppressed' &&
      sup &&
      (sup.reason === 'mic' || sup.reason === 'camera') &&
      now - sup.since >= STILL_ON_CALL_MS &&
      this.askedStillOnCallFor !== sup.since
    ) {
      this.askedStillOnCallFor = sup.since;
      this.setBubble(
        {
          textKey: 'quiet.stillOnCall',
          params: { app: sup.app ?? '?' },
          actions: [
            { labelKey: 'quiet.yesCall', action: 'dismiss' },
            { labelKey: 'quiet.notACall', action: 'quiet:ignoreApp' },
          ],
        },
        10 * MINUTE,
      );
    }
  }

  private waterCfg(): WaterConfig {
    const w = this.d.getSettings().water;
    return { goalGlasses: w.goalGlasses, remindAfterMs: w.remindAfterMin * MINUTE };
  }

  /** Стакан воды (виджет, хоткей, трей): питомец пьёт, 30 с можно отменить. */
  drinkWater(): void {
    const now = this.d.clock.now();
    const st = this.d.getState();
    const r = drink(waterForDay(st.water, dayKey(now)), st.pet.needs.water, now, this.waterCfg());
    const rw = rewardWater(st.economy, r.overGoal);
    this.d.setState(
      {
        ...st,
        water: r.water,
        economy: rw.economy,
        pet: {
          ...st.pet,
          energyToday: st.pet.energyToday + rw.reward.energy,
          needs: { ...st.pet.needs, water: r.need },
        },
      },
      0,
    );
    r.events.forEach((e) => this.d.appendEvent(e));
    this.setBubble(
      {
        textKey: r.overGoal ? 'water.drankOverGoal' : 'water.drank',
        params: { n: r.water.glasses, goal: this.waterCfg().goalGlasses },
        actions: [{ labelKey: 'water.undo', action: 'water:undo' }],
      },
      UNDO_BUBBLE_MS,
    );
    this.d.onEffects([{ type: 'petReaction', reaction: 'drink' }]);
  }

  undoWater(): void {
    const now = this.d.clock.now();
    const st = this.d.getState();
    const r = undoDrink(st.water, st.pet.needs.water, now);
    if (!r) return;
    // Отмена стакана откатывает его награду (без ухода в минус).
    const overGoal = st.water.glasses > this.waterCfg().goalGlasses;
    const back = overGoal ? { energy: 0, coins: 0 } : { energy: 1, coins: 1 };
    this.d.setState(
      {
        ...st,
        water: r.water,
        economy: { ...st.economy, coins: Math.max(0, st.economy.coins - back.coins) },
        pet: {
          ...st.pet,
          energyToday: Math.max(0, st.pet.energyToday - back.energy),
          needs: { ...st.pet.needs, water: r.need },
        },
      },
      0,
    );
    r.events.forEach((e) => this.d.appendEvent(e));
    this.setBubble({ textKey: 'water.undone' }, 2500);
    this.d.onEffects([]);
  }

  dismissBubble(): void {
    this.bubble = null;
  }

  setHotkeysFailed(names: string[]): void {
    this.hotkeysFailed = names;
  }

  // ───────────── Задачи ─────────────
  private saveTasks(t: TasksState): void {
    this.d.setTasks(t, TASK_SAVE_MS);
    this.d.onTasksChanged?.(this.tasksView());
  }

  tasksView(): TasksView {
    const now = this.d.clock.now();
    const v = todayView(this.d.getTasks(), dayKey(now), dayKey);
    const item = (i: (typeof v.open)[number]): TaskItemView => ({
      id: i.task.id,
      title: i.task.title,
      size: i.task.size,
      recurring: i.recurring,
      remindAt: i.task.remindAt ?? null,
      done: !!i.task.doneAt,
      children: i.children.map((c) => ({ id: c.id, title: c.title, done: !!c.doneAt })),
    });
    const settings = this.d.getSettings();
    return {
      open: v.open.map(item),
      done: v.done.map(item),
      counts: v.counts,
      canUndoDelete: !!this.lastDeleted && this.d.realNow() < this.lastDeleted.untilReal,
      hints: settings.tasks.showSelfCareHints ? SELF_CARE_HINTS : [],
      defaultSize: settings.tasks.defaultSize,
    };
  }

  /** Быстрый ввод: разбор префиксов, +1 монета за создание (≤ 5 в день). Пустой ввод — ничего. */
  createTaskFromText(text: string): string | null {
    const parsed = parseQuickInput(text, this.d.getSettings().tasks.defaultSize);
    if (!parsed) return null;
    const now = this.d.clock.now();
    const r = createTask(
      this.d.getTasks(),
      parsed,
      { id: this.d.newId(), instanceId: this.d.newId() },
      now,
      dayKey(now),
    );
    const st = this.d.getState();
    const pay = payCreation(economyForDay(st.economy, dayKey(now)));
    this.d.setState({ ...st, economy: pay.economy }, TASK_SAVE_MS);
    const shown = r.task ?? r.template!;
    this.d.appendEvent({
      type: 'task_created',
      at: now,
      taskId: shown.id,
      size: shown.size,
      coins: pay.paid,
    });
    this.saveTasks(r.state);
    return shown.id;
  }

  completeTask(id: string): void {
    const now = this.d.clock.now();
    const done = completeTask(this.d.getTasks(), id, now);
    if (!done.completed.length) return;
    const st = this.d.getState();
    const r = rewardCompletions(economyForDay(st.economy, dayKey(now)), done.completed);
    let tasks = done.state;
    for (const p of r.paid) {
      tasks = setReward(tasks, p.taskId, {
        rewardPaid: { energy: p.energy, coins: p.coins },
        rewardRevoked: undefined,
      });
      this.d.appendEvent({
        type: 'task_completed',
        at: now,
        taskId: p.taskId,
        energy: p.energy,
        coins: p.coins,
        surprise: p.surprise,
      });
    }
    this.d.setState(
      {
        ...st,
        economy: r.economy,
        pet: { ...st.pet, energyToday: st.pet.energyToday + r.energyDelta },
      },
      TASK_SAVE_MS,
    );
    this.saveTasks(tasks);
    const coins = r.paid.reduce((n, p) => n + p.coins, 0);
    const surprise = r.paid.some((p) => p.surprise);
    this.d.onEffects([
      { type: 'petReaction', reaction: 'coinCatch' },
      { type: 'coins', count: coins, surprise },
    ]);
  }

  uncompleteTask(id: string): void {
    const now = this.d.clock.now();
    const u = uncompleteTask(this.d.getTasks(), id);
    if (!u.uncompleted.length) return;
    const st = this.d.getState();
    const r = revokeTasks(st.economy, st.pet.energyToday, u.uncompleted);
    let tasks = u.state;
    for (const x of r.revoked) {
      tasks = setReward(tasks, x.taskId, {
        rewardPaid: undefined,
        rewardRevoked: { energy: x.energy, coins: x.coins },
      });
      this.d.appendEvent({
        type: 'task_uncompleted',
        at: now,
        taskId: x.taskId,
        energy: x.energy,
        coins: x.coins,
      });
    }
    this.d.setState(
      { ...st, economy: r.economy, pet: { ...st.pet, energyToday: r.energyToday } },
      TASK_SAVE_MS,
    );
    this.saveTasks(tasks);
  }

  splitTask(id: string): void {
    const now = this.d.clock.now();
    const r = splitTask(
      this.d.getTasks(),
      id,
      [this.d.newId(), this.d.newId(), this.d.newId()],
      now,
    );
    if (!r.created.length) return;
    this.d.appendEvent({ type: 'task_split', at: now, taskId: id, count: r.created.length });
    this.saveTasks(r.state);
  }

  renameTask(id: string, title: string): void {
    this.saveTasks(renameTask(this.d.getTasks(), id, String(title).slice(0, 200)));
  }

  blurSubtasks(parentId: string): void {
    this.saveTasks(removeEmptySubtasks(this.d.getTasks(), parentId));
  }

  deleteTask(id: string): void {
    const r = deleteTask(this.d.getTasks(), id);
    if (!r.removed.length) return;
    this.lastDeleted = { removed: r.removed, untilReal: this.d.realNow() + UNDO_DELETE_MS };
    this.saveTasks(r.state);
  }

  undoDelete(): void {
    if (!this.lastDeleted || this.d.realNow() >= this.lastDeleted.untilReal) return;
    const removed = this.lastDeleted.removed;
    this.lastDeleted = null;
    this.saveTasks(restoreTasks(this.d.getTasks(), removed));
  }

  reorderTasks(ids: string[]): void {
    this.saveTasks(
      reorderTasks(
        this.d.getTasks(),
        ids.filter((x) => typeof x === 'string'),
      ),
    );
  }

  /** Перерыв досижен — награда (R0). */
  private rewardFinishedBreak(kind: BreakKind): void {
    const st = this.d.getState();
    const r = rewardBreak(economyForDay(st.economy, dayKey(this.d.clock.now())), kind);
    this.d.setState(
      {
        ...st,
        economy: r.economy,
        pet: { ...st.pet, energyToday: st.pet.energyToday + r.reward.energy },
      },
      0,
    );
  }

  private setBubble(b: Bubble, ttlMs: number): void {
    this.bubble = { ...b, untilReal: this.d.realNow() + ttlMs };
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
    this.setBubble({ textKey, ...(params ? { params } : {}) }, ttlMs);
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
      tasksToday: todayView(this.d.getTasks(), dayKey(now), dayKey).counts,
      economy: {
        coins: st.economy.coins,
        energyToday: st.pet.energyToday,
        goal: dailyGoal(st.pet.hardDay),
      },
      sounds: { enabled: settings.pet.sounds, volume: settings.pet.volume },
      scheduler: view,
      overlayOpacity: settings.breaks.overlayOpacity,
      bubble: this.bubble ? (({ untilReal: _u, ...b }) => b)(this.bubble) : null,
      water: {
        glasses: waterForDay(st.water, dayKey(now)).glasses,
        goal: settings.water.goalGlasses,
      },
      hotkeysFailed: this.hotkeysFailed,
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
            detectors: this.d.getDetectorReadings?.() ?? null,
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
      if (e.type === 'breakFinished' && e.completed) this.rewardFinishedBreak(e.kind);
    }
    // Состояние пишем не чаще раза в 10 с (SPEC 6); команды пользователя — сразу.
    this.d.setState(
      { ...this.d.getState(), scheduler: this.sched },
      ev.type === 'tick' ? 10_000 : 0,
    );
    if (r.effects.length) this.d.onEffects(r.effects);
  }
}
