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
  BubbleAction,
  HomeStats,
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
import {
  dailyGoal,
  economyForDay,
  payBlinkPosture,
  payCoins,
  payCreation,
  REWARDS,
} from '../core/economy';
import { FIRST_AID, pickLine } from '../core/lines';
import {
  catchUpDays,
  decayNeeds,
  goalReached,
  morningPet,
  needsAfterBreak,
  needsAfterNaturalBreak,
  needsPose,
  STAGE_MIN_DAYS,
  STAGE_ORDER,
  stageFor,
} from '../core/pet';
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
import { dayScore, lastDays, prevDayKey, statsByDay } from '../core/stats';
import { selectVisual } from '../core/visual';
import { addDiary, adventureDue, finishAdventure, startAdventure } from '../core/adventure';
import { questionFor, shouldAskEvening } from '../core/evening';
import { blinkPostureKinds, cleanGoals, shouldReviewGoals, type Goals } from '../core/goals';
import { chance } from '../core/hash';
import {
  addCompletion,
  JOURNEY_IDS,
  JOURNEY_TEMPLATES,
  MILESTONE_COINS,
  MILESTONE_REWARD,
  newJourney,
  nextMilestone,
  type JourneyTemplate,
} from '../core/journeys';
import { BIG_TASK_EGG_PCT, giveEgg, hatchEggs, toggleShown } from '../core/microPets';
import { restoreGoal, tryRestoreStreak } from '../core/pet';
import { dueReminders } from '../core/reminders';
import {
  buyItem,
  buyTreat,
  giftItem,
  isFoodTask,
  takeTreat,
  toggleItem,
  TREAT_IDS,
  TREATS,
  WARDROBE,
} from '../core/shop';
import { favoriteFood, revealTrait, traitLine } from '../core/traits';
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
  /** Лог событий за текущий и прошлый месяц (для «Дома питомца»). */
  readEvents?: () => AppEvent[];
  /** Системная тема (nativeTheme). */
  theme?: () => 'light' | 'dark';
  appendEvent: (e: AppEvent) => void;
  onEffects: (fx: Effect[]) => void;
  /** Debug: последние показания детекторов. */
  getDetectorReadings?: () => NonNullable<Snapshot['debugInfo']>['detectors'];
  debug: boolean;
  /** Перевод i18n-ключа (названия задач Путей пишутся в tasks.json уже переведёнными). */
  t?: (key: string) => string;
}

