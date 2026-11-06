import { useEffect, useRef, useState } from 'react';
import { SPECIES, type Palette, type SpeciesId, type Strictness } from '../../core/types';
import { createPetRenderer } from '../pet/createPetRenderer';
import type { PetRenderer } from '../pet/PetRenderer';
import { useI18n } from '../shared/useI18n';

const HINTS = ['hint.lunch', 'hint.outside', 'hint.airing'];

/** Онбординг (SPEC 2.5): 4 экрана, ничего личного не спрашиваем. */
export function Onboarding() {
  const t = useI18n();
  const [step, setStep] = useState(0);
  const [hatched, setHatched] = useState(false);
  const [name, setName] = useState('');
  const [palette, setPalette] = useState<Palette>('mint');
  const [species, setSpecies] = useState<SpeciesId>('blob');
  const [glasses, setGlasses] = useState(8);
  const [strictness, setStrictness] = useState<Strictness>('normal');
  const [tasks, setTasks] = useState<string[]>(['', '', '']);
  const [autostart, setAutostart] = useState(true);
  const host = useRef<HTMLDivElement>(null);
  const pet = useRef<PetRenderer | null>(null);

  useEffect(() => {
    if (!hatched || !host.current) return;
    const p = createPetRenderer(species, host.current);
    pet.current = p;
    p.setStage('baby');
    p.setPalette(palette);
    p.setState('happy');
    void p.play('celebrate');
    return () => {
      p.destroy();
      if (pet.current === p) pet.current = null;
    };
    // палитра применяется отдельным эффектом — без пересоздания
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hatched, species]);
  useEffect(() => pet.current?.setPalette(palette), [palette, hatched]);

  const finish = () =>
    window.squish.send('onboarding:finish', {
      name: name.trim() || t(species === 'blob' ? 'pet.defaultName' : `species.${species}.name`),
      species,
      palette,
      goalGlasses: glasses,
      strictness,
      tasks: tasks.map((x) => x.trim()).filter(Boolean),
      autostart,
    });

  const dots = (
    <div className="dots">
      {[0, 1, 2, 3].map((i) => (
        <i key={i} className={i === step ? 'on' : ''} />
      ))}
    </div>
  );

  return (
    <div className="page onboarding">
      {dots}
      {step === 0 && (
        <section>
          <h1>{hatched ? t('onboarding.hello') : t('onboarding.egg')}</h1>
          {!hatched ? (
            <button
              className="egg"
              aria-label={t('onboarding.hatch')}
              onClick={() => setHatched(true)}
            >
              <svg viewBox="0 0 120 150" width="150" height="180" aria-hidden>
                <ellipse cx="60" cy="140" rx="40" ry="6" fill="rgba(40,30,60,.12)" />
                <path
                  d="M60 8 C95 8 112 62 112 92 C112 124 90 142 60 142 C30 142 8 124 8 92 C8 62 25 8 60 8 Z"
                  fill="#fff6e6"
                  stroke="#ead9bb"
                  strokeWidth="3"
                />
                <circle cx="44" cy="70" r="7" fill="#9ee6cf" opacity=".7" />
                <circle cx="78" cy="96" r="9" fill="#cdb9f5" opacity=".7" />
                <circle cx="56" cy="116" r="5" fill="#ffc9a8" opacity=".8" />
              </svg>
              <span className="muted">{t('onboarding.hatch')}</span>
            </button>
          ) : (
            <>
              <div className="pet-host" ref={host} />
              <label className="name-field">
                {t('onboarding.name')}
                <input
                  type="text"
                  maxLength={24}
                  placeholder={t(
                    species === 'blob' ? 'pet.defaultName' : `species.${species}.name`,
                  )}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </label>
              <div className="chips species">
                {SPECIES.map((sp) => (
                  <button
                    key={sp}
                    className={`chip${sp === species ? ' on' : ''}`}
                    onClick={() => setSpecies(sp)}
                  >
                    {t(`species.${sp}`)}
                  </button>
                ))}
              </div>
              {species === 'blob' && (
                <div className="chips colors">
                  {(['mint', 'peach', 'lavender'] as Palette[]).map((p) => (
                    <button
                      key={p}
                      className={`chip color-${p}${p === palette ? ' on' : ''}`}
                      onClick={() => setPalette(p)}
                    >
                      {t(`palette.${p}`)}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <Nav t={t} next={hatched ? () => setStep(1) : undefined} />
        </section>
      )}
      {step === 1 && (
        <section>
          <h1>{t('onboarding.water')}</h1>
          <p className="muted">{t('onboarding.waterHint')}</p>
          <div className="choices">
            {[6, 8, 10].map((n) => (
              <button
                key={n}
                className={`choice${n === glasses ? ' on' : ''}`}
                onClick={() => setGlasses(n)}
              >
                <b>{n}</b>
                <span>{t('onboarding.glasses')}</span>
              </button>
            ))}
          </div>
          <Nav t={t} back={() => setStep(0)} next={() => setStep(2)} />
        </section>
      )}
      {step === 2 && (
        <section>
          <h1>{t('onboarding.strict')}</h1>
          <div className="choices column">
            {(['soft', 'normal', 'strict'] as Strictness[]).map((k) => (
              <button
                key={k}
                className={`choice wide${k === strictness ? ' on' : ''}`}
                onClick={() => setStrictness(k)}
              >
                <b>{t(`strictness.${k}`)}</b>
                <span>{t(`strictness.${k}.hint`)}</span>
              </button>
            ))}
          </div>
          <Nav t={t} back={() => setStep(1)} next={() => setStep(3)} />
        </section>
      )}
      {step === 3 && (
        <section>
          <h1>{t('onboarding.tasks')}</h1>
          <p className="muted">{t('onboarding.tasksHint')}</p>
          {tasks.map((v, i) => (
            <input
              key={i}
              type="text"
              className="task-input"
              maxLength={200}
              value={v}
              placeholder={t('tasks.placeholder')}
              onChange={(e) => setTasks((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
            />
          ))}
          <div className="chips">
            {HINTS.map((h) => (
              <button
                key={h}
                className="chip"
                onClick={() =>
                  setTasks((l) => {
                    const i = l.findIndex((x) => !x.trim());
                    return i < 0 ? l : l.map((x, j) => (j === i ? t(h) : x));
                  })
                }
              >
                + {t(h)}
              </button>
            ))}
          </div>
          <label className="autostart">
            <input
              type="checkbox"
              checked={autostart}
              onChange={(e) => setAutostart(e.target.checked)}
            />
            {t('onboarding.autostart')}
          </label>
          <div className="nav">
            <button className="btn" onClick={() => setStep(2)}>
              {t('onboarding.back')}
            </button>
            <span>
              <button className="btn" onClick={() => (setTasks(['', '', '']), finish())}>
                {t('onboarding.skip')}
              </button>{' '}
              <button className="btn primary" onClick={finish}>
                {t('onboarding.done')}
              </button>
            </span>
          </div>
        </section>
      )}
    </div>
  );
}

function Nav({
  t,
  back,
  next,
}: {
  t: ReturnType<typeof useI18n>;
  back?: () => void;
  next?: (() => void) | undefined;
}) {
  return (
    <div className="nav">
      {back ? (
        <button className="btn" onClick={back}>
          {t('onboarding.back')}
        </button>
      ) : (
        <span />
      )}
      <button className="btn primary" disabled={!next} onClick={next}>
        {t('onboarding.next')}
      </button>
    </div>
  );
}
