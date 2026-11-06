import type { PetVisualState } from '../../core/types';
import { AnimatedPetRenderer, type PetViewProps } from './AnimatedPetRenderer';
import { Accessories, Backpack, hasEyewear, Snack, type Anchors } from './accessories';
import { PALETTES } from './palettes';
import './blob.css';

/** Нарисованные состояния. adventure — P1 (Неделя 2), пока как idle. */
const DRAWN: ReadonlySet<PetVisualState> = new Set<PetVisualState>([
  'idle',
  'happy',
  'sleeping',
  'waving',
  'quiet',
  'thirsty',
  'tired',
  'onBreak:lookFar',
  'onBreak:stretchUp',
  'onBreak:breathe',
  'onBreak:neckRoll',
  'onBreak:walk',
  'onBreak:drinkWater',
  'adventure',
]);

/** Якоря гардероба блоба (SPEC 4.9). */
export const BLOB_ANCHORS: Anchors = {
  head: { x: 100, y: 46, w: 58 },
  eyes: { l: 76, r: 124, y: 112, size: 17 },
  neck: { y: 152, w: 122 },
  paw: { x: 166, y: 138 },
};

type BlobProps = PetViewProps;

type FaceState = PetVisualState | 'purr' | 'giggle' | 'dizzy';

function Eyes({ state }: { state: FaceState }) {
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
  if (state === 'happy' || state === 'purr') {
    return (
      <g className="eyes closed">
        <path d="M63 117 Q76 101 89 117" />
        <path d="M111 117 Q124 101 137 117" />
      </g>
    );
  }
  if (state === 'dizzy') {
    return (
      <g className="eyes closed dizzy">
        <path d="M66 104 L86 122 M86 104 L66 122" />
        <path d="M114 104 L134 122 M134 104 L114 122" />
      </g>
    );
  }
  return (
    <g className={`eyes open${state === 'tired' ? ' tired' : ''}`}>
      {[76, 124].map((cx) => (
        <g key={cx} className="eye" style={{ transformOrigin: `${cx}px 112px` }}>
          <ellipse cx={cx} cy={112} rx={17} ry={20} fill="#fff" />
          <g className="pupil">
            <circle cx={cx} cy={114} r={10.5} fill="#2E2A3D" />
            <circle cx={cx - 3.5} cy={109.5} r={3.6} fill="#fff" />
            <circle cx={cx + 4} cy={118} r={1.6} fill="#fff" opacity={0.8} />
          </g>
          {state === 'tired' && (
            // тяжёлое верхнее веко: глазки устали
            <path
              className="lid"
              d={`M${cx - 18} 100 Q${cx} 92 ${cx + 18} 100 L${cx + 18} 110 Q${cx} 116 ${cx - 18} 110 Z`}
            />
          )}
        </g>
      ))}
    </g>
  );
}

function Mouth({ state }: { state: FaceState }) {
  if (state === 'happy') return <path className="mouth-open" d="M90 136 Q100 150 110 136 Z" />;
  if (state === 'sleeping')
    return <ellipse className="mouth-sleep" cx={100} cy={140} rx={4} ry={3} />;
  if (state === 'quiet') return <path className="mouth" d="M95 139 L105 139" />;
  if (state === 'thirsty')
    return <ellipse className="mouth-sleep" cx={100} cy={140} rx={5} ry={4} />;
  if (state === 'tired') return <path className="mouth" d="M93 141 Q100 137 107 141" />;
  if (state === 'giggle') return <path className="mouth-open" d="M89 135 Q100 152 111 135 Z" />;
  return <path className="mouth" d="M93 137 Q100 143 107 137" />;
}

