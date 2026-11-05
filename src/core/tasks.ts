/**
 * Задачи (SPEC 5.1–5.2, R0). Чистые функции; id приходят снаружи (main генерирует), время — аргументом.
 *
 * Модель:
 * - одноразовая задача: recurrence 'none', без templateId; видна, пока не выполнена, и в день выполнения;
 * - шаблон повторяющейся: recurrence ≠ 'none' — в списке «Сегодня» не показывается;
 * - экземпляр: templateId + day, создаётся на каждый подходящий логический день;
 * - подзадачи: parentId. «Разбить» создаёт 3 пустые; пустые удаляются (removeEmptySubtasks).
 * НИКОГДА не отмечаем выполнение за пользователя. Единственное исключение (R0, CLAUDE.md):
 * родитель отмечается, когда пользователь отметил его последнюю подзадачу.
 */
import type {
  DayKey,
  Millis,
  PersistedTasks,
  Recurrence,
  Task,
  TaskSize,
  TimeOfDay,
  Weekday,
} from './types';

export type TasksState = PersistedTasks;

export const SPLIT_COUNT = 3;

export function isTemplate(t: Task): boolean {
  return t.recurrence.kind !== 'none' && !t.templateId;
}

export function recursOn(r: Recurrence, weekday: Weekday): boolean {
  switch (r.kind) {
    case 'none':
      return false;
    case 'daily':
      return true;
    case 'weekdays':
      return weekday >= 1 && weekday <= 5;
    case 'days':
      return r.days.includes(weekday);
  }
}

/** День недели логического дня 'YYYY-MM-DD' (0 — воскресенье). */
export function weekdayOf(day: DayKey): Weekday {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).getDay() as Weekday;
}

const nextOrder = (s: TasksState) => s.tasks.reduce((m, t) => Math.max(m, t.order), 0) + 1;

export interface NewTask {
  title: string;
  size: TaskSize;
  recurrence?: Recurrence;
  remindAt?: TimeOfDay;
}

/**
 * Создать задачу. Для повторяющейся создаётся шаблон и, если сегодня подходящий день, экземпляр.
 * Возвращает «видимую» задачу (экземпляр или одноразовую) — её покажет панель.
 */
export function createTask(
  s: TasksState,
  input: NewTask,
  ids: { id: string; instanceId: string },
  now: Millis,
  today: DayKey,
): { state: TasksState; task: Task | null; template: Task | null } {
  const title = input.title.trim();
  const recurrence = input.recurrence ?? { kind: 'none' };
  const base: Task = {
    id: ids.id,
    title,
    size: input.size,
    recurrence,
    createdAt: now,
    order: nextOrder(s),
    ...(input.remindAt ? { remindAt: input.remindAt } : {}),
  };
  if (recurrence.kind === 'none')
    return { state: { ...s, tasks: [...s.tasks, base] }, task: base, template: null };
  const tasks = [...s.tasks, base];
  let instance: Task | null = null;
  if (recursOn(recurrence, weekdayOf(today))) {
    instance = makeInstance(base, ids.instanceId, today, now, base.order + 1);
    tasks.push(instance);
  }
  return { state: { ...s, tasks }, task: instance, template: base };
}

function makeInstance(tpl: Task, id: string, day: DayKey, now: Millis, order: number): Task {
  return {
    id,
    title: tpl.title,
    size: tpl.size,
    recurrence: tpl.recurrence,
    templateId: tpl.id,
    day,
    createdAt: now,
    order,
    ...(tpl.remindAt ? { remindAt: tpl.remindAt } : {}),
    ...(tpl.journeyId ? { journeyId: tpl.journeyId } : {}),
  };
}

export function childrenOf(s: TasksState, parentId: string): Task[] {
  return s.tasks.filter((t) => t.parentId === parentId).sort((a, b) => a.order - b.order);
}

