import { useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../../core/types';
import { createPetRenderer } from '../pet/createPetRenderer';
import type { PetRenderer } from '../pet/PetRenderer';
import { useI18n } from '../shared/useI18n';

const DRAG_THRESHOLD_PX = 4;

export function Widget() {
  const hostRef = useRef<HTMLDivElement>(null);
  const petRef = useRef<PetRenderer | null>(null);
  const [dragging, setDragging] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [hover, setHover] = useState(false);
  const [flights, setFlights] = useState<{ id: number; n: number; surprise: boolean }[]>([]);
  const t = useI18n();

  // Питомец: создаём один раз, дальше только команды через PetRenderer.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const pet = createPetRenderer('svgBlob', host);
    petRef.current = pet;

    const apply = (s: Snapshot) => {
      setSnap(s);
      pet.setPalette(s.pet.palette);
      pet.setStage(s.pet.stage);
      pet.setCozy(s.pet.cozy);
      pet.setState(s.pet.visual);
    };
    void window.squish.invoke('app:getSnapshot').then(apply);
    const offs = [
      window.squish.on('snapshot', apply),
      window.squish.on('pet:play', (r) => void pet.play(r)),
      window.squish.on('pet:eyes', (d) => pet.lookAt(d)),
      window.squish.on('pet:paused', (p) => pet.setPaused(p)),
      window.squish.on('pet:coins', ({ count, surprise }) => {
        // Монетки влетают слева (со стороны окна задач) и падают в питомца.
        const f = { id: Date.now() + Math.random(), n: Math.min(8, Math.max(1, count)), surprise };
        setFlights((l) => [...l, f]);
        window.setTimeout(() => setFlights((l) => l.filter((x) => x.id !== f.id)), 1400);
      }),
    ];
    const onVisibility = () => pet.setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      offs.forEach((off) => off());
      document.removeEventListener('visibilitychange', onVisibility);
      pet.destroy();
      petRef.current = null;
    };
  }, []);

  // Прозрачные места пропускают клики: сообщаем main, над питомцем ли курсор.
  useEffect(() => {
    let last: boolean | null = null;
    let hideTimer: number | null = null;
    const report = (hit: boolean) => {
      if (hit) {
        if (hideTimer !== null) window.clearTimeout(hideTimer);
        hideTimer = null;
        setHover(true);
      } else if (hideTimer === null) {
        // кнопки исчезают не сразу — чтобы успеть до них дотянуться
        hideTimer = window.setTimeout(() => {
          hideTimer = null;
          setHover(false);
        }, 1500);
      }
      if (hit === last) return;
      last = hit;
      window.squish.send('widget:hover', hit);
    };
    const onMove = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      report(!!el?.closest('[data-hit]'));
    };
    const onLeave = () => report(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    report(false);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  // Клик = подпрыгнуть; сдвиг больше 4 px = перетаскивание (его ведёт main по позиции курсора).
  const press = useRef<{ x: number; y: number; dragging: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (!(e.target instanceof Element) || !e.target.closest('[data-hit]')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    press.current = { x: e.clientX, y: e.clientY, dragging: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    onHoverMove(e);
    if (press.current?.dragging) trackShake(e);
    const p = press.current;
    if (!p || p.dragging) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > DRAG_THRESHOLD_PX) {
      p.dragging = true;
      setDragging(true);
      window.squish.send('widget:dragStart', {
        offsetX: Math.round(p.x),
        offsetY: Math.round(p.y),
      });
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const p = press.current;
    press.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    if (!p) return;
    if (p.dragging) {
      setDragging(false);
      window.squish.send('widget:dragEnd', null);
      // Потрясли при перетаскивании — голова кружится.
      if (shake.current.flips >= 4) void petRef.current?.play('dizzy');
      shake.current.flips = 0;
    } else {
      void petRef.current?.play('bounce');
      window.squish.send('widget:click', null);
    }
  };
  // ── Тактильность (SPEC 4.10, P1): без наград, только радость ──
  const pet = useRef({ lastX: 0, dir: 0, flips: 0, since: 0, cooldown: 0 });
  const onHoverMove = (e: React.PointerEvent) => {
    if (press.current) return;
    const p = pet.current;
    const now = performance.now();
    const dx = e.clientX - p.lastX;
    p.lastX = e.clientX;
    if (Math.abs(dx) < 2 || now < p.cooldown) return;
    const dir = Math.sign(dx);
    if (dir !== p.dir) {
      if (now - p.since > 1500) p.flips = 0;
      p.dir = dir;
      p.flips += 1;
      p.since = now;
      // Медленно водит курсором туда-обратно над питомцем — гладит.
      if (p.flips >= 5) {
        p.flips = 0;
        p.cooldown = now + 4000;
        void petRef.current?.play('purr');
      }
    }
  };
  const shake = useRef({ lastX: 0, dir: 0, flips: 0, since: 0 });
  const trackShake = (e: React.PointerEvent) => {
    const s = shake.current;
    const dx = e.screenX - s.lastX;
    s.lastX = e.screenX;
    if (Math.abs(dx) < 8) return;
    const dir = Math.sign(dx);
    if (dir !== s.dir) {
      const now = performance.now();
      if (now - s.since > 700) s.flips = 0;
      s.dir = dir;
      s.flips += 1;
      s.since = now;
    }
  };
  const onDoubleClick = () => void petRef.current?.play('giggle'); // пощекотать

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    window.squish.send('widget:contextMenu', null);
  };

  return (
    <div className="widget" onContextMenu={onContextMenu}>
      <div
        ref={hostRef}
        className={`pet-host${dragging ? ' dragging' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      />
      {snap && <Bubble snap={snap} t={t} />}
      <HoverButtons visible={hover && !dragging} t={t} />
      {flights.map((f) => (
        <div key={f.id} className={`flight${f.surprise ? ' gold' : ''}`}>
          {Array.from({ length: f.n }, (_, i) => (
            <span key={i} className="coin" style={{ ['--i' as string]: String(i) }} />
          ))}
        </div>
      ))}
      <div className="below">
        {snap && <Needs snap={snap} t={t} />}
        {snap && snap.tasksToday.total > 0 && (
          <span className="counter">{t('tasks.counter', snap.tasksToday)}</span>
        )}
      </div>
    </div>
  );
}

type T = ReturnType<typeof useI18n>;

/** Облачко над питомцем: preBreak (SPEC 3.2) или реплика. data-hit — чтобы кнопки ловили клики. */
function Bubble({ snap, t }: { snap: Snapshot; t: T }) {
  const v = snap.scheduler;
  if (v.phase === 'preBreak' || v.phase === 'waitingForPause') {
    return (
      <div className="bubble" data-hit>
        <div>
          {v.phase === 'preBreak'
            ? t('break.preBreak', { sec: v.preBreakSecLeft ?? 0 })
            : t('break.waiting')}
        </div>
        <div className="actions">
          <button className="primary" onClick={() => window.squish.send('break:startNow', null)}>
            {t('break.startNow')}
          </button>
          {v.canPostpone && (
            <button onClick={() => window.squish.send('break:postpone', null)}>
              {t('break.postpone')}
            </button>
          )}
          {v.canSkip && (
            <button onClick={() => window.squish.send('break:skip', null)}>
              {t('break.skip')}
            </button>
          )}
        </div>
      </div>
    );
  }
  if (snap.bubble) {
    const b = snap.bubble;
    return (
      <div className="bubble" data-hit>
        <div>{t(b.textKey, b.params)}</div>
        {b.actions?.length ? (
          <div className="actions">
            {b.actions.map((a, i) => (
              <button
                key={a.action}
                className={i === 0 ? 'primary' : ''}
                onClick={() => window.squish.send('bubble:action', a.action)}
              >
                {t(a.labelKey)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }
  return null;
}

/** Кнопки при наведении (SPEC 2.1): 💧 «выпил воды» и ☑ «задачи». */
function HoverButtons({ visible, t }: { visible: boolean; t: T }) {
  return (
    <div className={`hover-buttons${visible ? ' visible' : ''}`} data-hit>
      <button
        className="round"
        title={t('water.button')}
        aria-label={t('water.button')}
        onClick={() => window.squish.send('water:drink', null)}
      >
        💧
      </button>
      <button
        className="round"
        title={t('tasks.button')}
        aria-label={t('tasks.button')}
        onClick={() => window.squish.send('tasks:open', null)}
      >
        ☑
      </button>
    </div>
  );
}

function Needs({ snap, t }: { snap: Snapshot; t: T }) {
  const items: [keyof Snapshot['pet']['needs'], string][] = [
    ['water', '💧'],
    ['eyes', '👁'],
    ['movement', '🤸'],
  ];
  return (
    <div className="needs">
      {items.map(([k, icon]) => {
        const v = Math.round(snap.pet.needs[k]);
        return (
          <div
            key={k}
            className={`need${v < 25 ? ' low' : ''}`}
            title={`${t(`needs.${k}`)}: ${v}%`}
          >
            <span aria-hidden>{icon}</span>
            <div className="bar">
              <div className="fill" style={{ width: `${v}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
