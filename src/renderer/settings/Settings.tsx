import { useEffect, useState, type ReactNode } from 'react';
import type { SettingsPatch } from '../../core/settingsSchema';
import type { Settings, Weekday } from '../../core/types';
import { useI18n } from '../shared/useI18n';

type T = ReturnType<typeof useI18n>;
const WEEK: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

/** Настройки (SPEC 2.4, R0: P0-разделы). Каждое изменение применяется сразу, проверку делает main. */
export function SettingsPage() {
  const t = useI18n();
  const [s, setS] = useState<Settings | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [version, setVersion] = useState('');
  const [resetStep, setResetStep] = useState(0);
  const [newExe, setNewExe] = useState('');
  const [dataMsg, setDataMsg] = useState('');
  const [importStep, setImportStep] = useState(0);

  useEffect(() => {
    void window.squish.invoke('settings:get').then((r) => {
      setS(r.settings);
      setFailed(r.hotkeysFailed);
      setVersion(r.version);
    });
    const offs = [
      window.squish.on('settings', setS),
      window.squish.on('snapshot', (snap) => setFailed(snap.hotkeysFailed)),
    ];
    return () => offs.forEach((o) => o());
  }, []);

  if (!s) return null;
  const set = (patch: SettingsPatch) => window.squish.send('settings:update', patch);
  const sp = s.smartPause;

  return (
    <div className="page">
      <h1>{t('settings.title')}</h1>

      <h2>{t('settings.breaks')}</h2>
      <div className="card">
        <Toggle
          label={t('settings.micro')}
          hint={t('settings.microHint')}
          value={s.breaks.micro.enabled}
          onChange={(v) => set({ breaks: { micro: { enabled: v } } })}
        />
        <Num
          label={t('settings.everyMin')}
          value={s.breaks.micro.intervalMin}
          min={5}
          max={120}
          onChange={(v) => set({ breaks: { micro: { intervalMin: v } } })}
        />
        <Num
          label={t('settings.durationSec')}
          value={s.breaks.micro.durationSec}
          min={10}
          max={120}
          onChange={(v) => set({ breaks: { micro: { durationSec: v } } })}
        />
        <Toggle
          label={t('settings.long')}
          hint={t('settings.longHint')}
          value={s.breaks.long.enabled}
          onChange={(v) => set({ breaks: { long: { enabled: v } } })}
        />
        <Num
          label={t('settings.everyMin')}
          value={s.breaks.long.intervalMin}
          min={20}
          max={240}
          onChange={(v) => set({ breaks: { long: { intervalMin: v } } })}
        />
        <Num
          label={t('settings.durationMin')}
          value={s.breaks.long.durationMin}
          min={1}
          max={30}
          onChange={(v) => set({ breaks: { long: { durationMin: v } } })}
        />
        <Num
          label={t('settings.warningSec')}
          value={s.breaks.warningSec}
          min={5}
          max={120}
          onChange={(v) => set({ breaks: { warningSec: v } })}
        />
        <Field label={t('settings.strictness')} hint={t(`strictness.${s.breaks.strictness}.hint`)}>
          <Seg
            value={s.breaks.strictness}
            options={(['soft', 'normal', 'strict'] as const).map((k) => [k, t(`strictness.${k}`)])}
            onChange={(v) => set({ breaks: { strictness: v } })}
          />
        </Field>
        <Field label={t('settings.opacity')}>
          <input
            type="range"
            min={60}
            max={95}
            value={Math.round(s.breaks.overlayOpacity * 100)}
            onChange={(e) => set({ breaks: { overlayOpacity: Number(e.target.value) / 100 } })}
          />
        </Field>
      </div>

      <h2>{t('settings.smartPause')}</h2>
      <div className="card">
        <Toggle
          label={t('settings.fullscreen')}
          value={sp.fullscreen}
          onChange={(v) => set({ smartPause: { fullscreen: v } })}
        />
        <Toggle
          label={t('settings.mic')}
          value={sp.mic}
          onChange={(v) => set({ smartPause: { mic: v } })}
        />
        <Toggle
          label={t('settings.camera')}
          value={sp.camera}
          onChange={(v) => set({ smartPause: { camera: v } })}
        />
        <Toggle
          label={t('settings.typing')}
          hint={t('settings.typingHint')}
          value={sp.dontInterruptTyping}
          onChange={(v) => set({ smartPause: { dontInterruptTyping: v } })}
        />
        <Field label={t('settings.cooldown')} hint={t('settings.cooldownHint')}>
          <Seg
            value={sp.cooldownMin}
            options={([1, 2, 5] as const).map((k) => [k, t('settings.minShort', { n: k })])}
            onChange={(v) => set({ smartPause: { cooldownMin: v } })}
          />
        </Field>
        <Field label={t('settings.exceptions')} hint={t('settings.exceptionsHint')}>
          <span className="chips">
            {sp.exceptionApps.map((a) => (
              <button
                key={a}
                className="chip"
                title={t('settings.remove')}
                onClick={() =>
                  set({ smartPause: { exceptionApps: sp.exceptionApps.filter((x) => x !== a) } })
                }
              >
                {a} ✕
              </button>
            ))}
          </span>
        </Field>
        <Field label="">
          <input
            type="text"
            placeholder="zoom.exe"
            value={newExe}
            onChange={(e) => setNewExe(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newExe.trim()) {
                set({ smartPause: { exceptionApps: [...sp.exceptionApps, newExe.trim()] } });
                setNewExe('');
              }
            }}
          />
          <span className="chips">
            {['zoom.exe', 'ms-teams.exe', 'obs64.exe']
              .filter((x) => !sp.exceptionApps.includes(x))
              .map((x) => (
                <button
                  key={x}
                  className="chip"
                  onClick={() => set({ smartPause: { exceptionApps: [...sp.exceptionApps, x] } })}
                >
                  + {x}
                </button>
              ))}
          </span>
        </Field>
        {sp.ignoreMicApps.length > 0 && (
          <Field label={t('settings.notCalls')} hint={t('settings.notCallsHint')}>
            <span className="chips">
              {sp.ignoreMicApps.map((a) => (
                <button
                  key={a}
                  className="chip"
                  onClick={() =>
                    set({ smartPause: { ignoreMicApps: sp.ignoreMicApps.filter((x) => x !== a) } })
                  }
                >
                  {a} ✕
                </button>
              ))}
            </span>
          </Field>
        )}
        <Toggle
          label={t('settings.workHours')}
          hint={t('settings.workHoursHint')}
          value={sp.workHours.enabled}
          onChange={(v) => set({ smartPause: { workHours: { enabled: v } } })}
        />
        {sp.workHours.enabled && (
          <>
            <Field label={t('settings.days')}>
              <span className="chips">
                {WEEK.map((d) => {
                  const on = sp.workHours.days.includes(d);
                  return (
                    <button
                      key={d}
                      className="chip"
                      style={on ? { background: 'var(--accent)' } : undefined}
                      onClick={() =>
                        set({
                          smartPause: {
                            workHours: {
                              days: on
                                ? sp.workHours.days.filter((x) => x !== d)
                                : [...sp.workHours.days, d],
                            },
                          },
                        })
                      }
                    >
                      {t(`wd.${d}`)}
                    </button>
                  );
                })}
              </span>
            </Field>
            <Field label={t('settings.fromTo')} hint={t('settings.fromToHint')}>
              <input
                type="time"
                value={sp.workHours.from}
                onChange={(e) => set({ smartPause: { workHours: { from: e.target.value } } })}
              />
              <input
                type="time"
                value={sp.workHours.to}
                onChange={(e) => set({ smartPause: { workHours: { to: e.target.value } } })}
              />
            </Field>
          </>
        )}
      </div>

      <h2>{t('settings.water')}</h2>
      <div className="card">
        <Num
          label={t('settings.goalGlasses')}
          value={s.water.goalGlasses}
          min={1}
          max={20}
          onChange={(v) => set({ water: { goalGlasses: v } })}
        />
        <Num
          label={t('settings.glassMl')}
          value={s.water.glassMl}
          min={100}
          max={1000}
          step={50}
          onChange={(v) => set({ water: { glassMl: v } })}
        />
        <Num
          label={t('settings.remindAfter')}
          value={s.water.remindAfterMin}
          min={30}
          max={300}
          step={15}
          onChange={(v) => set({ water: { remindAfterMin: v } })}
        />
      </div>

      <h2>{t('settings.tasks')}</h2>
      <div className="card">
        <Field label={t('settings.defaultSize')}>
          <Seg
            value={s.tasks.defaultSize}
            options={(['S', 'M', 'L'] as const).map((k) => [k, t(`size.${k}`)])}
            onChange={(v) => set({ tasks: { defaultSize: v } })}
          />
        </Field>
        <Toggle
          label={t('settings.hints')}
          value={s.tasks.showSelfCareHints}
          onChange={(v) => set({ tasks: { showSelfCareHints: v } })}
        />
      </div>

      <h2>{t('settings.pet')}</h2>
      <div className="card">
        <Field label={t('settings.chatter')}>
          <Seg
            value={s.pet.chatter}
            options={(['often', 'rare', 'off'] as const).map((k) => [k, t(`chatter.${k}`)])}
            onChange={(v) => set({ pet: { chatter: v } })}
          />
        </Field>
        <Toggle
          label={t('settings.sounds')}
          value={s.pet.sounds}
          onChange={(v) => set({ pet: { sounds: v } })}
        />
        <Field label={t('settings.volume')}>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(s.pet.volume * 100)}
            onChange={(e) => set({ pet: { volume: Number(e.target.value) / 100 } })}
          />
        </Field>
      </div>

      <h2>{t('settings.general')}</h2>
      <div className="card">
        <Field label={t('settings.lang')}>
          <Seg
            value={s.lang}
            options={[
              ['ru', 'Русский'],
              ['en', 'English'],
            ]}
            onChange={(v) => set({ lang: v })}
          />
        </Field>
        <Toggle
          label={t('settings.autostart')}
          value={s.general.autostart}
          onChange={(v) => set({ general: { autostart: v } })}
        />
        <Toggle
          label={t('settings.hideFromCapture')}
          hint={t('settings.hideFromCaptureHint')}
          value={s.general.hideFromCapture}
          onChange={(v) => set({ general: { hideFromCapture: v } })}
        />
      </div>

      <h2>{t('settings.hotkeys')}</h2>
      <div className="card">
        {(Object.keys(s.hotkeys) as (keyof Settings['hotkeys'])[]).map((k) => (
          <Field
            key={k}
            label={t(`hotkey.${k}`)}
            hint={failed.includes(k) ? t('settings.hotkeyBusy') : undefined}
          >
            <HotkeyInput
              value={s.hotkeys[k]}
              busy={failed.includes(k)}
              onChange={(v) => set({ hotkeys: { [k]: v } })}
            />
          </Field>
        ))}
      </div>

      <h2>{t('settings.data')}</h2>
      <div className="card">
        <div className="field">
          <span className="muted">{t('settings.dataHint')}</span>
          <span>
            <button
              className="btn"
              onClick={() =>
                void window.squish
                  .invoke('data:export')
                  .then((r) =>
                    setDataMsg(
                      r.ok
                        ? t('settings.exported', { path: r.path ?? '' })
                        : r.reason === 'cancelled'
                          ? ''
                          : t(`data.err.${r.reason}`),
                    ),
                  )
              }
            >
              {t('settings.export')}
            </button>{' '}
            {importStep === 0 ? (
              <button className="btn" onClick={() => setImportStep(1)}>
                {t('settings.import')}
              </button>
            ) : (
              <button
                className="btn danger"
                onClick={() => {
                  setImportStep(0);
                  void window.squish.invoke('data:import').then((r) => {
                    if (!r.ok && r.reason !== 'cancelled') setDataMsg(t(`data.err.${r.reason}`));
                  });
                }}
              >
                {t('settings.importSure')}
              </button>
            )}
          </span>
        </div>
        {dataMsg && (
          <div className="hint muted" style={{ marginTop: 6 }}>
            {dataMsg}
          </div>
        )}
      </div>

      <h2>{t('settings.reset')}</h2>
      <div className="card">
        <div className="field">
          <span className="muted">{t('settings.resetHint')}</span>
          {resetStep === 0 && (
            <button className="btn danger" onClick={() => setResetStep(1)}>
              {t('settings.resetBtn')}
            </button>
          )}
          {resetStep === 1 && (
            <span>
              <button className="btn danger" onClick={() => setResetStep(2)}>
                {t('settings.resetSure')}
              </button>{' '}
              <button className="btn" onClick={() => setResetStep(0)}>
                {t('settings.cancel')}
              </button>
            </span>
          )}
          {resetStep === 2 && (
            <span>
              <button
                className="btn danger"
                onClick={() => window.squish.send('settings:resetProgress', null)}
              >
                {t('settings.resetReally')}
              </button>{' '}
              <button className="btn" onClick={() => setResetStep(0)}>
                {t('settings.cancel')}
              </button>
            </span>
          )}
        </div>
      </div>

      <p className="muted about">
        Squish {version} · {t('settings.local')} · {t('settings.notMedical')}
      </p>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label>
        {label}
        {hint && <span className="hint">{hint}</span>}
      </label>
      <span
        style={{
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
        }}
      >
        {children}
      </span>
    </div>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
    </Field>
  );
}

