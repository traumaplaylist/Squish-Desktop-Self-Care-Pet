import { createRoot, type Root } from 'react-dom/client';
import type {
  AccessoryId,
  GrowthStage,
  MicroPetId,
  Palette,
  PetReaction,
  PetVisualState,
} from '../../core/types';
import type { PetRenderer } from './PetRenderer';
import { BREATH_TICK_MS, breathTransform } from './breath';
import { PALETTES } from './palettes';
import './blob.css';

/** Состояния, нарисованные на День 1. Остальные пока выглядят как idle (TODO День 5). */
const DRAWN: ReadonlySet<PetVisualState> = new Set<PetVisualState>([
  'idle',
  'happy',
  'sleeping',
  'waving',
  'quiet',
  'onBreak:lookFar',
  'onBreak:stretchUp',
  'onBreak:breathe',
]);
const REACTION_MS: Partial<Record<PetReaction, number>> = {
  bounce: 650,
  celebrate: 1500,
  drink: 1400,
};

interface BlobProps {
  state: PetVisualState;
  stage: GrowthStage;
  palette: Palette;
  cozy: boolean;
  blinking: boolean;
  reaction: { name: PetReaction; key: number } | null;
}

function Eyes({ state }: { state: PetVisualState }) {
  if (state === 'quiet') {
    // Тихо (умная пауза): спокойные полуприкрытые глаза — не мешает, но рядом.
    return (
      <g className="eyes quiet">
        <ellipse cx={76} cy={116} rx={13} ry={7} fill="#2E2A3D" />
        <ellipse cx={124} cy={116} rx={13} ry={7} fill="#2E2A3D" />
        <ellipse cx={72} cy={114} rx={3} ry={2} fill="#fff" />
        <ellipse cx={120} cy={114} rx={3} ry={2} fill="#fff" />
      </g>
    );
  }
  if (state === 'sleeping') {
    return (
      <g className="eyes closed">
        <path d="M63 114 Q76 123 89 114" />
        <path d="M111 114 Q124 123 137 114" />
      </g>
    );
  }
  if (state === 'happy') {
    return (
      <g className="eyes closed">
        <path d="M63 117 Q76 101 89 117" />
        <path d="M111 117 Q124 101 137 117" />
      </g>
    );
  }
  return (
    <g className="eyes open">
      {[76, 124].map((cx) => (
        <g key={cx} className="eye" style={{ transformOrigin: `${cx}px 112px` }}>
          <ellipse cx={cx} cy={112} rx={17} ry={20} fill="#fff" />
          <g className="pupil">
            <circle cx={cx} cy={114} r={10.5} fill="#2E2A3D" />
            <circle cx={cx - 3.5} cy={109.5} r={3.6} fill="#fff" />
            <circle cx={cx + 4} cy={118} r={1.6} fill="#fff" opacity={0.8} />
          </g>
        </g>
      ))}
    </g>
  );
}

function Mouth({ state }: { state: PetVisualState }) {
  if (state === 'happy') return <path className="mouth-open" d="M90 136 Q100 150 110 136 Z" />;
  if (state === 'sleeping')
    return <ellipse className="mouth-sleep" cx={100} cy={140} rx={4} ry={3} />;
  if (state === 'quiet') return <path className="mouth" d="M95 139 L105 139" />;
  return <path className="mouth" d="M93 137 Q100 143 107 137" />;
}

function Blob(p: BlobProps) {
  const c = PALETTES[p.palette];
  const drawn = DRAWN.has(p.state) ? p.state : 'idle';
  const classes = [
    'pet',
    `state-${drawn.replace(':', '-')}`,
    `stage-${p.stage}`,
    p.blinking ? 'blink' : '',
    p.cozy ? 'cozy' : '',
  ]
    .filter(Boolean)
    .join(' ');
  // Слои: статичная тень (SVG) + HTML-обёртки с анимациями transform/opacity.
  // Такие анимации исполняет композитор без перерисовки SVG — это и держит CPU в покое (SPEC 7.5).
  return (
    <div className={classes} data-state={p.state} aria-hidden>
      <svg className="shadow-layer" viewBox="0 0 200 200" width="100%" height="100%">
        <ellipse className="shadow" cx={100} cy={184} rx={50} ry={7} />
      </svg>
      <div className="hop" key={p.reaction?.key ?? 0} data-reaction={p.reaction?.name ?? ''}>
        <div className="stage-scale">
          <div className="breath">
            <svg viewBox="0 0 200 200" width="100%" height="100%">
              <defs>
                <radialGradient id="bodyGrad" cx="38%" cy="30%" r="80%">
                  <stop offset="0%" stopColor={c.bodyLight} />
                  <stop offset="55%" stopColor={c.body} />
                  <stop offset="100%" stopColor={c.bodyDark} />
                </radialGradient>
              </defs>
              <g data-hit>
                <ellipse cx={76} cy={176} rx={14} ry={8} fill={c.bodyDark} />
                <ellipse cx={124} cy={176} rx={14} ry={8} fill={c.bodyDark} />
                <ellipse className="arm arm-l" cx={34} cy={134} rx={9} ry={13} fill={c.bodyDark} />
                <ellipse className="arm arm-r" cx={166} cy={134} rx={9} ry={13} fill={c.bodyDark} />
                <path
                  d="M100 42 C150 42 172 80 172 122 C172 160 142 180 100 180 C58 180 28 160 28 122 C28 80 50 42 100 42 Z"
                  fill="url(#bodyGrad)"
                />
                <ellipse
                  cx={72}
                  cy={70}
                  rx={20}
                  ry={11}
                  fill="#fff"
                  opacity={0.35}
                  transform="rotate(-20 72 70)"
                />
                {p.reaction?.name === 'drink' && (
                  <g className="glass">
                    <path
                      d="M150 104 L176 104 L172 150 L154 150 Z"
                      fill="#dff4ff"
                      stroke="#9cc9e0"
                      strokeWidth={2}
                    />
                    <path d="M152 118 L174 118 L172 150 L154 150 Z" fill="#7cc4ec" opacity={0.75} />
                  </g>
                )}
                <g className="face">
                  <Eyes state={drawn} />
                  <ellipse cx={58} cy={133} rx={11} ry={6} fill={c.cheek} opacity={0.5} />
                  <ellipse cx={142} cy={133} rx={11} ry={6} fill={c.cheek} opacity={0.5} />
                  <Mouth state={drawn} />
                </g>
              </g>
            </svg>
          </div>
        </div>
      </div>
      {drawn === 'sleeping' && (
        <div className="zzz">
          <span>z</span>
          <span>z</span>
          <span>Z</span>
        </div>
      )}
    </div>
  );
}

