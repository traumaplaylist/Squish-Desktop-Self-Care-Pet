import { useEffect, useRef, useState } from 'react';
import { getExercise } from '../../core/exercises';
import type { Snapshot } from '../../core/types';
import { createPetRenderer } from '../pet/createPetRenderer';
import type { PetRenderer } from '../pet/PetRenderer';
import { useI18n } from '../shared/useI18n';

const RING_R = 54;
const RING_LEN = 2 * Math.PI * RING_R;

function fmt(sec: number): { min: string; sec: string } {
  return { min: String(Math.floor(sec / 60)), sec: String(sec % 60).padStart(2, '0') };
}

/** Оверлей перерыва (SPEC 2.2). Основной монитор — питомец и упражнение, остальные — затемнение и таймер. */
export function Overlay({ primary }: { primary: boolean }) {
  const t = useI18n();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [phase, setPhase] = useState<'in' | 'shown' | 'done' | 'out'>('in');
  const hostRef = useRef<HTMLDivElement>(null);
  const petRef = useRef<PetRenderer | null>(null);

  useEffect(() => {
    void window.squish.invoke('app:getSnapshot').then(setSnap);
    const offs = [
      window.squish.on('snapshot', setSnap),
      window.squish.on('overlay:done', () => {
        setPhase('done');
        void petRef.current?.play('celebrate');
      }),
      window.squish.on('overlay:fadeOut', () => setPhase('out')),
    ];
    const raf = requestAnimationFrame(() => setPhase('shown')); // один кадр — запустить CSS-переход появления
    return () => {
      offs.forEach((o) => o());
      cancelAnimationFrame(raf);
    };
  }, []);

  // Питомец ×3 — только на основном мониторе.
  useEffect(() => {
    if (!primary || !hostRef.current) return;
    const pet = createPetRenderer('svgBlob', hostRef.current);
    petRef.current = pet;
    return () => {
      pet.destroy();
      petRef.current = null;
    };
  }, [primary]);

  // Последний известный перерыв держим, чтобы во время «радости» и затухания не мигал пустой экран.
  const lastBreak = useRef<Snapshot['scheduler']['break']>(null);
  if (snap?.scheduler.break) lastBreak.current = snap.scheduler.break;
  const br = lastBreak.current;

  useEffect(() => {
    if (!snap || !petRef.current) return;
    petRef.current.setPalette(snap.pet.palette);
    petRef.current.setStage(snap.pet.stage);
    // Досидел — радуется; во время упражнения — анимация упражнения.
    petRef.current.setState(
      phase !== 'done' && snap.pet.visual.startsWith('onBreak:') ? snap.pet.visual : 'happy',
    );
  }, [snap, phase]);

  const opacity = snap?.overlayOpacity ?? 0.8;
  const v = snap?.scheduler;
  const secLeft = phase === 'done' ? 0 : (v?.break?.secLeft ?? 0);
  const total = br ? Math.max(1, Math.round((br.endsAt - br.startedAt) / 1000)) : 1;
  const progress = 1 - secLeft / total;
  const time = fmt(secLeft);
  const exercise = br ? getExercise(br.exerciseId) : null;
  // «Обычный»: «Пропустить» появляется через 5 с — main пересчитывает canSkip каждую секунду.
  const skipVisible = !!v?.canSkip;

  const ring = (size: number) => (
    <svg className="ring" width={size} height={size} viewBox="0 0 120 120" aria-hidden>
      <circle cx="60" cy="60" r={RING_R} className="ring-bg" />
      <circle
        cx="60"
        cy="60"
        r={RING_R}
        className="ring-fg"
        strokeDasharray={RING_LEN}
        strokeDashoffset={RING_LEN * (1 - progress)}
      />
      <text x="60" y="66" textAnchor="middle" className="ring-text">
        {total >= 60 ? t('break.minSecLeft', time) : t('break.secLeft', { sec: secLeft })}
      </text>
    </svg>
  );

  return (
    <div className={`overlay ${phase}`} style={{ ['--dim' as string]: String(opacity) }}>
      {primary ? (
        <div className="stage">
          <div className="big-pet" ref={hostRef} />
          {phase === 'done' ? (
            <div className="title">{t('break.done')}</div>
          ) : (
            exercise && (
              <>
                <div className="kind">{t(br?.kind === 'long' ? 'break.long' : 'break.micro')}</div>
                <div className="title">{t(exercise.titleKey)}</div>
                <ol className="steps">
                  {exercise.stepsKeys.map((k) => (
                    <li key={k}>{t(k)}</li>
                  ))}
                </ol>
                {ring(132)}
                <div className="buttons">
                  {v?.canPostpone && (
                    <button onClick={() => window.squish.send('break:postpone', null)}>
                      {t('break.postpone')}
                    </button>
                  )}
                  {skipVisible && (
                    <button onClick={() => window.squish.send('break:skip', null)}>
                      {t('break.skip')}
                    </button>
                  )}
                </div>
                {skipVisible && <div className="hint">{t('break.escHint')}</div>}
                {v?.strictness === 'strict' && (
                  <div className="hint emergency">{t('break.emergency')}</div>
                )}
              </>
            )
          )}
        </div>
      ) : (
        <div className="stage small">{phase !== 'done' && ring(96)}</div>
      )}
    </div>
  );
}