function Num(p: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(p.value));
  useEffect(() => setDraft(String(p.value)), [p.value]);
  const commit = () => {
    const v = Number(draft);
    if (Number.isFinite(v)) p.onChange(Math.min(p.max, Math.max(p.min, v)));
    else setDraft(String(p.value));
  };
  return (
    <Field label={p.label}>
      <input
        type="number"
        aria-label={p.label}
        min={p.min}
        max={p.max}
        step={p.step ?? 1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </Field>
  );
}

function Seg<V extends string | number>({
  value,
  options,
  onChange,
}: {
  value: V;
  options: [V, string][];
  onChange: (v: V) => void;
}) {
  return (
    <span className="seg">
      {options.map(([v, label]) => (
        <button key={String(v)} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </span>
  );
}

/** Нажми сочетание — оно запишется (Ctrl/Alt/Shift + клавиша). Backspace — выключить хоткей. */
function HotkeyInput({
  value,
  busy,
  onChange,
}: {
  value: string;
  busy: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      readOnly
      value={value}
      style={busy ? { borderColor: '#f2a07a' } : undefined}
      onKeyDown={(e) => {
        e.preventDefault();
        if (e.key === 'Backspace') return onChange('');
        const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(
          Boolean,
        ) as string[];
        // e.code — физическая клавиша: на русской раскладке e.key дал бы кириллицу.
        const k = e.code.startsWith('Key')
          ? e.code.slice(3)
          : e.code.startsWith('Digit')
            ? e.code.slice(5)
            : /^F\d{1,2}$/.test(e.code)
              ? e.code
              : null;
        if (mods.length && k && /^[A-Z0-9]$|^F\d{1,2}$/.test(k)) onChange([...mods, k].join('+'));
      }}
    />
  );
}

export type { T };
