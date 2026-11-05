/**
 * Звуки без файлов — синтез WebAudio (SPEC 7.4). Галочка (pop + coin) — самый проработанный звук.
 * Громкость 0–1 из настроек (по умолчанию 0,4), выключаются одной галкой.
 */
let ctx: AudioContext | null = null;
let volume = 0.4;
let enabled = true;

export function configureSound(opts: { enabled: boolean; volume: number }): void {
  enabled = opts.enabled;
  volume = Math.max(0, Math.min(1, opts.volume));
}

function ac(): AudioContext | null {
  if (!enabled || volume <= 0) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Создать AudioContext заранее (в простое после загрузки окна): первое создание занимает
 * сотни миллисекунд и не должно попадать между кликом и галочкой (бюджет < 50 мс).
 */
export function warmUpSound(): void {
  const run = () => {
    try {
      ctx ??= new AudioContext();
    } catch {
      /* нет аудиоустройства — звуков не будет, остальное работает */
    }
  };
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  };
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 2000 });
  else window.setTimeout(run, 500);
}

/** Один тон с мягкой огибающей. */
function tone(
  c: AudioContext,
  o: { freq: number; to?: number; at: number; dur: number; type: OscillatorType; gain: number },
) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.freq, o.at);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, o.at + o.dur);
  g.gain.setValueAtTime(0.0001, o.at);
  g.gain.exponentialRampToValueAtTime(o.gain * volume, o.at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, o.at + o.dur);
  osc.connect(g).connect(c.destination);
  osc.start(o.at);
  osc.stop(o.at + o.dur + 0.02);
}

/** «Поп» галочки: короткий круглый щелчок с падением высоты. */
export function playPop(): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  tone(c, { freq: 620, to: 260, at: t, dur: 0.09, type: 'sine', gain: 0.55 });
  tone(c, { freq: 1240, to: 900, at: t, dur: 0.04, type: 'triangle', gain: 0.12 });
}

/** «Монетка»: две светлые ноты, вторая выше. */
export function playCoin(delay = 0.07): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  tone(c, { freq: 1318.5, at: t, dur: 0.11, type: 'triangle', gain: 0.28 });
  tone(c, { freq: 1975.5, at: t + 0.075, dur: 0.22, type: 'triangle', gain: 0.24 });
}

/** Сюрприз ×2: восходящее арпеджио. */
export function playSurprise(): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + 0.05;
  [1046.5, 1318.5, 1568, 2093].forEach((f, i) =>
    tone(c, { freq: f, at: t + i * 0.07, dur: 0.25, type: 'triangle', gain: 0.22 }),
  );
}