/** Время суток для окошка островка (SPEC 4.10): меняется не чаще раза в минуту. */
export function timeOfDay(ts: number): 'morning' | 'day' | 'evening' | 'night' {
  const h = new Date(ts).getHours();
  if (h >= 6 && h < 11) return 'morning';
  if (h >= 11 && h < 18) return 'day';
  if (h >= 18 && h < 22) return 'evening';
  return 'night';
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
  private lastChatterAt: number | null = null;
  /** Случайность для реплик (в тестах подменяется). */
  random: () => number = Math.random;
  private visualOverride: PetVisualState | null = null;
  private lastIdleMs = 0;
  private fakeIdleMs: number | null = null;
  /** «Моргни/выпрямись»: активное время с прошлого напоминания и чьё оно было. */
  private bpActiveMs = 0;
  private bpLast: 'blink' | 'posture' | null = null;

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
    // Закрыть прошлый день (и все пропущенные, если приложение было закрыто): серия, заморозки, рост.
    let pet = st.pet;
    if (wasDay) {
      this.d.appendEvent({
        type: 'day_closed',
        at: now,
        day: wasDay,
        activeMs: st.activity.day === wasDay ? st.activity.activeMs : 0,
        energy: pet.energyToday,
        goalReached: pet.goalDay === wasDay || goalReached(pet),
      });
      const r = catchUpDays(
        pet,
        { day: wasDay, goalReached: pet.goalDay === wasDay || goalReached(pet) },
        day,
        this.d.getSettings().smartPause.workHours,
        now,
      );
      pet = r.pet;
      r.events.forEach((e) => this.d.appendEvent(e));
      for (const e of r.events) {
        if (e.type === 'egg_hatched')
          pet = addDiary(pet, { at: now, kind: 'hatch', loot: { microPetId: e.microPetId } });
        if (e.type === 'egg_received' && e.source === 'streak')
          pet = addDiary(pet, { at: now, kind: 'egg', params: { source: 'streak' } });
      }
      if (r.events.some((e) => e.type === 'stage_up')) {
        // SPEC 4.5: на новой стадии раскрывается черта характера.
        const tr = revealTrait(pet, this.random());
        pet = tr.pet;
        if (tr.traitId) {
          pet = addDiary(pet, { at: now, kind: 'trait', loot: { traitId: tr.traitId } });
          this.d.appendEvent({ type: 'trait_revealed', at: now, traitId: tr.traitId });
        }
        this.setBubble({ textKey: 'pet.grew' }, 8000);
        this.d.onEffects([{ type: 'petReaction', reaction: 'celebrate' }]);
      }
    }
    this.d.setState(
      {
        ...st,
        economy: economyForDay(st.economy, day),
        pet: morningPet(pet),
        water: waterForDay(st.water, day),
        activity: { day, activeMs: 0 },
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
    // Потребности убывают в активное время (R0: и на созвоне — человек у экрана).
    const needs = decayNeeds(st.pet.needs, activeDelta);
    const today = dayKey(now);
    const activity =
      activeDelta > 0 || st.activity.day !== today
        ? {
            day: today,
            activeMs: (st.activity.day === today ? st.activity.activeMs : 0) + activeDelta,
          }
        : st.activity;
    if (r.water !== st.water || needs !== st.pet.needs || activity !== st.activity) {
      this.d.setState(
        {
          ...this.d.getState(),
          water: r.water,
          activity,
          pet: { ...this.d.getState().pet, needs },
        },
        10_000,
      );
    }
    this.celebrateGoal(now);
    this.maybeRestoreStreak(now);
    this.maybeReturnFromAdventure(now, after);
    this.maybeCheckin(now, after);
    this.maybeEvening(now, after);
    this.maybeRemind(now, after);
    this.maybeBlinkPosture(activeDelta, after);
    this.maybeReviewGoals(now, after);
    this.maybeChatter(now, after);
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

  /**
   * Цель дня достигнута — радуемся один раз за день и уходим в приключение (SPEC 4.4):
   * 30 мин, записка в виджете; перерывы при этом работают.
   */
  private celebrateGoal(now: number): void {
    const st = this.d.getState();
    const day = dayKey(now);
    if (st.pet.goalDay === day || !goalReached(st.pet)) return;
    const pet = startAdventure({ ...st.pet, goalDay: day }, now);
    this.d.setState({ ...st, pet }, 0);
    if (pet.adventure)
      this.d.appendEvent({
        type: 'adventure_started',
        at: now,
        returnsAt: pet.adventure.returnsAt,
      });
    if (this.sched.phase === 'suppressed') return; // на созвоне — молча (SPEC 2.1)
    this.setBubble({ textKey: 'goal.reached' }, 6000);
    this.d.onEffects([{ type: 'petReaction', reaction: 'celebrate' }]);
  }

  /** Вернулся из приключения — история и находка. Во время перерыва и созвона ждём. */
  private maybeReturnFromAdventure(now: number, s: SchedulerState): void {
    const st = this.d.getState();
    if (!adventureDue(st.pet, now) || this.bubble) return; // не перебивать другое облачко
    if (s.phase !== 'working' && s.phase !== 'offHours' && s.phase !== 'idle') return;
    const r = finishAdventure(st.pet, now, this.random);
    const economy = payCoins(economyForDay(st.economy, dayKey(now)), r.coins);
    this.d.setState({ ...st, pet: r.pet, economy }, 0);
    this.d.appendEvent({
      type: 'adventure_finished',
      at: now,
      storyKey: (r.entry.parts ?? []).join('|'),
      coins: r.coins,
    });
    if (r.entry.loot?.traitId)
      this.d.appendEvent({ type: 'trait_revealed', at: now, traitId: r.entry.loot.traitId });
    if (r.entry.loot?.egg)
      this.d.appendEvent({ type: 'egg_received', at: now, source: 'adventure' });
    this.setBubble(
      {
        textKey: 'adv.back',
        params: { coins: r.coins },
        parts: r.entry.parts ?? [],
        actions: [{ labelKey: 'adv.diary', action: 'adventure:diary' }],
      },
      30_000,
    );
    this.d.onEffects([
      { type: 'petReaction', reaction: 'celebrate' },
      { type: 'coins', count: r.coins, surprise: !!(r.entry.loot?.itemId || r.entry.loot?.egg) },
    ]);
  }

  /** «День-догонялка» (SPEC 4.3): набрал цель ×1,5 — серия вернулась. */
  private maybeRestoreStreak(now: number): void {
    const st = this.d.getState();
    if (!st.pet.streakRestore) return;
    const r = tryRestoreStreak(st.pet, now);
    if (r.pet === st.pet) return;
    this.d.setState({ ...st, pet: r.pet }, 0);
    if (!r.restored) return;
    this.d.appendEvent({ type: 'streak_restored', at: now });
    this.setBubble({ textKey: 'streak.restored', params: { n: r.pet.streak } }, 8000);
    this.d.onEffects([{ type: 'petReaction', reaction: 'celebrate' }]);
  }

  /** Вечерний вопрос (SPEC 4.6, P1): один раз, мягко; ответ — в «Доме питомца» → Дневник. */
  private maybeEvening(now: number, s: SchedulerState): void {
    const st = this.d.getState();
    const day = dayKey(now);
    if (this.bubble || (s.phase !== 'working' && s.phase !== 'offHours')) return;
    if (this.lastIdleMs > 60_000) return;
    if (!shouldAskEvening(st.pet, day, now, this.d.getSettings().smartPause.workHours)) return;
    const questionKey = questionFor(day);
    this.d.setState(
      { ...st, pet: { ...st.pet, evening: { day, questionKey, answered: false } } },
      0,
    );
    this.setBubble(
      {
        textKey: questionKey,
        actions: [
          { labelKey: 'evening.answer', action: 'evening:answer' },
          { labelKey: 'evening.skip', action: 'dismiss' },
        ],
      },
      5 * MINUTE,
    );
  }

  /** Ответ на вечерний вопрос — локально, в дневник. Без выводов и советов. */
  answerEvening(text: string): void {
    const now = this.d.clock.now();
    const st = this.d.getState();
    const day = dayKey(now);
    const clean = String(text ?? '')
      .trim()
      .slice(0, 1000);
    if (!clean) return;
    const questionKey =
      st.pet.evening.day === day && st.pet.evening.questionKey
        ? st.pet.evening.questionKey
        : questionFor(day);
    const pet = addDiary(
      { ...st.pet, evening: { day, questionKey, answered: true } },
      { at: now, kind: 'evening', questionKey, text: clean },
    );
    this.d.setState({ ...st, pet }, 0);
    this.d.appendEvent({ type: 'evening_answer', at: now, questionKey, text: clean });
    this.bubble = null;
    this.setBubble({ textKey: 'evening.thanks' }, 4000);
    this.d.onEffects([{ type: 'petReaction', reaction: 'hug' }]);
  }

  /**
   * «Моргни / выпрямись» (SPEC 2.4 blinkPosture, P1): раз в N минут активного времени, по очереди.
   * Только в обычной работе, без облачка поверх другого; «ок» — +1 энергии (≤ 6 в день).
   */
  private maybeBlinkPosture(activeDelta: number, s: SchedulerState): void {
    const bp = this.d.getSettings().blinkPosture;
    if (!bp.enabled) return;
    this.bpActiveMs += activeDelta;
    if (this.bpActiveMs < bp.intervalMin * MINUTE) return;
    if (this.bubble || s.phase !== 'working' || this.d.getState().pet.adventure) return;
    const kinds = blinkPostureKinds(this.d.getState().goals);
    const kind = kinds.length > 1 && this.bpLast === kinds[0] ? kinds[1]! : kinds[0]!;
    this.bpLast = kind;
    this.bpActiveMs = 0;
    this.setBubble(
      {
        textKey: kind === 'blink' ? 'bp.blink' : 'bp.posture',
        actions: [
          { labelKey: 'bp.ok', action: 'bp:ok' },
          { labelKey: 'bp.later', action: 'dismiss' },
        ],
      },
      MINUTE,
    );
    this.d.onEffects([
      { type: 'petReaction', reaction: kind === 'posture' ? 'straighten' : 'bounce' },
    ]);
  }

  /** «Моргнул/выпрямился — ок». */
  ackBlinkPosture(): void {
    const now = this.d.clock.now();
    const st = this.d.getState();
    const r = payBlinkPosture(economyForDay(st.economy, dayKey(now)));
    this.d.setState(
      {
        ...st,
        economy: r.economy,
        pet: { ...st.pet, energyToday: st.pet.energyToday + r.reward.energy },
      },
      0,
    );
    this.d.appendEvent({ type: this.bpLast === 'posture' ? 'posture_ack' : 'blink_ack', at: now });
    this.bubble = null;
    this.setBubble({ textKey: 'bp.thanks' }, 2500);
  }

  /** Через неделю после выбора целей — один раз мягко спросить, не поменять ли (без давления). */
  private maybeReviewGoals(now: number, s: SchedulerState): void {
    const st = this.d.getState();
    if (this.bubble || s.phase !== 'working' || !shouldReviewGoals(st.goals, now)) return;
    this.d.setState({ ...st, goals: { ...st.goals, reviewAsked: true } }, 0);
    this.setBubble(
      {
        textKey: 'goals.review',
        actions: [
          { labelKey: 'goals.reviewOpen', action: 'goals:open' },
          { labelKey: 'goals.reviewKeep', action: 'dismiss' },
        ],
      },
      5 * MINUTE,
    );
  }

  /** Сохранить цели (онбординг / «Мои цели»). Подстройку настроек делает main (adaptSettings). */
  setGoals(raw: unknown): Goals {
    const now = this.d.clock.now();
    const goals = cleanGoals(raw, now);
    const st = this.d.getState();
    this.d.setState({ ...st, goals }, 0);
    return goals;
  }

  /** Стартовый план: мелкие ежедневные дела (i18n-ключи → переведённые названия). Без монет за создание. */
  addPlanTasks(keys: string[]): void {
    const now = this.d.clock.now();
    const today = dayKey(now);
    const tr = this.d.t ?? ((k: string) => k);
    let ts = this.d.getTasks();
    for (const key of keys.filter((k) => typeof k === 'string' && /^plan\.[a-zA-Z]+$/.test(k))) {
      const title = tr(key);
      if (ts.tasks.some((t) => t.title === title && t.recurrence.kind !== 'none')) continue;
      ts = createTask(
        ts,
        { title, size: 'S', recurrence: { kind: 'daily' } },
        { id: this.d.newId(), instanceId: this.d.newId() },
        now,
        today,
      ).state;
    }
    this.saveTasks(ts);
  }

  /** Напоминание по времени (SPEC 5.1, P1): облачко с задачей; на умной паузе — после неё. */
  private maybeRemind(now: number, s: SchedulerState): void {
    if (this.bubble || s.phase !== 'working') return;
    const st = this.d.getState();
    const day = dayKey(now);
    const already = st.pet.reminded.day === day ? st.pet.reminded.ids : [];
    const v = todayView(this.d.getTasks(), day, dayKey);
    const open = v.open.map((i) => i.task);
    const due = dueReminders(open, now, already);
    if (!due.length) return;
    const t = due[0]!;
    this.d.setState({ ...st, pet: { ...st.pet, reminded: { day, ids: [...already, t.id] } } }, 0);
    this.setBubble(
      {
        textKey: 'task.reminder',
        params: { title: t.title },
        actions: [
          { labelKey: 'task.reminderDone', action: `task:done:${t.id}` },
          { labelKey: 'task.reminderLater', action: 'dismiss' },
        ],
      },
      5 * MINUTE,
    );
    this.d.onEffects([{ type: 'petReaction', reaction: 'bounce' }]);
  }

  /**
   * Чек-ин (SPEC 4.6): питомец спрашивает сам, первым, при первой активности дня.
   * R0: можно и вне рабочих часов, но не на созвоне. Игнор — облачко уходит через 3 мин, без последствий.
   */
  private maybeCheckin(now: number, s: SchedulerState): void {
    const st = this.d.getState();
    const day = dayKey(now);
    if (st.pet.checkin.day === day || this.bubble) return;
    if (s.phase !== 'working' && s.phase !== 'offHours') return;
    if (this.lastIdleMs > 20_000) return; // ждём, пока человек начнёт что-то делать
    this.d.setState({ ...st, pet: { ...st.pet, checkin: { day, mood: null } } }, 0);
    this.offerCheckin();
  }

  private offerCheckin(): void {
    const faces = ['😞', '😕', '😐', '🙂', '😄'];
    this.setBubble(
      {
        textKey: 'checkin.question',
        actions: faces.map((f, i) => ({
          labelKey: f,
          action: `checkin:${(i + 1) as 1 | 2 | 3 | 4 | 5}` as BubbleAction,
        })),
      },
      3 * MINUTE,
    );
  }

  answerCheckin(m: 1 | 2 | 3 | 4 | 5): void {
    const now = this.d.clock.now();
    const st = this.d.getState();
    const day = dayKey(now);
    if (st.pet.checkin.day === day && st.pet.checkin.mood !== null) return;
    const economy = payCoins(economyForDay(st.economy, day), REWARDS.checkin.coins);
    this.d.setState(
      {
        ...st,
        economy,
        pet: {
          ...st.pet,
          checkin: { day, mood: m },
          energyToday: st.pet.energyToday + REWARDS.checkin.energy,
        },
      },
      0,
    );
    this.d.appendEvent({ type: 'mood_checkin', at: now, mood: m });
    // Реакция по тону. Никаких выводов и советов на основе настроения (SPEC 4.6).
    if (m >= 4) {
      this.setBubble({ textKey: 'checkin.great' }, 3500);
      this.d.onEffects([{ type: 'petReaction', reaction: 'celebrate' }]);
    } else if (m === 3) {
      this.setBubble({ textKey: 'checkin.ok' }, 3500);
      this.d.onEffects([{ type: 'petReaction', reaction: 'bounce' }]);
    } else if (m === 2) {
      this.setBubble({ textKey: 'checkin.meh' }, 4000);
      this.d.onEffects([{ type: 'petReaction', reaction: 'hug' }]);
    } else {
      this.setBubble(
        {
          textKey: 'checkin.hard',
          actions: st.pet.hardDay
            ? []
            : [
                { labelKey: 'checkin.hardOn', action: 'hardDay:on' },
                { labelKey: 'checkin.later', action: 'dismiss' },
              ],
        },
        60_000,
      );
      this.d.onEffects([{ type: 'petReaction', reaction: 'hug' }]);
    }
  }

  /** «Тяжёлый день» (SPEC 5.6): цель 10, мягкая строгость, только поддержка, «Аптечка». До 06:00. */
  setHardDay(on: boolean): void {
    const now = this.d.clock.now();
    const st = this.d.getState();
    if (st.pet.hardDay === on) return;
    this.d.setState({ ...st, pet: { ...st.pet, hardDay: on } }, 0);
    this.d.appendEvent({ type: on ? 'hard_day_on' : 'hard_day_off', at: now });
    this.setBubble({ textKey: on ? 'hardDay.on' : 'hardDay.off' }, 5000);
    if (on) this.d.onEffects([{ type: 'petReaction', reaction: 'hug' }]);
    this.d.onTasksChanged?.(this.tasksView());
  }

  /** Действие «Аптечки»: +1 энергия, +1 монета, по разу в день. */
  firstAid(id: string): void {
    const now = this.d.clock.now();
    const st = this.d.getState();
    const day = dayKey(now);
    if (!st.pet.hardDay || !(FIRST_AID as readonly string[]).includes(id)) return;
    const done = st.pet.firstAid.day === day ? st.pet.firstAid.done : [];
    if (done.includes(id)) return;
    this.d.setState(
      {
        ...st,
        economy: payCoins(economyForDay(st.economy, day), REWARDS.firstAid.coins),
        pet: {
          ...st.pet,
          firstAid: { day, done: [...done, id] },
          energyToday: st.pet.energyToday + REWARDS.firstAid.energy,
        },
      },
      TASK_SAVE_MS,
    );
    this.d.appendEvent({
      type: 'task_completed',
      at: now,
      taskId: `firstAid:${id}`,
      energy: REWARDS.firstAid.energy,
      coins: REWARDS.firstAid.coins,
      surprise: false,
    });
    this.d.onEffects([
      { type: 'petReaction', reaction: 'coinCatch' },
      { type: 'coins', count: REWARDS.firstAid.coins, surprise: false },
    ]);
    this.d.onTasksChanged?.(this.tasksView());
  }

  /** Клик по питомцу: не ответил на чек-ин — спросить снова; иначе короткая реплика. */
  petClicked(): void {
    const now = this.d.clock.now();
    const st = this.d.getState();
    if (st.pet.checkin.day === dayKey(now) && st.pet.checkin.mood === null) {
      this.offerCheckin();
      return;
    }
    if (this.sched.phase === 'suppressed' || this.bubble) return;
    this.say(now, true);
  }

  /** Реплики без повода — не чаще раза в 10 (часто) / 30 (редко) мин; на умной паузе — ни одной. */
  private maybeChatter(now: number, s: SchedulerState): void {
    const chatter = this.d.getSettings().pet.chatter;
    if (chatter === 'off' || s.phase !== 'working' || this.bubble) return;
    const gap = (chatter === 'often' ? 10 : 30) * MINUTE;
    if (this.lastChatterAt === null) this.lastChatterAt = now;
    if (now - this.lastChatterAt < gap) return;
    if (this.random() > 0.01) return; // не по будильнику — примерно раз в 100 с после окна
    this.say(now, false);
  }

  private say(now: number, click: boolean): void {
    const st = this.d.getState();
    // Раскрытые черты характера добавляют свои реплики (SPEC 4.5); в тяжёлый день — только поддержка.
    const trait = !st.pet.hardDay && this.random() < 0.25 ? traitLine(st.pet, this.random()) : null;
    const key =
      trait ??
      pickLine(
        {
          hour: new Date(now).getHours(),
          pose: needsPose(st.pet.needs),
          hardDay: st.pet.hardDay,
          click,
        },
        this.random(),
      );
    this.lastChatterAt = now;
    this.setBubble({ textKey: key }, 3000);
  }

  /** Debug-кнопки (SQUISH_DEBUG). */
  debugPet(cmd: 'careDay' | 'stageUp' | 'needsLow' | 'energy' | 'coins'): void {
    const st = this.d.getState();
    let pet = st.pet;
    let economy = st.economy;
    if (cmd === 'careDay')
      pet = { ...pet, careDays: pet.careDays + 1, stage: stageFor(pet.careDays + 1) };
    if (cmd === 'stageUp') {
      const next =
        STAGE_ORDER[Math.min(STAGE_ORDER.length - 1, STAGE_ORDER.indexOf(pet.stage) + 1)]!;
      pet = { ...pet, stage: next, careDays: Math.max(pet.careDays, STAGE_MIN_DAYS[next]) };
    }
    if (cmd === 'needsLow') pet = { ...pet, needs: { water: 10, eyes: 10, movement: 10 } };
    if (cmd === 'energy') pet = { ...pet, energyToday: pet.energyToday + 10 };
    if (cmd === 'coins') economy = { ...economy, coins: economy.coins + 50 };
    this.d.setState({ ...st, pet, economy }, 0);
  }

  /** Debug (Неделя 2): приключение сейчас / вернуться, яйцо, вылупить, вечерний вопрос, черта. */
  debugWeek2(cmd: 'adventure' | 'return' | 'egg' | 'hatch' | 'evening' | 'trait'): void {
    const now = this.d.clock.now();
    const st = this.d.getState();
    let pet = st.pet;
    if (cmd === 'adventure') pet = startAdventure({ ...pet, adventure: null }, now);
    if (cmd === 'return' && pet.adventure)
      pet = { ...pet, adventure: { ...pet.adventure, returnsAt: now } };
    if (cmd === 'egg') pet = giveEgg(pet, 'debug', now, `debug:${now}`);
    if (cmd === 'hatch')
      pet = { ...pet, eggs: pet.eggs.map((e) => ({ ...e, careDaysAtReceive: pet.careDays - 3 })) };
    if (cmd === 'trait') pet = revealTrait(pet, this.random()).pet;
    if (cmd === 'evening')
      pet = { ...pet, evening: { day: '', questionKey: null, answered: false } };
    this.d.setState({ ...st, pet }, 0);
    if (cmd === 'hatch') {
      // вылупление — при закрытии дня; в debug — сразу
      const h = hatchEggs(this.d.getState().pet, now).pet;
      this.d.setState({ ...this.d.getState(), pet: h }, 0);
    }
    if (cmd === 'evening') {
      this.bubble = null;
      const day = dayKey(now);
      const questionKey = questionFor(day);
      this.d.setState(
        {
          ...this.d.getState(),
          pet: { ...this.d.getState().pet, evening: { day, questionKey, answered: false } },
        },
        0,
      );
      this.setBubble(
        {
          textKey: questionKey,
          actions: [
            { labelKey: 'evening.answer', action: 'evening:answer' },
            { labelKey: 'evening.skip', action: 'dismiss' },
          ],
        },
        5 * MINUTE,
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

  /** «Дом питомца»: сегодня и неделя из лога событий + текущее состояние. */
  homeStats(): HomeStats {
    const st = this.d.getState();
    const settings = this.d.getSettings();
    const now = this.d.clock.now();
    const today = dayKey(now);
    const byDay = statsByDay(this.d.readEvents?.() ?? [], dayKey);
    const week = lastDays(byDay, today, prevDayKey);
    const t = week[week.length - 1]!;
    const energyGoal = dailyGoal(st.pet.hardDay);
    const todayStats = {
      ...t,
      energy: st.pet.energyToday,
      activeMs: st.activity.day === today ? st.activity.activeMs : 0,
      goalReached: goalReached(st.pet),
    };
    return {
      today: {
        ...todayStats,
        score: dayScore(todayStats, settings.water.goalGlasses, energyGoal),
        waterGoal: settings.water.goalGlasses,
        energyGoal,
      },
      week: week.map((d) => {
        const x = d.day === today ? todayStats : d;
        return { ...x, score: dayScore(x, settings.water.goalGlasses, dailyGoal(false)) };
      }),
      pet: {
        name: st.pet.name,
        species: st.pet.species,
        accessories: st.pet.accessories,
        stage: st.pet.stage,
        palette: st.pet.palette,
        careDays: st.pet.careDays,
        streak: st.pet.streak,
        streakFreezes: st.pet.streakFreezes,
        coins: st.economy.coins,
        traits: st.pet.revealedTraits,
        favoriteFood: st.pet.revealedTraits.includes('favoriteFood')
          ? favoriteFood(st.pet, TREAT_IDS)
          : null,
        microPets: st.pet.microPets.map((m) => ({ id: m.id, shown: m.shown })),
        eggs: st.pet.eggs.map((e) => ({
          daysLeft: Math.max(0, 3 - (st.pet.careDays - e.careDaysAtReceive)),
        })),
        owned: st.pet.owned,
        pantry: st.pet.pantry,
        streakRestore: st.pet.streakRestore
          ? { ...st.pet.streakRestore, goal: restoreGoal(st.pet.hardDay) }
          : null,
      },
      shop: {
        wardrobe: WARDROBE.map((i) => ({ ...i })),
        treats: TREATS.map((t) => ({ id: t.id, price: t.price })),
      },
      diary: [...st.pet.diary].reverse().slice(0, 100),
      evening:
        st.pet.evening.day === today && !st.pet.evening.answered && st.pet.evening.questionKey
          ? { questionKey: st.pet.evening.questionKey }
          : null,
    };
  }

  private firstAidView(): TasksView['firstAid'] {
    const st = this.d.getState();
    if (!st.pet.hardDay) return null;
    const day = dayKey(this.d.clock.now());
    const done = st.pet.firstAid.day === day ? st.pet.firstAid.done : [];
    return FIRST_AID.map((id) => ({ id, labelKey: `firstAid.${id}`, done: done.includes(id) }));
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
      firstAid: this.firstAidView(),
      defaultSize: settings.tasks.defaultSize,
      journeys: {
        active: this.d.getTasks().journeys.map((j) => ({
          id: j.id,
          titleKey: j.title,
          completions: j.completions,
          next: nextMilestone(j),
        })),
        available: JOURNEY_IDS.filter((id) => !this.d.getTasks().journeys.some((j) => j.id === id)),
      },
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
    const firstTime = done.completed.filter((c) => !c.task.rewardRevoked).map((c) => c.task);
    const food = done.completed.some((c) => c.kind !== 'subtask' && isFoodTask(c.task.title));
    this.afterCompletion(firstTime, now);
    this.d.onEffects([
      // SPEC 4.10: отметил задачу про еду — питомец ест рядом.
      { type: 'petReaction', reaction: food ? 'eat' : 'coinCatch' },
      { type: 'coins', count: coins, surprise },
    ]);
  }

  /** После первой (не повторной) отметки: яйцо за большую задачу, прогресс Путей. */
  private afterCompletion(tasks: Task[], now: number): void {
    let st = this.d.getState();
    let pet = st.pet;
    let economy = st.economy;
    for (const t of tasks) {
      if (t.size === 'L' && !t.parentId && chance(`egg:${t.id}`, BIG_TASK_EGG_PCT)) {
        pet = giveEgg(pet, 'bigTask', now, `egg:${t.id}`);
        pet = addDiary(pet, { at: now, kind: 'egg', params: { source: 'bigTask' } });
        this.d.appendEvent({ type: 'egg_received', at: now, source: 'bigTask' });
        this.setBubble({ textKey: 'egg.got' }, 6000);
      }
    }
    // Пути: экземпляр несёт journeyId от шаблона.
    let ts = this.d.getTasks();
    for (const t of tasks) {
      if (!t.journeyId) continue;
      const j = ts.journeys.find((x) => x.id === t.journeyId);
      if (!j) continue;
      const r = addCompletion(j);
      ts = { ...ts, journeys: ts.journeys.map((x) => (x.id === j.id ? r.journey : x)) };
      if (!r.reached) continue;
      const kind = MILESTONE_REWARD[r.reached as keyof typeof MILESTONE_REWARD];
      const loot: Record<string, string | number | boolean> = {};
      if (kind === 'coins') {
        economy = payCoins(economy, MILESTONE_COINS);
        loot.coins = MILESTONE_COINS;
      } else if (kind === 'item') {
        const g = giftItem(pet, this.random());
        pet = g.pet;
        if (g.itemId) loot.itemId = g.itemId;
        else {
          economy = payCoins(economy, MILESTONE_COINS);
          loot.coins = MILESTONE_COINS;
        }
      } else if (kind === 'egg') {
        pet = giveEgg(pet, 'journey', now, `journey:${j.id}:${r.reached}`);
        loot.egg = true;
        this.d.appendEvent({ type: 'egg_received', at: now, source: 'journey' });
      }
      pet = addDiary(pet, {
        at: now,
        kind: 'journey',
        params: { journey: j.title, n: r.reached },
        loot,
      });
      this.setBubble(
        {
          textKey: kind === 'line' ? 'journey.master' : 'journey.milestone',
          params: { n: r.reached },
        },
        8000,
      );
      this.d.onEffects([{ type: 'petReaction', reaction: 'celebrate' }]);
    }
    if (ts !== this.d.getTasks()) this.d.setTasks(ts, TASK_SAVE_MS);
    st = this.d.getState();
    if (pet !== st.pet || economy !== st.economy) this.d.setState({ ...st, pet, economy }, 0);
  }

  // ───────────── Пути (SPEC 5.5) ─────────────
  startJourney(id: string): void {
    if (!(JOURNEY_IDS as string[]).includes(id)) return;
    const jid = id as JourneyTemplate;
    let ts = this.d.getTasks();
    if (ts.journeys.some((j) => j.id === jid)) return;
    const now = this.d.clock.now();
    const today = dayKey(now);
    const tr = this.d.t ?? ((k: string) => k);
    ts = { ...ts, journeys: [...ts.journeys, newJourney(jid, now)] };
    for (const key of JOURNEY_TEMPLATES[jid]) {
      const r = createTask(
        ts,
        { title: tr(key), size: 'S', recurrence: { kind: 'daily' } },
        { id: this.d.newId(), instanceId: this.d.newId() },
        now,
        today,
      );
      const ids = new Set([r.template?.id, r.task?.id].filter(Boolean));
      ts = {
        ...r.state,
        tasks: r.state.tasks.map((t) => (ids.has(t.id) ? { ...t, journeyId: jid } : t)),
      };
    }
    this.saveTasks(ts);
  }

  /** Сойти с Пути: шаблоны и сегодняшние невыполненные экземпляры уходят, прогресс — тоже. */
  stopJourney(id: string): void {
    const ts = this.d.getTasks();
    if (!ts.journeys.some((j) => j.id === id)) return;
    this.saveTasks({
      journeys: ts.journeys.filter((j) => j.id !== id),
      tasks: ts.tasks.filter((t) => t.journeyId !== id || !!t.doneAt),
    });
  }

  // ───────────── Магазин, гардероб, угощения (SPEC 4.9, 4.10) ─────────────
  buy(id: string): boolean {
    const now = this.d.clock.now();
    const st = this.d.getState();
    const isTreat = TREAT_IDS.includes(id);
    const r = isTreat
      ? buyTreat(st.pet, economyForDay(st.economy, dayKey(now)), id)
      : buyItem(st.pet, economyForDay(st.economy, dayKey(now)), id);
    if (!r.ok) return false;
    let pet = r.pet;
    if (!isTreat) pet = (toggleItem(pet, id) as { ok: true; pet: typeof pet }).pet; // купил — сразу надел
    this.d.setState({ ...st, pet, economy: r.economy }, 0);
    this.d.appendEvent({ type: 'purchase', at: now, itemId: id, price: r.price });
    if (!isTreat) this.d.onEffects([{ type: 'petReaction', reaction: 'bounce' }]);
    return true;
  }

  toggleWear(id: string): void {
    const st = this.d.getState();
    const r = toggleItem(st.pet, id);
    if (!r.ok) return;
    this.d.setState({ ...st, pet: r.pet }, 0);
    this.d.onEffects([{ type: 'petReaction', reaction: 'bounce' }]);
  }

  /** Угостить из кладовки: ест и радуется; любимое — раскрывает черту «любимая еда». */
  feed(treatId: string): void {
    const now = this.d.clock.now();
    const st = this.d.getState();
    const r = takeTreat(st.pet, treatId);
    if (!r.ok) return;
    let pet = r.pet;
    const fav = favoriteFood(pet, TREAT_IDS);
    let textKey = 'treat.yum';
    if (treatId === fav) {
      const tr = revealTrait(pet, 0, 'favoriteFood');
      pet = tr.pet;
      if (tr.traitId) {
        pet = addDiary(pet, { at: now, kind: 'trait', loot: { traitId: tr.traitId } });
        this.d.appendEvent({ type: 'trait_revealed', at: now, traitId: tr.traitId });
        textKey = 'treat.favorite';
      } else textKey = 'treat.favoriteAgain';
    }
    this.d.setState({ ...st, pet }, 0);
    const tr = this.d.t ?? ((k: string) => k);
    this.setBubble({ textKey, params: { food: tr(`treat.${treatId}`) } }, 5000);
    this.d.onEffects([{ type: 'petReaction', reaction: 'eat' }]);
  }

  toggleMicroPet(index: number): void {
    const st = this.d.getState();
    const pet = toggleShown(st.pet, Math.floor(index));
    if (pet !== st.pet) this.d.setState({ ...st, pet }, 0);
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
        pet: {
          ...st.pet,
          energyToday: st.pet.energyToday + r.reward.energy,
          needs: needsAfterBreak(st.pet.needs, kind),
        },
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
        needs: st.pet.needs,
        adventure: !!st.pet.adventure,
      });
    return {
      debug: this.d.debug,
      lang: settings.lang,
      theme: this.d.theme?.() ?? 'light',
      pet: {
        name: st.pet.name,
        species: st.pet.species,
        palette: st.pet.palette,
        stage: st.pet.stage,
        visual,
        accessories: st.pet.accessories,
        cozy: st.pet.hardDay,
        needs: st.pet.needs,
        careDays: st.pet.careDays,
        streak: st.pet.streak,
        adventure: st.pet.adventure ? { returnsAt: st.pet.adventure.returnsAt } : null,
        microPets: settings.pet.showMicroPets
          ? st.pet.microPets.filter((m) => m.shown).map((m) => m.id)
          : [],
      },
      island: { enabled: !settings.general.minimalWidget, timeOfDay: timeOfDay(now) },
      tasksToday: todayView(this.d.getTasks(), dayKey(now), dayKey).counts,
      economy: {
        coins: st.economy.coins,
        energyToday: st.pet.energyToday,
        goal: dailyGoal(st.pet.hardDay),
      },
      sounds: { enabled: settings.pet.sounds, volume: settings.pet.volume },
      scheduler: view,
      overlayOpacity: settings.breaks.overlayOpacity,
      overlayBackground: settings.breaks.background,
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
      if (e.type === 'log') {
        this.d.appendEvent(e.event);
        if (e.event.type === 'natural_break') {
          const st = this.d.getState();
          this.d.setState(
            { ...st, pet: { ...st.pet, needs: needsAfterNaturalBreak(st.pet.needs) } },
            10_000,
          );
        }
      }
      if (e.type === 'bubble') this.showBubble(e.textKey, e.params, e.ttlMs);
      if (e.type === 'breakFinished' && e.completed) {
        this.rewardFinishedBreak(e.kind);
        this.bpActiveMs = 0; // глаза и спина только что отдохнули
      }
    }
    // Состояние пишем не чаще раза в 10 с (SPEC 6); команды пользователя — сразу.
    this.d.setState(
      { ...this.d.getState(), scheduler: this.sched },
      ev.type === 'tick' ? 10_000 : 0,
    );
    if (r.effects.length) this.d.onEffects(r.effects);
  }
}
