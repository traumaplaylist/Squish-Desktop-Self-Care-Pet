import { useEffect, useRef, useState } from 'react';
import type { HomeStats } from '../../core/types';
import type { DiaryEntry } from '../../core/types';
import { createPetRenderer } from '../pet/createPetRenderer';
import { MicroPet } from '../pet/micro';
import { useI18n } from '../shared/useI18n';

type Tab = 'today' | 'week' | 'pet' | 'diary' | 'shop';
const TABS: Tab[] = ['today', 'week', 'pet', 'diary', 'shop'];
type T = ReturnType<typeof useI18n>;

/** «Дом питомца» (SPEC 2.3): «Сегодня» и «Неделя» — P0, «Питомец» — P1 (коротко). Магазин — не первая вкладка. */
export function Home() {
  const t = useI18n();
  const [tab, setTab] = useState<Tab>('today');
  const [s, setS] = useState<HomeStats | null>(null);

  useEffect(() => {
    const load = () =>
      void window.squish.invoke('home:get').then((h) => {
        setS(h);
        if (h.openTab) setTab(h.openTab);
      });
    reload = load;
    load();
    const offTab = window.squish.on('home:tab', (x) => {
      setTab(x);
      load();
    });
    // Обновляем раз в 10 с и при возврате в окно — дёшево, данных мало.
    const id = window.setInterval(load, 10_000);
    window.addEventListener('focus', load);
    return () => {
      offTab();
      window.clearInterval(id);
      window.removeEventListener('focus', load);
    };
  }, []);

  return (
    <div className="page">
      <h1>{t('home.title')}</h1>
      <div className="tabs" role="tablist">
        {TABS.map((k) => (
          <button key={k} role="tab" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {t(`home.tab.${k}`)}
          </button>
        ))}
      </div>
      {!s ? null : tab === 'today' ? (
        <Today s={s} t={t} />
      ) : tab === 'week' ? (
        <Week s={s} t={t} />
      ) : tab === 'pet' ? (
        <Pet s={s} t={t} />
      ) : tab === 'diary' ? (
        <Diary s={s} t={t} />
      ) : (
        <Shop s={s} t={t} />
      )}
    </div>
  );
}

