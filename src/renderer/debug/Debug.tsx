import { useEffect, useState } from 'react';
import type { ProbeResult } from '../../core/ipc';
import type {
  Palette,
  PetReaction,
  PetVisualState,
  Snapshot,
  SuppressReason,
} from '../../core/types';
import { useI18n } from '../shared/useI18n';

const VISUALS: PetVisualState[] = [
  'idle',
  'happy',
  'sleeping',
  'waving',
  'quiet',
  'thirsty',
  'tired',
  'adventure',
  'onBreak:lookFar',
  'onBreak:stretchUp',
  'onBreak:breathe',
];
const REACTIONS: PetReaction[] = [
  'bounce',
  'blink',
  'celebrate',
  'drink',
  'coinCatch',
  'straighten',
  'hug',
  'purr',
  'giggle',
  'dizzy',
];
const PALETTES: Palette[] = ['mint', 'peach', 'lavender'];
const SPEEDS = [1, 10, 60, 600];
const SUPPRESS: SuppressReason[] = ['mic', 'camera', 'fullscreen'];
const PET_CMDS = [
  ['careDay', '+1 день заботы'],
  ['stageUp', 'стадия +1'],
  ['needsLow', 'потребности → 10'],
  ['energy', 'энергия +10'],
  ['coins', 'монеты +50'],
] as const;

const fmtList = (v: string[] | 'unknown') =>
  v === 'unknown' ? 'unknown' : v.length ? v.join(', ') : 'никто';
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

