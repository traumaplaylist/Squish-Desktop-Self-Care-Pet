import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snapshot, TaskItemView, TasksView } from '../../core/types';
import { configureSound, playCoin, playPop, playSurprise, warmUpSound } from '../shared/sound';
import { useI18n } from '../shared/useI18n';

type Mode = 'quick' | 'panel';
interface Burst {
  id: number;
  x: number;
  y: number;
  n: number;
}

const UNDO_MS = 5000;
let burstSeq = 0;

/** Быстрый ввод + панель задач (SPEC 2.7). Галочка — главное ощущение продукта (SPEC 0.1). */
export function Tasks() {
  const t = useI18n();
  const [mode, setMode] = useState<Mode>('quick');
  const [view, setView] = useState<TasksView | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [text, setText] = useState('');
  /** Оптимистичные отметки: id → done (до подтверждения из main, бюджет < 50 мс). */
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [surprise, setSurprise] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [undoUntil, setUndoUntil] = useState(0);
  const [focusId, setFocusId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    warmUpSound();
    void window.squish.invoke('tasks:get').then(setView);
    void window.squish.invoke('app:getSnapshot').then(setSnap);
    const offs = [
      window.squish.on('tasks', (v) => {
        setView(v);
        setOptimistic({});
      }),
      window.squish.on('snapshot', (s) => {
        setSnap(s);
        configureSound(s.sounds);
      }),
      window.squish.on('tasks:mode', ({ mode: m, t0 }) => {
        setMode(m);
        inputRef.current?.focus();
        // Замер «вызов → окно видно и поле в фокусе» (SPEC 6: < 150 мс).
        requestAnimationFrame(() => window.squish.send('tasks:shown', t0));
      }),
      window.squish.on('pet:coins', ({ surprise: s }) => {
        if (!s) return;
        playSurprise();
        setSurprise(true);
        window.setTimeout(() => setSurprise(false), 1600);
      }),
    ];
    return () => offs.forEach((o) => o());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        !(e.target instanceof HTMLInputElement && e.target.dataset['edit'])
      ) {
        window.squish.send('tasks:hide', null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const switchMode = (m: Mode) => {
    setMode(m);
    window.squish.send('tasks:setMode', m);
    inputRef.current?.focus();
  };

  const submit = () => {
    if (!text.trim()) return;
    window.squish.send('tasks:create', { text });
    setText('');
  };

  const isDone = (id: string, done: boolean) => optimistic[id] ?? done;

  /** Галочка: мгновенно — состояние, звук и монетки; подтверждение придёт из main. */
  const toggle = useCallback((id: string, done: boolean, el: HTMLElement) => {
    if (done) {
      setOptimistic((o) => ({ ...o, [id]: false }));
      window.squish.send('tasks:uncomplete', id);
      return;
    }
    // Сначала — галочка (кадр), потом звук и IPC: ничто не встаёт между кликом и заливкой.
    setOptimistic((o) => ({ ...o, [id]: true }));
    window.setTimeout(() => {
      playPop();
      playCoin();
      window.squish.send('tasks:complete', id);
    }, 0);
    const r = el.getBoundingClientRect();
    const b: Burst = { id: ++burstSeq, x: r.left + r.width / 2, y: r.top + r.height / 2, n: 5 };
    setBursts((list) => [...list, b]);
    window.setTimeout(() => setBursts((list) => list.filter((x) => x.id !== b.id)), 1000);
  }, []);

  const remove = (id: string) => {
    window.squish.send('tasks:delete', id);
    setUndoUntil(Date.now() + UNDO_MS);
    window.setTimeout(() => setUndoUntil((u) => (Date.now() >= u ? 0 : u)), UNDO_MS + 50);
  };

  const split = (id: string) => {
    window.squish.send('tasks:split', id);
    setFocusId(id); // фокус на первую пустую подзадачу, когда она придёт
  };

  // ── перетаскивание порядка ──
  const dragId = useRef<string | null>(null);
  const onDrop = (targetId: string) => {
    const from = dragId.current;
    dragId.current = null;
    if (!view || !from || from === targetId) return;
    const ids = view.open.map((i) => i.id).filter((x) => x !== from);
    ids.splice(ids.indexOf(targetId), 0, from);
    setView({ ...view, open: ids.map((id) => view.open.find((i) => i.id === id)!) });
    window.squish.send('tasks:reorder', ids);
  };

  const open = view?.open ?? [];
  const done = view?.done ?? [];
  const eco = snap?.economy;

  return (
    <div className={`tasks ${mode}`}>
      <div className="card">
        {mode === 'panel' && (
          <header>
            <h1>{t('tasks.today')}</h1>
            <div className="stats">
              {view && <span>{t('tasks.counter', view.counts)}</span>}
              {eco && <span>{t('tasks.energy', { n: eco.energyToday, goal: eco.goal })}</span>}
              {eco && <span className="coins">🪙 {eco.coins}</span>}
            </div>
          </header>
        )}
        <input
          ref={inputRef}
          className="quick-input"
          value={text}
          placeholder={t('tasks.placeholder')}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          autoFocus
        />
        {mode === 'quick' && (
          <>
            {!!view?.hints.length && (
              <div className="chips">
                {view.hints.slice(0, 4).map((h) => (
                  <button
                    key={h}
                    className="chip"
                    onClick={() => (setText(t(h)), inputRef.current?.focus())}
                  >
                    {t(h)}
                  </button>
                ))}
              </div>
            )}
            <button className="link" onClick={() => switchMode('panel')}>
              {t('tasks.openPanel')} {view ? `· ${view.counts.done}/${view.counts.total}` : ''}
            </button>
          </>
        )}
        {mode === 'panel' && (
          <div className="list">
            {open.length === 0 && <div className="empty">{t('tasks.empty')}</div>}
            {open.map((item) => (
              <Item
                key={item.id}
                item={item}
                t={t}
                isDone={isDone}
                onToggle={toggle}
                onSplit={split}
                onDelete={remove}
                focusFirstEmpty={focusId === item.id}
                onFocused={() => setFocusId(null)}
                onDragStart={() => (dragId.current = item.id)}
                onDrop={() => onDrop(item.id)}
              />
            ))}
            {done.length > 0 && (
              <>
                <button className="link done-toggle" onClick={() => setDoneOpen((o) => !o)}>
                  {doneOpen ? '▾' : '▸'} {t('tasks.done', { n: done.length })}
                </button>
                {doneOpen &&
                  done.map((item) => (
                    <Item
                      key={item.id}
                      item={item}
                      t={t}
                      isDone={isDone}
                      onToggle={toggle}
                      onSplit={split}
                      onDelete={remove}
                      focusFirstEmpty={false}
                      onFocused={() => {}}
                    />
                  ))}
              </>
            )}
          </div>
        )}
        {undoUntil > 0 && (
          <div className="toast">
            {t('tasks.deleted')}
            <button
              onClick={() => {
                window.squish.send('tasks:undoDelete', null);
                setUndoUntil(0);
              }}
            >
              {t('tasks.undo')}
            </button>
          </div>
        )}
      </div>
      {bursts.map((b) => (
        <div key={b.id} className="burst" style={{ left: b.x, top: b.y }}>
          {Array.from({ length: b.n }, (_, i) => (
            <span key={i} className="coin" style={{ ['--i' as string]: String(i) }} />
          ))}
        </div>
      ))}
      {surprise && <div className="surprise">{t('tasks.surprise')}</div>}
    </div>
  );
}

type T = ReturnType<typeof useI18n>;

function Item(p: {
  item: TaskItemView;
  t: T;
  isDone: (id: string, done: boolean) => boolean;
  onToggle: (id: string, done: boolean, el: HTMLElement) => void;
  onSplit: (id: string) => void;
  onDelete: (id: string) => void;
  focusFirstEmpty: boolean;
  onFocused: () => void;
  onDragStart?: () => void;
  onDrop?: () => void;
}) {
  const { item, t } = p;
  const done = p.isDone(item.id, item.done);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title);
  const kidsRef = useRef<HTMLDivElement>(null);

  // После «Разбить» — фокус на первую пустую подзадачу.
  useEffect(() => {
    if (!p.focusFirstEmpty) return;
    const el = kidsRef.current?.querySelector<HTMLInputElement>('input[data-empty="1"]');
    if (el) {
      el.focus();
      p.onFocused();
    }
  });

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft !== item.title)
      window.squish.send('tasks:rename', { id: item.id, title: draft });
    else setDraft(item.title);
  };

  return (
    <div
      className={`item${done ? ' is-done' : ''}`}
      draggable={!!p.onDragStart && !editing}
      onDragStart={p.onDragStart}
      onDragOver={(e) => p.onDrop && e.preventDefault()}
      onDrop={p.onDrop}
    >
      <div className="row">
        <button
          className={`check${done ? ' on' : ''}`}
          aria-label={item.title}
          onClick={(e) => p.onToggle(item.id, done, e.currentTarget)}
        >
          <svg viewBox="0 0 20 20" aria-hidden>
            <path d="M5 10.5 L8.5 14 L15 6.5" />
          </svg>
        </button>
        {editing ? (
          <input
            className="edit"
            data-edit="1"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setDraft(item.title);
                setEditing(false);
              }
            }}
          />
        ) : (
          <span
            className="title"
            onDoubleClick={() => !done && (setDraft(item.title), setEditing(true))}
          >
            {item.title}
          </span>
        )}
        {item.size !== 'S' && (
          <span className={`size size-${item.size}`}>{t(`tasks.size.${item.size}`)}</span>
        )}
        {item.recurring && (
          <span className="icon" title={t('tasks.recurring')}>
            ↻
          </span>
        )}
        {item.remindAt && <span className="icon">⏰ {item.remindAt}</span>}
        <span className="actions">
          {!done && item.children.length === 0 && (
            <button className="mini" onClick={() => p.onSplit(item.id)}>
              {t('tasks.split')}
            </button>
          )}
          <button
            className="mini x"
            aria-label={t('tasks.delete')}
            onClick={() => p.onDelete(item.id)}
          >
            ✕
          </button>
        </span>
      </div>
      {item.children.length > 0 && (
        <div
          className="kids"
          ref={kidsRef}
          onBlur={(e) => {
            // Ушли из всех подзадач — пустые удаляются (R0).
            if (!kidsRef.current?.contains(e.relatedTarget as Node | null)) {
              window.squish.send('tasks:blurSubtasks', item.id);
            }
          }}
        >
          {item.children.map((c) => (
            <Subtask key={c.id} c={c} t={t} isDone={p.isDone} onToggle={p.onToggle} />
          ))}
        </div>
      )}
    </div>
  );
}

