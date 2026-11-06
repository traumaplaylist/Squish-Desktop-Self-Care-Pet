import { useEffect, useRef, useState } from 'react';
import type { HomeStats } from '../../core/types';
import { createPetRenderer } from '../pet/createPetRenderer';
import { useI18n } from '../shared/useI18n';

type Tab = 'today' | 'week' | 'pet';
type T = ReturnType<typeof useI18n>;

/** «Дом питомца» (SPEC 2.3): «Сегодня» и «Неделя» — P0, «Питомец» — P1 (коротко). Магазин — не первая вкладка. */
export function Home() {
  const t = useI18n();
  const [tab, setTab] = useState<Tab>('today');
  const [s, setS] = useState<HomeStats | null>(null);

  useEffect(() => {
    const load = () => void window.squish.invoke('home:get').then(setS);
    load();
    // Обновляем раз в 10 с и при возврате в окно — дёшево, данных мало.
    const id = window.setInterval(load, 10_000);
    window.addEventListener('focus', load);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', load);
    };
  }, []);

  return (
    <div className="page">
      <h1>{t('home.title')}</h1>
      <div className="tabs" role="tablist">
        {(['today', 'week', 'pet'] as Tab[]).map((k) => (
          <button key={k} role="tab" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {t(`home.tab.${k}`)}
          </button>
        ))}
      </div>
      {!s ? null : tab === 'today' ? (
        <Today s={s} t={t} />
      ) : tab === 'week' ? (
        <Week s={s} t={t} />
      ) : (
        <Pet s={s} t={t} />
      )}
    </div>
  );
}

const fmtMin = (ms: number | null) => (ms === null ? '—' : `${Math.round(ms / 60000)}`);

function Today({ s, t }: { s: HomeStats; t: T }) {
  const d = s.today;
  const items: [string, string][] = [
    [t('home.tasks'), t('home.tasksValue', { done: d.tasksDone, created: d.tasksCreated })],
    [
      t('home.breaks'),
      t('home.breaksValue', {
        done: d.breaksDone,
        skipped: d.breaksSkipped,
        postponed: d.breaksPostponed,
      }),
    ],
    [t('home.natural'), String(d.naturalBreaks)],
    [t('home.water'), t('home.ofGoal', { n: d.water, goal: d.waterGoal })],
    [t('home.active'), t('home.minutes', { n: fmtMin(d.activeMs) })],
    [t('home.energy'), t('home.ofGoal', { n: d.energy ?? 0, goal: d.energyGoal })],
    [t('home.streak'), t('home.days', { n: s.pet.streak })],
  ];
  return (
    <>
      <div className="card score">
        <div>
          <div className="muted">{t('home.score')}</div>
          <div className="hint muted">{t('home.scoreHint')}</div>
        </div>
        {/* Нейтрально: без красного и без «плохо» (SPEC 2.3) */}
        <div className="score-value">{d.score ?? '—'}</div>
      </div>
      <div className="card">
        {items.map(([k, v]) => (
          <div className="field" key={k}>
            <span>{k}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
    </>
  );
}

const WD_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const WD_EN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function Bars({
  days,
  series,
  t,
  label,
}: {
  days: HomeStats['week'];
  series: { key: string; color: string; value: (d: HomeStats['week'][number]) => number }[];
  t: T;
  label: string;
}) {
  const W = 480;
  const H = 96;
  const max = Math.max(1, ...days.flatMap((d) => series.map((s) => s.value(d))));
  const slot = W / days.length;
  const bw = Math.min(16, (slot - 10) / series.length);
  const wd = t('home.lang') === 'en' ? WD_EN : WD_RU;
  return (
    <div className="card chart">
      <div className="chart-title">
        {label}
        <span className="legend">
          {series.map((s) => (
            <span key={s.key}>
              <i style={{ background: s.color }} />
              {t(s.key)}
            </span>
          ))}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} width="100%" role="img" aria-label={label}>
        {days.map((d, i) => {
          const [y, m, dd] = d.day.split('-').map(Number);
          const wday = new Date(y!, (m ?? 1) - 1, dd ?? 1).getDay();
          const x0 = i * slot + (slot - bw * series.length) / 2;
          return (
            <g key={d.day}>
              {series.map((s, j) => {
                const v = s.value(d);
                const h = (v / max) * (H - 14);
                return (
                  <g key={s.key}>
                    <rect
                      x={x0 + j * bw}
                      y={H - h}
                      width={bw - 2}
                      height={Math.max(h, 1)}
                      rx={3}
                      fill={s.color}
                    />
                    {v > 0 && (
                      <text x={x0 + j * bw + (bw - 2) / 2} y={H - h - 3} className="bar-val">
                        {v}
                      </text>
                    )}
                  </g>
                );
              })}
              <text x={i * slot + slot / 2} y={H + 14} className="axis">
                {wd[wday]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const MOOD = ['', '😞', '😕', '😐', '🙂', '😄'];

function Week({ s, t }: { s: HomeStats; t: T }) {
  return (
    <>
      <Bars
        days={s.week}
        t={t}
        label={t('home.breaks')}
        series={[
          { key: 'home.done', color: '#6fcbaf', value: (d) => d.breaksDone },
          { key: 'home.skipped', color: '#cdb9f5', value: (d) => d.breaksSkipped },
        ]}
      />
      <Bars
        days={s.week}
        t={t}
        label={t('home.tasks')}
        series={[{ key: 'home.done', color: '#f2a07a', value: (d) => d.tasksDone }]}
      />
      <Bars
        days={s.week}
        t={t}
        label={t('home.water')}
        series={[{ key: 'home.glasses', color: '#7cc4ec', value: (d) => d.water }]}
      />
      <div className="card mood-row">
        <span className="muted">{t('home.mood')}</span>
        <span className="moods">
          {s.week.map((d) => (
            <span key={d.day} title={d.day}>
              {d.mood ? MOOD[d.mood] : '·'}
            </span>
          ))}
        </span>
      </div>
    </>
  );
}

function Pet({ s, t }: { s: HomeStats; t: T }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const pet = createPetRenderer(s.pet.species, host.current);
    pet.setStage(s.pet.stage);
    pet.setPalette(s.pet.palette);
    pet.setAccessories(s.pet.accessories);
    pet.setState('happy');
    return () => pet.destroy();
  }, [s.pet.species, s.pet.stage, s.pet.palette, s.pet.accessories]);
  return (
    <div className="card pet-card">
      <div className="pet-host" ref={host} />
      <div>
        <div className="pet-name">{s.pet.name}</div>
        <div className="field">
          <span>{t('home.stage')}</span>
          <b>{t(`stage.${s.pet.stage}`)}</b>
        </div>
        <div className="field">
          <span>{t('home.careDays')}</span>
          <b>{s.pet.careDays}</b>
        </div>
        <div className="field">
          <span>{t('home.streak')}</span>
          <b>
            {t('home.days', { n: s.pet.streak })}{' '}
            {s.pet.streakFreezes ? `· ❄ ${s.pet.streakFreezes}` : ''}
          </b>
        </div>
        <div className="field">
          <span>{t('home.coins')}</span>
          <b>🪙 {s.pet.coins}</b>
        </div>
      </div>
    </div>
  );
}