/** «Разбить»: 3 пустые подзадачи сразу под задачей (если подзадач ещё нет). */
export function splitTask(
  s: TasksState,
  taskId: string,
  ids: string[],
  now: Millis,
): { state: TasksState; created: Task[] } {
  const parent = s.tasks.find((t) => t.id === taskId);
  if (!parent || parent.parentId || parent.doneAt || isTemplate(parent))
    return { state: s, created: [] };
  const created: Task[] = ids.slice(0, SPLIT_COUNT).map((id, i) => ({
    id,
    title: '',
    size: 'S' as TaskSize,
    parentId: parent.id,
    recurrence: { kind: 'none' } as Recurrence,
    createdAt: now,
    order: parent.order + (i + 1) / 10,
    ...(parent.day ? { day: parent.day } : {}),
  }));
  return { state: { ...s, tasks: [...s.tasks, ...created] }, created };
}

export function renameTask(s: TasksState, id: string, title: string): TasksState {
  return { ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, title: title.trim() } : t)) };
}

/** Пустые подзадачи удаляются, когда пользователь ушёл с них (потеря фокуса) — R0. */
export function removeEmptySubtasks(s: TasksState, parentId: string): TasksState {
  return {
    ...s,
    tasks: s.tasks.filter((t) => !(t.parentId === parentId && !t.title && !t.doneAt)),
  };
}

/** Удалить задачу вместе с подзадачами; удалённое вернуть для «Отменить» (5 с). */
export function deleteTask(s: TasksState, id: string): { state: TasksState; removed: Task[] } {
  const target = s.tasks.find((t) => t.id === id);
  if (!target) return { state: s, removed: [] };
  const ids = new Set([id, ...s.tasks.filter((t) => t.parentId === id).map((t) => t.id)]);
  // Удаляем экземпляр повторяющейся — удаляем и шаблон (иначе завтра «воскреснет»).
  if (target.templateId) ids.add(target.templateId);
  const removed = s.tasks.filter((t) => ids.has(t.id));
  return { state: { ...s, tasks: s.tasks.filter((t) => !ids.has(t.id)) }, removed };
}

export function restoreTasks(s: TasksState, removed: Task[]): TasksState {
  const have = new Set(s.tasks.map((t) => t.id));
  return { ...s, tasks: [...s.tasks, ...removed.filter((t) => !have.has(t.id))] };
}

/** Порядок по перетаскиванию: ids — новый порядок корневых задач. */
export function reorderTasks(s: TasksState, ids: string[]): TasksState {
  const pos = new Map(ids.map((id, i) => [id, i + 1]));
  return {
    ...s,
    tasks: s.tasks.map((t) => {
      if (pos.has(t.id)) return { ...t, order: pos.get(t.id)! };
      if (t.parentId && pos.has(t.parentId)) {
        const frac = t.order - Math.floor(t.order);
        return { ...t, order: pos.get(t.parentId)! + (frac || 0.1) };
      }
      return t;
    }),
  };
}

export type Completion =
  | { kind: 'task'; task: Task }
  | { kind: 'subtask'; task: Task }
  /** Родитель отмечен после последней подзадачи — платится только бонус (R0). */
  | { kind: 'parentBonus'; task: Task };

/**
 * Отметить выполнение. Возвращает список отмеченного (для наград). Пустые задачи не отмечаются.
 * Ручная отметка разбитого родителя отмечает и его невыполненные подзадачи — человек сказал «сделал всё».
 */
export function completeTask(
  s: TasksState,
  id: string,
  now: Millis,
): { state: TasksState; completed: Completion[] } {
  const t = s.tasks.find((x) => x.id === id);
  if (!t || t.doneAt || !t.title || isTemplate(t)) return { state: s, completed: [] };
  const completed: Completion[] = [];
  const doneIds = new Set<string>();
  const kids = childrenOf(s, t.id).filter((k) => k.title);
  if (t.parentId) {
    completed.push({ kind: 'subtask', task: t });
    doneIds.add(t.id);
    const siblings = childrenOf(s, t.parentId).filter((k) => k.title);
    const parent = s.tasks.find((x) => x.id === t.parentId);
    if (parent && !parent.doneAt && siblings.every((k) => k.doneAt || k.id === t.id)) {
      completed.push({ kind: 'parentBonus', task: parent });
      doneIds.add(parent.id);
    }
  } else if (kids.length) {
    for (const k of kids) {
      if (k.doneAt) continue;
      completed.push({ kind: 'subtask', task: k });
      doneIds.add(k.id);
    }
    completed.push({ kind: 'parentBonus', task: t });
    doneIds.add(t.id);
  } else {
    completed.push({ kind: 'task', task: t });
    doneIds.add(t.id);
  }
  return {
    state: { ...s, tasks: s.tasks.map((x) => (doneIds.has(x.id) ? { ...x, doneAt: now } : x)) },
    completed,
  };
}

