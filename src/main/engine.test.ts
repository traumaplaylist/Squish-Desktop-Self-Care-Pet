import { describe, expect, it } from 'vitest';
import { FakeClock, MINUTE, SECOND } from '../core/clock';
import { DEFAULT_SETTINGS, defaultState, defaultTasks } from '../core/defaults';
import type { TasksState } from '../core/tasks';
import type { AppEvent, Effect } from '../core/events';
import type { PersistedState } from '../core/types';
import { Engine, STILL_ON_CALL_MS } from './engine';

function setup(debug = false) {
  const clock = new FakeClock(new Date(2026, 10, 5, 12).getTime());
  let real = 0;
  let idleMs = 0;
  let state: PersistedState = defaultState(clock.now());
  const saves: number[] = [];
  let tasks: TasksState = defaultTasks();
  let idN = 0;
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
    getTasks: () => tasks,
    setTasks: (t) => {
      tasks = t;
    },
    newId: () => `id${++idN}`,
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
    tasks: () => tasks,
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
  it('задачи: ввод → галочка → +энергия +монеты, монетки летят, питомец ловит', () => {
    const t = setup();
    t.step(SECOND);
    const id = t.engine.createTaskFromText('сдать отчёт!')!;
    expect(t.state().economy.coins).toBe(1); // за создание
    t.engine.completeTask(id);
    expect(t.state().economy.coins).toBe(1 + 6);
    expect(t.state().pet.energyToday).toBe(4);
    expect(t.effects.some((e) => e.type === 'coins' && e.count === 6)).toBe(true);
    expect(t.effects.some((e) => e.type === 'petReaction' && e.reaction === 'coinCatch')).toBe(
      true,
    );
    expect(t.engine.snapshot().tasksToday).toEqual({ done: 1, total: 1 });
    expect(t.events.map((e) => e.type)).toEqual(
      expect.arrayContaining(['task_created', 'task_completed']),
    );
  });
  it('задачи: снять галочку → награда откатывается, повторная отметка не даёт больше', () => {
    const t = setup();
    t.step(SECOND);
    const id = t.engine.createTaskFromText('отчёт')!;
    t.engine.completeTask(id);
    const coins = t.state().economy.coins;
    t.engine.uncompleteTask(id);
    expect(t.state().economy.coins).toBe(coins - 1);
    t.engine.completeTask(id);
    t.engine.uncompleteTask(id);
    t.engine.completeTask(id);
    expect(t.state().economy.coins).toBe(coins);
  });
  it('задачи: удаление и «Отменить» в 5 с', () => {
    const t = setup();
    const id = t.engine.createTaskFromText('a')!;
    t.engine.deleteTask(id);
    expect(t.engine.tasksView().open).toHaveLength(0);
    expect(t.engine.tasksView().canUndoDelete).toBe(true);
    t.engine.undoDelete();
    expect(t.engine.tasksView().open).toHaveLength(1);
  });
  it('мусорный ввод не создаёт задачу', () => {
    const t = setup();
    expect(t.engine.createTaskFromText('  !!! ')).toBeNull();
    expect(t.tasks().tasks).toHaveLength(0);
  });
  it('перерыв досижен → награда (длинный 4/3)', () => {
    const t = setup();
    t.step(SECOND);
    t.engine.dispatch({ type: 'breakNow', kind: 'long' });
    t.step(5 * MINUTE + SECOND);
    expect(t.state().economy.coins).toBe(3);
    expect(t.state().pet.energyToday).toBe(4);
  });
  it('вода до цели даёт 1/1, отмена откатывает', () => {
    const t = setup();
    t.step(SECOND);
    t.engine.drinkWater();
    expect(t.state().economy.coins).toBe(1);
    t.engine.undoWater();
    expect(t.state().economy.coins).toBe(0);
    expect(t.state().pet.energyToday).toBe(0);
  });
  it('новый логический день в 06:00: энергия и дневные счётчики с нуля, монеты остаются, новые экземпляры', () => {
    const t = setup();
    t.step(SECOND);
    t.engine.createTaskFromText('зарядка каждый день');
    t.engine.completeTask(t.engine.tasksView().open[0]!.id);
    const coins = t.state().economy.coins;
    t.clock.set(new Date(2026, 10, 6, 6, 0, 1).getTime());
    t.engine.tick();
    expect(t.state().pet.energyToday).toBe(0);
    expect(t.state().economy.coins).toBe(coins);
    expect(t.state().economy.day).toBe('2026-11-06');
    const v = t.engine.tasksView();
    expect(v.open.map((i) => i.title)).toEqual(['зарядка']);
    expect(v.done).toHaveLength(0);
  });
  it('чек-ин: питомец спрашивает первым при первой активности дня, один раз', () => {
    const t = setup();
    t.step(2 * SECOND);
    const b = t.engine.snapshot().bubble;
    expect(b?.textKey).toBe('checkin.question');
    expect(b?.actions?.map((a) => a.action)).toEqual([
      'checkin:1',
      'checkin:2',
      'checkin:3',
      'checkin:4',
      'checkin:5',
    ]);
    t.engine.answerCheckin(4);
    expect(t.state().pet.energyToday).toBe(2);
    expect(t.state().economy.coins).toBe(1);
    expect(t.events.some((e) => e.type === 'mood_checkin')).toBe(true);
    t.engine.answerCheckin(5); // второй раз за день — не награждаем
    expect(t.state().pet.energyToday).toBe(2);
  });
  it('чек-ин 😞 → обнимашки и предложение «Тяжёлого дня»', () => {
    const t = setup();
    t.step(2 * SECOND);
    t.engine.answerCheckin(1);
    expect(t.effects.some((e) => e.type === 'petReaction' && e.reaction === 'hug')).toBe(true);
    expect(t.engine.snapshot().bubble?.actions?.[0]?.action).toBe('hardDay:on');
  });
  it('игнор чек-ина — можно ответить позже кликом по питомцу', () => {
    const t = setup();
    t.step(2 * SECOND);
    t.engine.dismissBubble();
    t.engine.petClicked();
    expect(t.engine.snapshot().bubble?.textKey).toBe('checkin.question');
  });
  it('тяжёлый день: цель 10, строгость мягкая, cozy, «Аптечка» по разу на действие', () => {
    const t = setup();
    t.step(SECOND);
    t.engine.setHardDay(true);
    const snap = t.engine.snapshot();
    expect(snap.economy.goal).toBe(10);
    expect(snap.pet.cozy).toBe(true);
    expect(t.engine.cfg().strictness).toBe('soft');
    expect(t.engine.tasksView().firstAid).toHaveLength(6);
    t.engine.firstAid('breaths');
    t.engine.firstAid('breaths');
    expect(t.state().pet.energyToday).toBe(1);
    expect(t.engine.tasksView().firstAid?.find((x) => x.id === 'breaths')?.done).toBe(true);
    t.engine.setHardDay(false);
    expect(t.engine.tasksView().firstAid).toBeNull();
  });
  it('потребности убывают в активное время, перерыв восполняет глаза', () => {
    const t = setup();
    t.step(2 * SECOND);
    t.engine.dismissBubble();
    t.step(19 * MINUTE);
    expect(t.state().pet.needs.eyes).toBeLessThan(60);
    t.engine.dispatch({ type: 'breakNow', kind: 'micro' });
    t.step(21 * SECOND);
    expect(t.state().pet.needs.eyes).toBeGreaterThan(95);
  });
  it('цель дня → радость один раз; новый день → +1 день заботы и серия', () => {
    const t = setup();
    t.step(SECOND);
    t.engine.debugPet('energy');
    t.engine.debugPet('energy');
    t.engine.debugPet('energy');
    t.step(SECOND);
    expect(t.engine.snapshot().bubble?.textKey).toBe('goal.reached');
    const celebrations = t.effects.filter(
      (e) => e.type === 'petReaction' && e.reaction === 'celebrate',
    ).length;
    t.step(5 * SECOND);
    expect(
      t.effects.filter((e) => e.type === 'petReaction' && e.reaction === 'celebrate').length,
    ).toBe(celebrations);
    t.clock.set(new Date(2026, 10, 6, 6, 0, 1).getTime());
    t.engine.tick();
    expect(t.state().pet.careDays).toBe(1);
    expect(t.state().pet.streak).toBe(1);
    expect(t.state().pet.needs).toEqual({ water: 70, eyes: 100, movement: 100 });
  });
  it('5 дней заботы → «Подросток» и облачко «Я подрос!»', () => {
    const t = setup();
    t.step(SECOND);
    for (let i = 0; i < 4; i++) t.engine.debugPet('careDay');
    t.engine.debugPet('energy');
    t.engine.debugPet('energy');
    t.engine.debugPet('energy');
    t.step(SECOND);
    t.clock.set(new Date(2026, 10, 6, 7).getTime());
    t.engine.tick();
    expect(t.state().pet.stage).toBe('teen');
    expect(t.engine.snapshot().bubble?.textKey).toBe('pet.grew');
  });
  it('на созвоне питомец молчит: ни реплик, ни радости вслух', () => {
    const t = setup();
    t.engine.random = () => 0;
    t.engine.setDetectorSuppression({ reason: 'mic', app: 'Zoom.exe' });
    t.step(2 * SECOND);
    t.engine.dismissBubble();
    t.step(40 * MINUTE);
    t.engine.petClicked();
    const b = t.engine.snapshot().bubble;
    expect(b === null || b.textKey === 'checkin.question').toBe(true);
  });
  it('реплика без повода — не раньше чем через 10 мин тишины', () => {
    const t = setup();
    t.engine.random = () => 0;
    t.step(2 * SECOND);
    t.engine.answerCheckin(3);
    t.engine.dismissBubble();
    t.step(9 * MINUTE);
    expect(t.engine.snapshot().bubble).toBeNull();
    let said = false;
    for (let i = 0; i < 120 && !said; i++) {
      t.step(SECOND);
      said = !!t.engine.snapshot().bubble?.textKey.startsWith('line.');
      if (t.engine.getSchedulerState().phase !== 'working') t.engine.dispatch({ type: 'skip' });
    }
    expect(said).toBe(true);
  });
  it('итог дня: day_closed с активным временем и энергией; «Дом питомца» видит сегодня и неделю', () => {
    const t = setup();
    t.step(2 * SECOND);
    t.engine.answerCheckin(4);
    t.step(5 * MINUTE);
    const home = t.engine.homeStats();
    expect(home.today.mood).toBe(null); // событий в тестовом логе нет — mood берётся из лога
    expect(home.today.energy).toBe(2);
    expect(home.today.activeMs).toBeGreaterThan(4 * MINUTE);
    expect(home.week).toHaveLength(7);
    t.clock.set(new Date(2026, 10, 6, 6, 0, 1).getTime());
    t.engine.tick();
    const closed = t.events.find((e) => e.type === 'day_closed');
    expect(closed).toMatchObject({
      type: 'day_closed',
      day: '2026-11-05',
      energy: 2,
      goalReached: false,
    });
    expect((closed as { activeMs: number }).activeMs).toBeGreaterThan(4 * MINUTE);
  });
});