/** Перечитать данные сразу после команды (main применяет её синхронно). */
let reload: () => void = () => {};
const act = <K extends Parameters<typeof window.squish.send>[0]>(
  ch: K,
  payload: Parameters<typeof window.squish.send<K>>[1],
) => {
  window.squish.send(ch, payload);
  window.setTimeout(() => reload(), 60);
};

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
    <>
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
      {s.pet.streakRestore && (
        <div className="card hint-card">
          {t('streak.restoreHint', {
            until: new Date(s.pet.streakRestore.until).toLocaleString(
              t('home.lang') === 'en' ? 'en' : 'ru',
              {
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit',
              },
            ),
            goal: s.pet.streakRestore.goal,
          })}
        </div>
      )}
      <div className="card">
        <div className="card-title">{t('home.traits')}</div>
        {s.pet.traits.length ? (
          <ul className="traits">
            {s.pet.traits.map((id) => (
              <li key={id}>{traitText(id, s, t)}</li>
            ))}
          </ul>
        ) : (
          <div className="muted">{t('home.traitsNone')}</div>
        )}
      </div>
      <div className="card">
        <div className="card-title">
          {t('home.micro')}
          {s.pet.eggs.length > 0 && (
            <span className="muted small">
              {' '}
              · 🥚 {t('home.eggs', { n: s.pet.eggs.length })},{' '}
              {t('home.eggDays', { n: Math.min(...s.pet.eggs.map((e) => e.daysLeft)) })}
            </span>
          )}
        </div>
        {s.pet.microPets.length ? (
          <div className="micro-grid">
            {s.pet.microPets.map((m, i) => (
              <label key={`${m.id}-${i}`} className={`micro-card${m.shown ? ' on' : ''}`}>
                <MicroPet id={m.id} size={40} />
                <span>{t(`micro.${m.id}`)}</span>
                <span className="muted small">
                  <input
                    type="checkbox"
                    checked={m.shown}
                    onChange={() => act('micro:toggle', i)}
                  />{' '}
                  {t('home.microShow')}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <div className="muted">{t('home.microNone')}</div>
        )}
      </div>
    </>
  );
}

function traitText(id: string, s: HomeStats, t: T): string {
  if (id !== 'favoriteFood') return t(`trait.${id}`);
  return t('trait.favoriteFood', {
    food: s.pet.favoriteFood ? t(`treat.${s.pet.favoriteFood}`) : '…',
  });
}

function diaryLine(e: DiaryEntry, t: T): string[] {
  const l = e.loot ?? {};
  const extra: string[] = [];
  if (l.itemId) extra.push(t('home.diary.found', { item: t(`item.${l.itemId}`) }));
  if (l.egg) extra.push(t('home.diary.egg'));
  if (l.traitId && e.kind === 'adventure')
    extra.push(t('home.diary.trait', { trait: t(`trait.${l.traitId}`, { food: '…' }) }));
  if (l.coins) extra.push(`+${l.coins} 🪙`);
  switch (e.kind) {
    case 'adventure':
      return [(e.parts ?? []).map((k) => t(k)).join(' '), ...extra];
    case 'evening':
      return [t(e.questionKey ?? ''), `«${e.text ?? ''}»`];
    case 'trait':
      return [t('home.diary.trait', { trait: t(`trait.${l.traitId}`, { food: '…' }) })];
    case 'egg':
      return [t('home.diary.egg')];
    case 'hatch':
      return [t('home.diary.hatch', { name: t(`micro.${l.microPetId}`) })];
    case 'journey':
      return [
        t('home.diary.journey', {
          journey: t(String(e.params?.journey ?? '')),
          n: e.params?.n ?? 0,
        }),
        ...extra,
      ];
  }
}

function Diary({ s, t }: { s: HomeStats; t: T }) {
  const [text, setText] = useState('');
  const icon: Record<DiaryEntry['kind'], string> = {
    adventure: '🎒',
    evening: '🌙',
    trait: '✨',
    egg: '🥚',
    hatch: '🐣',
    journey: '🧭',
  };
  return (
    <>
      {s.evening && (
        <div className="card evening">
          <div className="card-title">🌙 {t(s.evening.questionKey)}</div>
          <textarea
            maxLength={1000}
            rows={3}
            value={text}
            placeholder={t('evening.placeholder')}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
          <div className="row-end">
            <button
              className="btn primary"
              disabled={!text.trim()}
              onClick={() => {
                act('evening:answer', text);
                setText('');
              }}
            >
              {t('evening.save')}
            </button>
          </div>
        </div>
      )}
      {s.diary.length === 0 ? (
        <div className="card muted">{t('home.diaryEmpty')}</div>
      ) : (
        <div className="card diary">
          {s.diary.map((e, i) => (
            <div className="diary-entry" key={`${e.at}-${i}`}>
              <span className="diary-icon" aria-hidden>
                {icon[e.kind]}
              </span>
              <div>
                <div className="muted small">
                  {new Date(e.at).toLocaleString(t('home.lang') === 'en' ? 'en' : 'ru', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
                {diaryLine(e, t).map((x, j) => (
                  <div key={j} className={j === 0 ? '' : 'muted small'}>
                    {x}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Магазин (SPEC 4.9, 4.10): вторичная вкладка, постоянный ассортимент. */
function Shop({ s, t }: { s: HomeStats; t: T }) {
  const coins = s.pet.coins;
  const pantry = Object.entries(s.pet.pantry).filter(([, n]) => n > 0);
  return (
    <>
      <div className="card shop-head">
        <span className="muted">{t('home.shopHint')}</span>
        <b>🪙 {coins}</b>
      </div>
      <div className="card">
        <div className="card-title">{t('home.pantry')}</div>
        {pantry.length ? (
          <div className="shop-grid">
            {pantry.map(([id, n]) => (
              <div className="shop-item" key={id}>
                <span className="treat-icon">{TREAT_ICON[id] ?? '🍪'}</span>
                <span>
                  {t(`treat.${id}`)} × {n}
                </span>
                <button className="btn primary" onClick={() => act('pet:feed', id)}>
                  {t('home.feed')}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="muted">{t('home.pantryEmpty')}</div>
        )}
      </div>
      <div className="card">
        <div className="card-title">{t('home.wardrobe')}</div>
        <div className="shop-grid">
          {s.shop.wardrobe.map((it) => {
            const owned = s.pet.owned.includes(it.id);
            const worn = s.pet.accessories.includes(it.id);
            return (
              <div className={`shop-item${worn ? ' on' : ''}`} key={it.id}>
                <span>{t(`item.${it.id}`)}</span>
                {owned ? (
                  <button className="btn" onClick={() => act('wardrobe:toggle', it.id)}>
                    {worn ? t('home.takeOff') : t('home.wear')}
                  </button>
                ) : (
                  <button
                    className="btn"
                    disabled={coins < it.price}
                    onClick={() => act('shop:buy', it.id)}
                  >
                    {t('home.buy', { price: it.price })}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="card">
        <div className="card-title">{t('home.treats')}</div>
        <div className="shop-grid">
          {s.shop.treats.map((x) => (
            <div className="shop-item" key={x.id}>
              <span className="treat-icon">{TREAT_ICON[x.id] ?? '🍪'}</span>
              <span>{t(`treat.${x.id}`)}</span>
              <button
                className="btn"
                disabled={coins < x.price}
                onClick={() => act('shop:buy', x.id)}
              >
                {t('home.buy', { price: x.price })}
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

const TREAT_ICON: Record<string, string> = {
  berry: '🫐',
  carrot: '🥕',
  cookie: '🍪',
  cheese: '🧀',
  pie: '🥧',
};