/**
 * Снять галочку. Снятая подзадача снимает и родителя (его бонус больше не заслужен).
 * Возвращает снятые задачи (для отката наград).
 */
export function uncompleteTask(
  s: TasksState,
  id: string,
): { state: TasksState; uncompleted: Task[] } {
  const t = s.tasks.find((x) => x.id === id);
  if (!t || !t.doneAt) return { state: s, uncompleted: [] };
  const ids = new Set([t.id]);
  if (t.parentId) {
    const parent = s.tasks.find((x) => x.id === t.parentId);
    if (parent?.doneAt) ids.add(parent.id);
  }
  const uncompleted = s.tasks.filter((x) => ids.has(x.id));
  return {
    state: {
      ...s,
      tasks: s.tasks.map((x) => {
        if (!ids.has(x.id)) return x;
        const { doneAt: _d, ...rest } = x;
        return rest;
      }),
    },
    uncompleted,
  };
}

/** Записать выплаченную/списанную награду в задачу (R0: rewardPaid / rewardRevoked). */
export function setReward(
  s: TasksState,
  id: string,
  patch: Pick<Task, 'rewardPaid' | 'rewardRevoked'>,
): TasksState {
  return {
    ...s,
    tasks: s.tasks.map((t) => {
      if (t.id !== id) return t;
      const next: Task = { ...t, ...patch };
      if (patch.rewardPaid === undefined && 'rewardPaid' in patch) delete next.rewardPaid;
      if (patch.rewardRevoked === undefined && 'rewardRevoked' in patch) delete next.rewardRevoked;
      return next;
    }),
  };
}

/**
 * Закрытие логического дня (SPEC 7.5): невыполненные экземпляры прошлых дней тихо исчезают (R0),
 * выполненные — уходят из списка; для нового дня создаются экземпляры шаблонов.
 * Невыполненные одноразовые остаются как есть — без пометок «просрочено».
 */
export function openDay(
  s: TasksState,
  day: DayKey,
  now: Millis,
  newId: (templateId: string) => string,
): { state: TasksState; created: Task[] } {
  const wd = weekdayOf(day);
  const keep = s.tasks.filter((t) => {
    if (t.templateId && t.day !== day && !t.doneAt) return false; // вчерашний невыполненный экземпляр
    if (t.parentId) {
      const p = s.tasks.find((x) => x.id === t.parentId);
      if (p?.templateId && p.day !== day && !p.doneAt) return false;
    }
    return true;
  });
  const created: Task[] = [];
  let order = keep.reduce((m, t) => Math.max(m, t.order), 0);
  for (const tpl of keep.filter(isTemplate)) {
    if (!recursOn(tpl.recurrence, wd)) continue;
    if (keep.some((t) => t.templateId === tpl.id && t.day === day)) continue;
    created.push(makeInstance(tpl, newId(tpl.id), day, now, ++order));
  }
  return { state: { ...s, tasks: [...keep, ...created] }, created };
}

export interface TodayItem {
  task: Task;
  children: Task[];
  recurring: boolean;
}

/**
 * Что показать в панели: «Сегодня» (невыполненные) и «Выполнено» (выполненные в этот день).
 * doneDay — функция «в какой логический день выполнено» (main передаёт dayKey).
 */
export function todayView(
  s: TasksState,
  day: DayKey,
  doneDay: (at: Millis) => DayKey,
): { open: TodayItem[]; done: TodayItem[]; counts: { done: number; total: number } } {
  const roots = s.tasks
    .filter((t) => !t.parentId && !isTemplate(t))
    .filter((t) => (t.templateId ? t.day === day : true))
    .filter((t) => !t.doneAt || doneDay(t.doneAt) === day)
    .sort((a, b) => a.order - b.order);
  const item = (t: Task): TodayItem => ({
    task: t,
    children: childrenOf(s, t.id),
    recurring: !!t.templateId,
  });
  const open = roots.filter((t) => !t.doneAt).map(item);
  const done = roots.filter((t) => t.doneAt).map(item);
  return { open, done, counts: { done: done.length, total: open.length + done.length } };
}