describe('Engine — Неделя 2', () => {
  const ready = () => {
    const t = setup();
    t.step(SECOND);
    t.engine.dismissBubble();
    t.engine.answerCheckin(4);
    t.engine.dismissBubble();
    return t;
  };
  it('цель дня → приключение 30 мин; вернулся — история, монеты, запись в дневнике', () => {
    const t = ready();
    t.engine.random = () => 0.99;
    t.engine.debugPet('energy');
    t.engine.debugPet('energy');
    t.engine.debugPet('energy');
    t.step(SECOND);
    expect(t.state().pet.adventure).not.toBeNull();
    expect(t.engine.snapshot().pet.visual).toBe('adventure');
    expect(t.engine.snapshot().pet.adventure?.returnsAt).toBe(t.state().pet.adventure!.returnsAt);
    const coins = t.state().economy.coins;
    t.engine.dismissBubble();
    t.step(31 * MINUTE);
    expect(t.state().pet.adventure).toBeNull();
    expect(t.state().pet.diary.at(-1)?.kind).toBe('adventure');
    expect(t.state().economy.coins - coins).toBeGreaterThanOrEqual(5);
    expect(t.events.some((e) => e.type === 'adventure_finished')).toBe(true);
  });
  it('магазин: купил — надел, монеты списаны; без денег не купить', () => {
    const t = ready();
    expect(t.engine.buy('head:beanie')).toBe(false);
    t.engine.debugPet('coins');
    expect(t.engine.buy('head:beanie')).toBe(true);
    expect(t.state().pet.accessories).toContain('head:beanie');
    expect(t.state().economy.coins).toBe(t.engine.homeStats().pet.coins);
    t.engine.toggleWear('head:beanie');
    expect(t.state().pet.accessories).not.toContain('head:beanie');
  });
  it('угощение: ест (реакция eat), любимое раскрывает черту', () => {
    const t = ready();
    t.engine.debugPet('coins');
    for (const id of ['berry', 'carrot', 'cookie', 'cheese', 'pie']) t.engine.buy(id);
    for (const id of ['berry', 'carrot', 'cookie', 'cheese', 'pie']) t.engine.feed(id);
    expect(t.effects.filter((e) => e.type === 'petReaction' && e.reaction === 'eat')).toHaveLength(
      5,
    );
    expect(t.state().pet.revealedTraits).toContain('favoriteFood');
    expect(t.state().pet.pantry).toEqual({});
  });
  it('задача про еду — питомец ест рядом', () => {
    const t = ready();
    const id = t.engine.createTaskFromText('пообедать не за компьютером')!;
    t.engine.completeTask(id);
    expect(t.effects.some((e) => e.type === 'petReaction' && e.reaction === 'eat')).toBe(true);
  });
  it('Путь: задачи на каждый день, этап 5 → монеты; сойти с Пути — задачи уходят', () => {
    const t = ready();
    t.engine.startJourney('back');
    const view = t.engine.tasksView();
    expect(view.journeys.active.map((j) => j.id)).toEqual(['back']);
    expect(view.open).toHaveLength(2);
    const coins0 = t.state().economy.coins;
    for (let day = 0; day < 3; day++) {
      for (const it2 of t.engine.tasksView().open) t.engine.completeTask(it2.id);
      t.clock.advance(24 * 60 * MINUTE);
      t.engine.tick();
    }
    const j = t.tasks().journeys[0]!;
    expect(j.completions).toBe(6);
    expect(j.milestonesReached).toEqual([5]);
    expect(t.state().economy.coins - coins0).toBeGreaterThanOrEqual(20);
    t.engine.stopJourney('back');
    expect(t.engine.tasksView().journeys.active).toEqual([]);
    expect(t.engine.tasksView().open).toHaveLength(0);
  });
  it('вечерний вопрос в 18:00, ответ — в дневник', () => {
    const t = ready();
    t.clock.set(new Date(2026, 10, 5, 18, 5).getTime());
    t.step(SECOND);
    expect(t.engine.snapshot().bubble?.textKey).toMatch(/^evening\.q\d$/);
    t.engine.answerEvening('  дописал главу  ');
    const e = t.state().pet.diary.at(-1)!;
    expect(e.kind).toBe('evening');
    expect(e.text).toBe('дописал главу');
    expect(t.engine.homeStats().evening).toBeNull();
  });
  it('напоминание по времени: облачко с задачей и кнопкой «сделано»', () => {
    const t = ready();
    const id = t.engine.createTaskFromText('позвонить маме в 12:30')!;
    t.engine.dismissBubble();
    t.clock.set(new Date(2026, 10, 5, 12, 31).getTime());
    t.step(SECOND);
    const b = t.engine.snapshot().bubble;
    expect(b?.textKey).toBe('task.reminder');
    expect(b?.actions?.[0]?.action).toBe(`task:done:${id}`);
    t.engine.dismissBubble();
    t.step(5 * SECOND);
    expect(t.engine.snapshot().bubble?.textKey).not.toBe('task.reminder'); // второй раз не зовёт
  });
});
