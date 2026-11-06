import { useEffect, useRef, useState } from 'react';
import {
  AREAS,
  starterPlan,
  suggestedJourneys,
  type ActivityAnswer,
  type Area,
  type Goals,
  type OverwhelmAnswer,
  type SleepAnswer,
} from '../../core/goals';
import { SPECIES, type Palette, type SpeciesId, type Strictness } from '../../core/types';
import { createPetRenderer } from '../pet/createPetRenderer';
import type { PetRenderer } from '../pet/PetRenderer';
import { useI18n } from '../shared/useI18n';

const STEPS = 8;
/** Черты на выбор при знакомстве (остальные раскроются в приключениях). */
const PICK_TRAITS = ['likesStars', 'collectsPebbles', 'napsInSun'] as const;
const AREA_ICON: Record<Area, string> = {
  eyes: '👀',
  back: '🪑',
  water: '💧',
  sleep: '🌙',
  stress: '🌀',
  focus: '🎯',
  routine: '🌱',
};
const PLAN_ICON: Record<string, string> = {
  'plan.water': '💧',
  'plan.stretch': '🦒',
  'plan.window': '🪟',
  'plan.bedtime': '🌙',
  'plan.breaths': '🍃',
  'plan.oneStep': '🪜',
  'plan.mainThing': '🎯',
  'plan.morning': '🌻',
  'plan.happy': '😊',
};

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
  const [autostart, setAutostart] = useState(true);
  const [trait, setTrait] = useState<string | null>(null);
  const [sleep, setSleep] = useState<SleepAnswer | null>(null);
  const [activity, setActivity] = useState<ActivityAnswer | null>(null);
  const [overwhelm, setOverwhelm] = useState<OverwhelmAnswer | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [planOff, setPlanOff] = useState<string[]>([]);
  const [journeys, setJourneys] = useState<string[]>([]);
  const goals: Goals = {
    areas,
    sleep,
    activity,
    overwhelm,
    setAt: null,
    reviewAsked: false,
  };
  const plan = starterPlan(goals);
  const offerJourneys = suggestedJourneys(goals);
  const toggle = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  // Перегруз или стресс — строгость по умолчанию «мягко» (можно поменять на следующем экране).
  const goStrictness = () => {
    if (overwhelm === 'often' || areas.includes('stress')) setStrictness('soft');
    setStep(6);
  };
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

  const finish = (withPlan: boolean) =>
    window.squish.send('onboarding:finish', {
      name: name.trim() || t(species === 'blob' ? 'pet.defaultName' : `species.${species}.name`),
      species,
      palette,
      goalGlasses: glasses,
      strictness,
      tasks: [],
      autostart,
      ...(trait ? { trait } : {}),
      goals: { areas, sleep, activity, overwhelm },
      plan: withPlan ? plan.filter((k) => !planOff.includes(k)) : [],
      journeys: withPlan ? journeys.filter((j) => offerJourneys.includes(j as never)) : [],
    });

  const dots = (
    <div className="dots">
      {Array.from({ length: STEPS }, (_, i) => (
        <i key={i} className={i === step ? 'on' : i < step ? 'past' : ''} />
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
          <div className="say">{t('onb.selfcare.q')}</div>
          <div className="choices column">
            {(['onb.selfcare.a1', 'onb.selfcare.a2'] as const).map((k, i) => (
              <button key={k} className={`choice wide tone-${i}`} onClick={() => setStep(2)}>
                <span>{t(k)}</span>
              </button>
            ))}
          </div>
          <Nav t={t} back={() => setStep(0)} />
        </section>
      )}
      {step === 2 && (
        <section>
          <h1>{t('onb.trait.title')}</h1>
          <p className="muted">{t('onb.trait.hint')}</p>
          <div className="choices column">
            {PICK_TRAITS.map((k) => (
              <button
                key={k}
                className={`choice wide${trait === k ? ' on' : ''}`}
                onClick={() => setTrait(k)}
              >
                <b>{t(`trait.${k}`)}</b>
              </button>
            ))}
          </div>
          <Nav t={t} back={() => setStep(1)} next={() => setStep(3)} />
        </section>
      )}
      {step === 3 && (
        <section>
          <div className="kicker">{t('onb.life.kicker')}</div>
          <h1>{t('onb.life.title')}</h1>
          <p className="muted">{t('onb.life.hint')}</p>
          <Ask
            label={t('onb.life.sleep')}
            value={sleep}
            options={['ok', 'little', 'hardToWake'] as const}
            t={t}
            prefix="onb.sleep"
            onChange={setSleep}
          />
          <Ask
            label={t('onb.life.activity')}
            value={activity}
            options={['low', 'some', 'lots'] as const}
            t={t}
            prefix="onb.activity"
            onChange={setActivity}
          />
          <Ask
            label={t('onb.life.overwhelm')}
            value={overwhelm}
            options={['rare', 'sometimes', 'often'] as const}
            t={t}
            prefix="onb.overwhelm"
            onChange={setOverwhelm}
          />
          <Nav t={t} back={() => setStep(2)} next={() => setStep(4)} />
        </section>
      )}
      {step === 4 && (
        <section>
          <div className="kicker">{t('onb.areas.kicker')}</div>
          <h1>{t('onb.areas.title')}</h1>
          <div className="areas">
            {AREAS.map((a) => (
              <button
                key={a}
                className={`area${areas.includes(a) ? ' on' : ''}`}
                aria-pressed={areas.includes(a)}
                onClick={() => setAreas((l) => toggle(l, a))}
              >
                <span className="area-icon" aria-hidden>
                  {AREA_ICON[a]}
                </span>
                <span>{t(`goal.${a}`)}</span>
                <span className="plus" aria-hidden>
                  {areas.includes(a) ? '✓' : '+'}
                </span>
              </button>
            ))}
          </div>
          <Nav t={t} back={() => setStep(3)} next={() => setStep(5)} />
        </section>
      )}
      {step === 5 && (
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
          <Nav t={t} back={() => setStep(4)} next={goStrictness} />
        </section>
      )}
      {step === 6 && (
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
          <Nav t={t} back={() => setStep(5)} next={() => setStep(7)} />
        </section>
      )}
      {step === 7 && (
        <section>
          <div className="say">{t('onb.plan.say')}</div>
          <div className="plan">
            <div className="plan-title">
              {t('onb.plan.title', {
                name:
                  name.trim() ||
                  t(species === 'blob' ? 'pet.defaultName' : `species.${species}.name`),
              })}
            </div>
            <div className="muted plan-hint">{t('onb.plan.hint')}</div>
            {plan.map((k) => (
              <label key={k} className="plan-item">
                <input
                  type="checkbox"
                  checked={!planOff.includes(k)}
                  onChange={() => setPlanOff((l) => toggle(l, k))}
                />
                <span aria-hidden>{PLAN_ICON[k] ?? '•'}</span>
                <span>{t(k)}</span>
              </label>
            ))}
            {offerJourneys.map((j) => (
              <label key={j} className="plan-item journey-offer">
                <input
                  type="checkbox"
                  checked={journeys.includes(j)}
                  onChange={() => setJourneys((l) => toggle(l, j))}
                />
                <span aria-hidden>🧭</span>
                <span>{t('onb.plan.journey', { name: t(`journey.${j}`) })}</span>
              </label>
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
            <button className="btn" onClick={() => setStep(6)}>
              {t('onboarding.back')}
            </button>
            <span>
              <button className="btn" onClick={() => finish(false)}>
                {t('onboarding.skip')}
              </button>{' '}
              <button className="btn primary" onClick={() => finish(true)}>
                {t('onb.plan.go')}
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

/** Вопрос «как жизнь» с вариантами-чипами. Можно не отвечать; повторный клик снимает выбор. */
function Ask<T extends string>({
  label,
  value,
  options,
  t,
  prefix,
  onChange,
}: {
  label: string;
  value: T | null;
  options: readonly T[];
  t: ReturnType<typeof useI18n>;
  prefix: string;
  onChange: (v: T | null) => void;
}) {
  return (
    <div className="ask">
      <div className="ask-label">{label}</div>
      <div className="chips">
        {options.map((o) => (
          <button
            key={o}
            className={`chip${value === o ? ' on' : ''}`}
            aria-pressed={value === o}
            onClick={() => onChange(value === o ? null : o)}
          >
            {t(`${prefix}.${o}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
