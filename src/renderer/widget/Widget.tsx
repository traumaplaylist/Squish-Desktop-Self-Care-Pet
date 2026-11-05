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
    } else {
      void petRef.current?.play('bounce');
      window.squish.send('widget:click', null);
    }
  };
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
      />
      {snap && <Bubble snap={snap} t={t} />}
      <HoverButtons visible={hover && !dragging} t={t} />
      <div className="below" />
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
