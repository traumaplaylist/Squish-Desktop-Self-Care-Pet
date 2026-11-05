import { useEffect, useState } from 'react';
import type { ProbeResult } from '../../core/ipc';
import type { Palette, PetReaction, PetVisualState, Snapshot } from '../../core/types';
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
];
const REACTIONS: PetReaction[] = [
  'bounce',
  'blink',
  'drink',
  'celebrate',
  'coinCatch',
  'straighten',
  'hug',
];
const PALETTES: Palette[] = ['mint', 'peach', 'lavender'];
const LATER = [
  'debug.breakNow',
  'debug.plusDay',
  'debug.stageUp',
  'debug.reset',
  'debug.drink',
  'debug.simFullscreen',
  'debug.simMic',
];

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

  return (
    <div>
      <h1>{t('debug.title')}</h1>
      <section>
        <h2>{t('debug.visual')}</h2>
        <div className="row">
          {VISUALS.map((v) => (
            <button
              key={v}
              className={override === v ? 'on' : ''}
              onClick={() => setVisual(override === v ? null : v)}
            >
              {v}
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
        </div>
      </section>
      <section>
        <h2>{t('debug.widget')}</h2>
        <div className="row">
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
        <h2>{t('debug.later')}</h2>
        <div className="row">
          {LATER.map((k) => (
            <button key={k} disabled>
              {t(k)}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