export function Debug() {
  const t = useI18n();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [override, setOverride] = useState<PetVisualState | null>(null);
  const [probe, setProbe] = useState<ProbeResult | null>(null);

  useEffect(() => {
    void window.squish.invoke('app:getSnapshot').then(setSnap);
    void window.squish.invoke('debug:probe').then(setProbe);
    return window.squish.on('snapshot', setSnap);
  }, []);

  const setVisual = (v: PetVisualState | null) => {
    setOverride(v);
    window.squish.send('debug:setVisual', v);
  };
  const v = snap?.scheduler;
  const d = snap?.debugInfo;

  return (
    <div>
      <h1>{t('debug.title')}</h1>
      <section>
        <h2>{t('debug.scheduler')}</h2>
        <pre>
          {v && d
            ? [
                `фаза: ${v.phase}${v.pendingKind ? ` (${v.pendingKind})` : ''}`,
                `микро: ${mmss(d.activeSinceMicroSec)} · длинный: ${mmss(d.activeSinceLongSec)}`,
                v.next ? `следующий: ${v.next.kind} через ${mmss(v.next.inSec)}` : '',
                v.preBreakSecLeft !== null ? `preBreak: ${v.preBreakSecLeft} с` : '',
                v.break
                  ? `перерыв: ${v.break.kind} «${v.break.exerciseId}», осталось ${v.break.secLeft} с`
                  : '',
                d.dueBreak ? `должный: ${d.dueBreak}` : '',
                d.cooldownSec !== null ? `кулдаун: ${d.cooldownSec} с` : '',
                v.quiet ? `тихо: ${v.quiet.reason}${v.quiet.app ? ` (${v.quiet.app})` : ''}` : '',
                `строгость: ${v.strictness} · пропуск: ${v.canSkip ? 'да' : 'нет'} · +5: ${v.canPostpone ? 'да' : 'нет'}`,
              ]
                .filter(Boolean)
                .join('\n')
            : '…'}
        </pre>
      </section>
      <section>
        <h2>{t('debug.speed')}</h2>
        <div className="row">
          {SPEEDS.map((n) => (
            <button
              key={n}
              className={d?.speed === n ? 'on' : ''}
              onClick={() => window.squish.send('debug:setSpeed', n)}
            >
              ×{n}
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <span>{t('debug.input')}</span>
          {(
            [
              ['debug.inputReal', null],
              ['debug.inputTyping', 0],
              ['debug.inputAway', 3_600_000],
            ] as const
          ).map(([k, ms]) => (
            <button
              key={k}
              className={(d?.fakeIdleMs ?? null) === ms ? 'on' : ''}
              onClick={() => window.squish.send('debug:fakeIdle', ms)}
            >
              {t(k)}
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <button onClick={() => window.squish.send('break:now', 'micro')}>
            {t('debug.breakMicro')}
          </button>
          <button onClick={() => window.squish.send('break:now', 'long')}>
            {t('debug.breakLong')}
          </button>
        </div>
      </section>
      <section>
        <h2>{t('debug.detectors')}</h2>
        <pre>
          {d?.detectors
            ? [
                `микрофон: ${fmtList(d.detectors.mic)}`,
                `камера: ${fmtList(d.detectors.camera)}`,
                `фуллскрин: ${d.detectors.fullscreen ?? 'нет'}`,
                `передний план: ${d.detectors.foregroundExe ?? '—'}`,
                `хоткеи заняты: ${snap?.hotkeysFailed.length ? snap.hotkeysFailed.join(', ') : 'нет'}`,
              ].join('\n')
            : '…'}
        </pre>
      </section>
      <section>
        <h2>{t('debug.suppress')}</h2>
        {SUPPRESS.map((reason) => (
          <div className="row" key={reason} style={{ marginBottom: 4 }}>
            <span style={{ width: 80 }}>{reason}</span>
            {[1, 10, 50].map((n) => (
              <button
                key={n}
                className={d?.simSuppression?.reason === reason ? 'on' : ''}
                onClick={() => window.squish.send('debug:suppress', { reason, minutes: n })}
              >
                {t('debug.minutes', { n })}
              </button>
            ))}
          </div>
        ))}
        <div className="row">
          <button onClick={() => window.squish.send('debug:suppress', null)}>
            {t('debug.suppressOff')}
          </button>
          {d?.simSuppression && (
            <span>осталось {mmss(Math.max(0, d.simSuppression.untilSec))}</span>
          )}
        </div>
      </section>
      <section>
        <h2>{t('debug.visual')}</h2>
        <div className="row">
          {VISUALS.map((vis) => (
            <button
              key={vis}
              className={override === vis ? 'on' : ''}
              onClick={() => setVisual(override === vis ? null : vis)}
            >
              {vis}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2>{t('debug.reactions')}</h2>
        <div className="row">
          {REACTIONS.map((r) => (
            <button key={r} onClick={() => window.squish.send('debug:play', r)}>
              {r}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2>{t('debug.palette')}</h2>
        <div className="row">
          {PALETTES.map((p) => (
            <button
              key={p}
              className={snap?.pet.palette === p ? 'on' : ''}
              onClick={() => window.squish.send('debug:setPalette', p)}
            >
              {p}
            </button>
          ))}
          <button onClick={() => window.squish.send('debug:resetPosition', null)}>
            {t('debug.resetPosition')}
          </button>
        </div>
      </section>
      <section>
        <h2>{t('debug.probe')}</h2>
        <pre>{probe ? JSON.stringify(probe, null, 2) : '…'}</pre>
      </section>
      <section>
        <h2>{t('debug.pet')}</h2>
        <pre>
          {snap
            ? `стадия: ${snap.pet.stage} · дней заботы: ${snap.pet.careDays} · серия: ${snap.pet.streak}\nэнергия: ${snap.economy.energyToday}/${snap.economy.goal} · монеты: ${snap.economy.coins}\nвода ${Math.round(snap.pet.needs.water)} · глаза ${Math.round(snap.pet.needs.eyes)} · движение ${Math.round(snap.pet.needs.movement)}`
            : '…'}
        </pre>
        <div className="row" style={{ marginTop: 6 }}>
          {PET_CMDS.map(([cmd, label]) => (
            <button key={cmd} onClick={() => window.squish.send('debug:pet', cmd)}>
              {label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
