import { describe, expect, it } from 'vitest';
import { defaultTasks } from './defaults';
import {
  completeTask,
  createTask,
  deleteTask,
  openDay,
  recursOn,
  removeEmptySubtasks,
  renameTask,
  reorderTasks,
  restoreTasks,
  splitTask,
  todayView,
  uncompleteTask,
  weekdayOf,
  type TasksState,
} from './tasks';

const T = new Date(2026, 10, 5, 12).getTime(); // чт 5 ноября 2026
const DAY = '2026-11-05';
const dayOf = (ts: number) => (ts < new Date(2026, 10, 6, 6).getTime() ? DAY : '2026-11-06');
let n = 0;
const ids = () => ({ id: `t${++n}`, instanceId: `i${n}` });

function add(s: TasksState, title: string, extra: Partial<Parameters<typeof createTask>[1]> = {}) {
  return createTask(s, { title, size: 'S', ...extra }, ids(), T, DAY);
}

describe('tasks: создание и список', () => {
  it('одноразовая задача видна в «Сегодня»', () => {
    const r = add(defaultTasks(), '  купить хлеба ');
    expect(r.task?.title).toBe('купить хлеба');
    expect(todayView(r.state, DAY, dayOf).open.map((i) => i.task.title)).toEqual(['купить хлеба']);
  });
  it('повторяющаяся: шаблон + экземпляр на сегодня; шаблон не виден', () => {
    const r = add(defaultTasks(), 'зарядка', { recurrence: { kind: 'daily' } });
    expect(r.template?.recurrence.kind).toBe('daily');
    expect(r.task?.templateId).toBe(r.template?.id);
    const v = todayView(r.state, DAY, dayOf);
    expect(v.open).toHaveLength(1);
    expect(v.open[0]?.recurring).toBe(true);
  });
  it('«по будням» в субботу: шаблон есть, экземпляра нет', () => {
    const r = createTask(
      defaultTasks(),
      { title: 'стендап', size: 'S', recurrence: { kind: 'weekdays' } },
      ids(),
      T,
      '2026-11-07',
    );
    expect(r.task).toBeNull();
    expect(r.state.tasks).toHaveLength(1);
  });
  it('recursOn / weekdayOf', () => {
    expect(weekdayOf('2026-11-05')).toBe(4);
    expect(recursOn({ kind: 'weekdays' }, 6)).toBe(false);
    expect(recursOn({ kind: 'days', days: [1, 3] }, 3)).toBe(true);
    expect(recursOn({ kind: 'none' }, 3)).toBe(false);
  });
  it('счётчик задач сегодня N/M', () => {
    let s = add(defaultTasks(), 'a').state;
    s = add(s, 'b').state;
    const id = s.tasks[0]!.id;
    s = completeTask(s, id, T).state;
    expect(todayView(s, DAY, dayOf).counts).toEqual({ done: 1, total: 2 });
  });
});

describe('tasks: выполнение', () => {
  it('отметка → kind task, doneAt; повторно — ничего', () => {
    const r = add(defaultTasks(), 'a');
    const c = completeTask(r.state, r.task!.id, T + 1);
    expect(c.completed.map((x) => x.kind)).toEqual(['task']);
    expect(c.state.tasks[0]?.doneAt).toBe(T + 1);
    expect(completeTask(c.state, r.task!.id, T + 2).completed).toEqual([]);
  });
  it('пустую задачу отметить нельзя', () => {
    const r = add(defaultTasks(), '   ');
    expect(completeTask(r.state, r.task!.id, T).completed).toEqual([]);
  });
  it('выполнение экземпляра не трогает шаблон', () => {
    const r = add(defaultTasks(), 'зарядка', { recurrence: { kind: 'daily' } });
    const s = completeTask(r.state, r.task!.id, T).state;
    expect(s.tasks.find((t) => t.id === r.template!.id)?.doneAt).toBeUndefined();
  });
  it('шаблон отметить нельзя (НИКАКОЙ автоотметки повторяющихся)', () => {
    const r = add(defaultTasks(), 'зарядка', { recurrence: { kind: 'daily' } });
    expect(completeTask(r.state, r.template!.id, T).completed).toEqual([]);
  });
  it('снятие галочки возвращает задачу в «Сегодня»', () => {
    const r = add(defaultTasks(), 'a');
    const s = completeTask(r.state, r.task!.id, T).state;
    const u = uncompleteTask(s, r.task!.id);
    expect(u.uncompleted).toHaveLength(1);
    expect(todayView(u.state, DAY, dayOf).open).toHaveLength(1);
  });
});