function Blob(p: BlobProps) {
  const c = PALETTES[p.palette];
  const acc = p.accessories;
  const A = (layer: 'back' | 'front' | 'eyes' | 'top' | 'paw') => (
    <Accessories items={acc} anchors={BLOB_ANCHORS} layer={layer} />
  );
  const base = DRAWN.has(p.state) ? p.state : 'idle';
  // Тактильные реакции меняют лицо на время реакции.
  const r = p.reaction?.name;
  const drawn: FaceState = r === 'purr' || r === 'giggle' || r === 'dizzy' ? r : base;
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
                {base === 'adventure' && <Backpack x={172} y={116} />}
                {A('back')}
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
                <g className="arm arm-r">{A('paw')}</g>
                {A('front')}
                {r === 'eat' && <Snack x={112} y={144} />}
                {(p.reaction?.name === 'drink' || base === 'onBreak:drinkWater') && (
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
                {p.stage === 'teen' && (
                  // Подросток: росток на макушке
                  <g className="sprout">
                    <path
                      d="M100 44 Q99 30 102 22"
                      stroke="#5aa784"
                      strokeWidth={3}
                      fill="none"
                      strokeLinecap="round"
                    />
                    <ellipse
                      cx={110}
                      cy={24}
                      rx={9}
                      ry={5}
                      fill="#7fcf9f"
                      transform="rotate(-25 110 24)"
                    />
                    <ellipse
                      cx={93}
                      cy={28}
                      rx={7}
                      ry={4}
                      fill="#7fcf9f"
                      transform="rotate(30 93 28)"
                    />
                  </g>
                )}
                {p.stage === 'adult' && (
                  // Взрослый: аккуратный хохолок
                  <path
                    className="tuft"
                    d="M92 46 Q96 30 104 40 Q108 28 112 44"
                    fill={c.bodyDark}
                  />
                )}
                {p.cozy && (
                  // Тяжёлый день: тёплый шарфик (R0: модификатор cozy)
                  <g className="scarf">
                    <path d="M44 150 Q100 172 156 150 L158 162 Q100 186 42 162 Z" fill="#f2a07a" />
                    <path d="M128 160 L140 186 L126 188 L118 164 Z" fill="#e88c63" />
                  </g>
                )}
                {base === 'thirsty' && (
                  // Пустой стакан рядом (SPEC 7.2)
                  <path
                    className="empty-glass"
                    d="M176 150 L196 150 L193 182 L179 182 Z"
                    fill="#f2fbff"
                    stroke="#9cc9e0"
                    strokeWidth={2}
                  />
                )}
                {base === 'tired' && (
                  // Капля пота (SPEC 7.2)
                  <path
                    className="sweat"
                    d="M150 78 Q156 90 150 96 Q144 90 150 78 Z"
                    fill="#a9dcf5"
                  />
                )}
                <g className="face" style={{ ['--lid' as string]: c.body }}>
                  {p.stage === 'wise' && !hasEyewear(acc) && (
                    // Мудрый: круглые очки
                    <g className="glasses" fill="none" stroke="#5d5678" strokeWidth={2.5}>
                      <circle cx={76} cy={112} r={21} />
                      <circle cx={124} cy={112} r={21} />
                      <path d="M97 110 Q100 106 103 110" />
                    </g>
                  )}
                  <Eyes state={drawn} />
                  <ellipse cx={58} cy={133} rx={11} ry={6} fill={c.cheek} opacity={0.5} />
                  <ellipse cx={142} cy={133} rx={11} ry={6} fill={c.cheek} opacity={0.5} />
                  <Mouth state={drawn} />
                  {A('eyes')}
                </g>
                {A('top')}
              </g>
            </svg>
          </div>
        </div>
      </div>
      {(r === 'hug' || r === 'purr') && (
        <div className="hearts">
          <span>♥</span>
          <span>♥</span>
          <span>♥</span>
        </div>
      )}
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

/** v1: круглый SVG-блоб «Сквиш» (SPEC 7.2). */
export class SvgBlobRenderer extends AnimatedPetRenderer {
  protected readonly eyeShift = 5;
  protected view(p: PetViewProps) {
    return <Blob {...p} />;
  }
}