export class SvgBlobRenderer implements PetRenderer {
  private readonly root: Root;
  private props: BlobProps = {
    state: 'idle',
    stage: 'baby',
    palette: 'mint',
    cozy: false,
    blinking: false,
    reaction: null,
  };
  private paused = false;
  private blinkTimer: number | null = null;
  private breathTimer: number | null = null;
  private readonly breathStart = performance.now();
  private reactionKey = 0;

  constructor(private readonly container: HTMLElement) {
    this.root = createRoot(container);
    this.render();
    this.scheduleBlink();
    this.startBreath();
  }

  setState(state: PetVisualState): void {
    if (state === this.props.state) return;
    if (!DRAWN.has(state)) console.debug(`[pet] TODO: состояние «${state}» пока рисуется как idle`);
    this.update({ state });
  }

  play(reaction: PetReaction): Promise<void> {
    if (this.paused) return Promise.resolve();
    if (reaction === 'blink') return this.blinkOnce();
    const ms = REACTION_MS[reaction];
    if (ms === undefined) {
      console.debug(`[pet] TODO: реакция «${reaction}» появится позже`);
      return Promise.resolve();
    }
    const key = ++this.reactionKey;
    this.update({ reaction: { name: reaction, key } });
    return new Promise((resolve) => {
      window.setTimeout(() => {
        if (this.props.reaction?.key === key) this.update({ reaction: null });
        resolve();
      }, ms);
    });
  }

  setAccessories(_ids: AccessoryId[]): void {
    /* TODO P1 (гардероб, SPEC 4.9) */
  }

  setStage(stage: GrowthStage): void {
    if (stage !== this.props.stage) this.update({ stage });
  }

  setMicroPets(_ids: MicroPetId[]): void {
    /* TODO P1 (микро-питомцы, SPEC 4.8) */
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.container.classList.toggle('pet-paused', paused);
    if (paused) {
      this.clearBlink();
      this.stopBreath();
    } else {
      this.scheduleBlink();
      this.startBreath();
    }
  }

  setPalette(palette: Palette): void {
    if (palette !== this.props.palette) this.update({ palette });
  }

  setCozy(cozy: boolean): void {
    if (cozy !== this.props.cozy) this.update({ cozy });
  }

  lookAt(dir: { x: number; y: number } | null): void {
    // Без перерисовки React: только CSS-переменные.
    this.container.style.setProperty('--eye-x', `${(dir?.x ?? 0) * 5}px`);
    this.container.style.setProperty('--eye-y', `${(dir?.y ?? 0) * 5}px`);
  }

  destroy(): void {
    this.clearBlink();
    this.stopBreath();
    this.root.unmount();
  }

  private update(patch: Partial<BlobProps>): void {
    this.props = { ...this.props, ...patch };
    this.render();
  }

  private render(): void {
    this.root.render(<Blob {...this.props} />);
  }

  private startBreath(): void {
    this.stopBreath();
    this.breathTimer = window.setInterval(() => {
      const el = this.container.querySelector<HTMLElement>('.breath');
      if (el)
        el.style.transform = breathTransform(
          this.props.state,
          performance.now() - this.breathStart,
        );
    }, BREATH_TICK_MS);
  }

  private stopBreath(): void {
    if (this.breathTimer !== null) window.clearInterval(this.breathTimer);
    this.breathTimer = null;
  }

  /** Случайное моргание раз в 3–7 с (SPEC 7.2). */
  private scheduleBlink(): void {
    this.clearBlink();
    const delay = 3000 + Math.random() * 4000;
    this.blinkTimer = window.setTimeout(() => {
      void this.blinkOnce().then(() => {
        if (!this.paused) this.scheduleBlink();
      });
    }, delay);
  }

  private clearBlink(): void {
    if (this.blinkTimer !== null) window.clearTimeout(this.blinkTimer);
    this.blinkTimer = null;
  }

  private blinkOnce(): Promise<void> {
    if (this.props.state === 'sleeping' || this.props.state === 'happy') return Promise.resolve();
    this.update({ blinking: true });
    return new Promise((resolve) =>
      window.setTimeout(() => {
        this.update({ blinking: false });
        resolve();
      }, 140),
    );
  }
}