describe('tasks: «Разбить» и подзадачи', () => {
  const setup = () => {
    const r = add(defaultTasks(), 'переезд', { size: 'L' });
    const sp = splitTask(r.state, r.task!.id, ['s1', 's2', 's3'], T);
    return { parent: r.task!, s: sp.state, created: sp.created };
  };
  it('создаёт 3 пустые подзадачи под задачей', () => {
    const { s, created, parent } = setup();
    expect(created.map((c) => c.title)).toEqual(['', '', '']);
    expect(todayView(s, DAY, dayOf).open[0]?.children.map((c) => c.id)).toEqual(['s1', 's2', 's3']);
    expect(created.every((c) => c.parentId === parent.id)).toBe(true);
  });
  it('повторно «Разбить» подзадачу нельзя', () => {
    const { s } = setup();
    expect(splitTask(s, 's1', ['x', 'y', 'z'], T).created).toEqual([]);
  });
  it('пустые подзадачи удаляются при уходе фокуса', () => {
    let { s } = setup();
    const { parent } = setup();
    s = renameTask(s, 's1', 'коробки');
    s = removeEmptySubtasks(s, s.tasks.find((t) => t.title === 'переезд')!.id);
    expect(s.tasks.filter((t) => t.parentId).map((t) => t.id)).toEqual(['s1']);
    expect(parent).toBeTruthy();
  });
  it('последняя подзадача → родитель отмечается с бонусом (единственное разрешённое исключение)', () => {
    let { s } = setup();
    for (const id of ['s1', 's2', 's3']) s = renameTask(s, id, `шаг ${id}`);
    s = completeTask(s, 's1', T).state;
    s = completeTask(s, 's2', T).state;
    const c = completeTask(s, 's3', T);
    expect(c.completed.map((x) => x.kind)).toEqual(['subtask', 'parentBonus']);
    expect(todayView(c.state, DAY, dayOf).done).toHaveLength(1);
  });
  it('пустые подзадачи не мешают бонусу', () => {
    let { s } = setup();
    s = renameTask(s, 's1', 'единственный шаг');
    const c = completeTask(s, 's1', T);
    expect(c.completed.map((x) => x.kind)).toEqual(['subtask', 'parentBonus']);
  });
  it('ручная отметка разбитого родителя отмечает оставшиеся подзадачи и даёт бонус', () => {
    const init = setup();
    const parent = init.parent;
    let s = init.s;
    for (const id of ['s1', 's2', 's3']) s = renameTask(s, id, `шаг ${id}`);
    s = completeTask(s, 's1', T).state;
    const c = completeTask(s, parent.id, T);
    expect(c.completed.map((x) => x.kind)).toEqual(['subtask', 'subtask', 'parentBonus']);
  });
  it('снятие подзадачи снимает и родителя', () => {
    const init = setup();
    const parent = init.parent;
    let s = init.s;
    s = renameTask(s, 's1', 'шаг');
    s = completeTask(s, 's1', T).state;
    const u = uncompleteTask(s, 's1');
    expect(u.uncompleted.map((t) => t.id).sort()).toEqual([parent.id, 's1'].sort());
  });
});

describe('tasks: удаление, порядок, смена дня', () => {
  it('удаление с подзадачами и восстановление («Отменить» 5 с)', () => {
    const r = add(defaultTasks(), 'a');
    const s = splitTask(r.state, r.task!.id, ['x1', 'x2', 'x3'], T).state;
    const d = deleteTask(s, r.task!.id);
    expect(d.state.tasks).toHaveLength(0);
    expect(d.removed).toHaveLength(4);
    expect(restoreTasks(d.state, d.removed).tasks).toHaveLength(4);
  });
  it('удаление экземпляра удаляет шаблон — завтра не вернётся', () => {
    const r = add(defaultTasks(), 'зарядка', { recurrence: { kind: 'daily' } });
    const d = deleteTask(r.state, r.task!.id);
    expect(d.state.tasks).toHaveLength(0);
  });
  it('перетаскивание меняет порядок, подзадачи едут с родителем', () => {
    let s = add(defaultTasks(), 'a').state;
    s = add(s, 'b').state;
    const [a, b] = s.tasks;
    s = splitTask(s, a!.id, ['sa1', 'sa2', 'sa3'], T).state;
    s = reorderTasks(s, [b!.id, a!.id]);
    expect(todayView(s, DAY, dayOf).open.map((i) => i.task.title)).toEqual(['b', 'a']);
    const sub = s.tasks.find((t) => t.id === 'sa1')!;
    expect(Math.floor(sub.order)).toBe(2);
  });
  it('новый день: невыполненная одноразовая остаётся без пометок, вчерашний экземпляр исчезает, новый создаётся', () => {
    let s = add(defaultTasks(), 'одноразовая').state;
    const r = add(s, 'зарядка', { recurrence: { kind: 'daily' } });
    s = r.state;
    const next = openDay(s, '2026-11-06', T + 86_400_000, (tpl) => `${tpl}-06`);
    const v = todayView(next.state, '2026-11-06', dayOf);
    expect(v.open.map((i) => i.task.title).sort()).toEqual(['зарядка', 'одноразовая']);
    expect(next.state.tasks.some((t) => t.id === r.task!.id)).toBe(false);
    expect(next.created[0]?.id).toBe(`${r.template!.id}-06`);
    expect(Object.keys(v.open.find((i) => i.task.title === 'одноразовая')!.task)).not.toContain(
      'overdue',
    );
  });
  it('openDay идемпотентен', () => {
    const r = add(defaultTasks(), 'зарядка', { recurrence: { kind: 'daily' } });
    const a = openDay(r.state, DAY, T, (tpl) => `${tpl}-x`);
    expect(a.created).toEqual([]);
  });
  it('выполненная вчера одноразовая уходит из «Выполнено» сегодня', () => {
    const r = add(defaultTasks(), 'a');
    const s = completeTask(r.state, r.task!.id, T).state;
    expect(todayView(s, '2026-11-06', dayOf).done).toHaveLength(0);
  });
});