function Subtask(p: {
  c: { id: string; title: string; done: boolean };
  t: T;
  isDone: (id: string, done: boolean) => boolean;
  onToggle: (id: string, done: boolean, el: HTMLElement) => void;
}) {
  const [draft, setDraft] = useState(p.c.title);
  useEffect(() => setDraft(p.c.title), [p.c.title]);
  const done = p.isDone(p.c.id, p.c.done);
  const save = () => {
    if (draft.trim() !== p.c.title)
      window.squish.send('tasks:rename', { id: p.c.id, title: draft });
  };
  return (
    <div className={`row sub${done ? ' is-done' : ''}`}>
      <button
        className={`check small${done ? ' on' : ''}`}
        disabled={!p.c.title}
        aria-label={p.c.title || p.t('tasks.subtaskPlaceholder')}
        onClick={(e) => p.onToggle(p.c.id, done, e.currentTarget)}
      >
        <svg viewBox="0 0 20 20" aria-hidden>
          <path d="M5 10.5 L8.5 14 L15 6.5" />
        </svg>
      </button>
      <input
        className="sub-input"
        data-empty={p.c.title ? '0' : '1'}
        data-edit="1"
        value={draft}
        placeholder={p.t('tasks.subtaskPlaceholder')}
        maxLength={200}
        readOnly={done}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            save();
            // Enter — к следующей подзадаче
            const next = (
              e.currentTarget.closest('.row')?.nextElementSibling as HTMLElement | null
            )?.querySelector('input');
            next?.focus();
          }
        }}
      />
    </div>
  );
}
