import type { PetVisualState } from '../../../../core/types';
import { AnimatedPetRenderer, type PetViewProps } from '../../AnimatedPetRenderer';
import { Accessories, Backpack, hasEyewear, Snack, type Anchors } from '../../accessories';
import '../../blob.css';
import './hamster.css';

/**
 * «Хомяк-булочка» — вектор, нарисован по эталону ChatGPT (вариант А).
 * Та же система координат, что у блоба (200×200, лапки ~ x 44/156, y 140; глаза y 106),
 * поэтому все анимации блоба (прыжки, махание, упражнения, обнимашки, стакан) работают как есть.
 * Наряды — слои: часть под головой (back), поверх тела (front), в лапке (prop) и сверху (top).
 */

const FUR = '#F7B66C';
const FUR_LIGHT = '#FBC98A';
const LINE = '#B8743E';
const CREAM = '#FDE9CD';
const PINK = '#F5A094';
const EYE = '#4A2A1B';

type FaceState = PetVisualState | 'purr' | 'giggle' | 'dizzy';

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

const EYE_X = [79, 121];
const EYE_Y = 106;

function Eyes({ state }: { state: FaceState }) {
  if (state === 'sleeping')
    return (
      <g className="eyes closed">
        <path d="M70 106 Q79 113 88 106" />
        <path d="M112 106 Q121 113 130 106" />
      </g>
    );
  if (state === 'happy' || state === 'purr' || state === 'giggle')
    return (
      <g className="eyes closed">
        <path d="M70 109 Q79 98 88 109" />
        <path d="M112 109 Q121 98 130 109" />
      </g>
    );
  if (state === 'dizzy')
    return (
      <g className="eyes closed dizzy">
        <path d="M72 99 L86 113 M86 99 L72 113" />
        <path d="M114 99 L128 113 M128 99 L114 113" />
      </g>
    );
  const quiet = state === 'quiet';
  const tired = state === 'tired';
  // Устал — глаза ниже и уже (прищур), без «век»: у тела градиент, заливка видна пятном.
  const ry = quiet ? 5.5 : tired ? 7.5 : 11;
  const cy = EYE_Y + (tired ? 3 : 0);
  return (
    <g className={`eyes open${tired ? ' tired' : ''}`}>
      {EYE_X.map((cx) => (
        <g key={cx} className="eye">
          <g className="pupil">
            <ellipse cx={cx} cy={cy} rx={9.5} ry={ry} fill={EYE} />
            <circle
              cx={cx + 2.5}
              cy={cy - (quiet ? 1.5 : tired ? 2 : 4)}
              r={quiet || tired ? 2.2 : 3.4}
              fill="#fff"
            />
            {!quiet && !tired && (
              <circle cx={cx - 3} cy={cy + 5} r={1.4} fill="#fff" opacity={0.7} />
            )}
          </g>
        </g>
      ))}
    </g>
  );
}

function Mouth({ state }: { state: FaceState }) {
  if (state === 'happy' || state === 'giggle') {
    const d = state === 'giggle' ? 'M91 117 Q100 134 109 117 Z' : 'M93 117 Q100 129 107 117 Z';
    return (
      <g className="h-mouth-open">
        <path d={d} />
        <ellipse cx={100} cy={state === 'giggle' ? 125 : 122.5} rx={4} ry={2.6} fill="#F08C8C" />
      </g>
    );
  }
  if (state === 'sleeping' || state === 'thirsty')
    return (
      <ellipse
        className="h-mouth-o"
        cx={100}
        cy={120}
        rx={3.2}
        ry={state === 'thirsty' ? 4 : 2.6}
      />
    );
  if (state === 'quiet') return <path className="h-mouth" d="M95 119 L105 119" />;
  if (state === 'tired') return <path className="h-mouth" d="M94 121 Q100 117 106 121" />;
  // «:3» — как на эталоне
  return <path className="h-mouth" d="M91 116 Q95.5 122 100 117 Q104.5 122 109 116" />;
}

/** Плоская пятиконечная звёздочка (для нарядов). */
function star(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.48;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join(' L')} Z`;
}

const STAR = '#FFD66E';
const STAR_LINE = '#D9A441';
const ROBE = '#9C7CBD';
const ROBE_DARK = '#7E5F9F';
const ROBE_LINE = '#6E5088';
const TRIM = '#FBE7B5';

/** Волшебник: колпак (конус за ушами, поля поверх лба), плащ с застёжкой-звездой, палочка. */
const wizard = {
  back: (
    <g className="outfit wizard-cone" transform="rotate(-5 100 80)">
      <path
        d="M60 74 C66 50 80 22 102 10 C116 3 132 4 142 14 C150 22 158 30 166 34 C158 36 150 34 144 30 C140 44 140 60 142 74 Z"
        fill={ROBE}
        stroke={ROBE_LINE}
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      <path d={star(166, 36, 8)} fill={STAR} stroke={STAR_LINE} strokeWidth={1.4} />
      <path d={star(104, 30, 7)} fill={STAR} />
      <path d={star(124, 50, 5)} fill={STAR} />
      <path d={star(84, 52, 4.5)} fill={STAR} />
      <path
        d="M62 66 Q100 58 142 66 L143 76 Q100 68 60 76 Z"
        fill={TRIM}
        stroke={ROBE_LINE}
        strokeWidth={1.6}
      />
    </g>
  ),
  front: (
    <g className="outfit wizard-cape">
      {/* плащ: от шеи почти до лапок, шире тела; спереди узкий разрез с жабо */}
      <path
        d="M96 142 L40 134 C28 146 20 160 16 172 C28 180 46 178 60 174 C72 178 84 174 90 168 C92 160 94 150 96 142 Z"
        fill={ROBE}
        stroke={ROBE_LINE}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <path
        d="M104 142 L160 134 C172 146 180 160 184 172 C172 180 154 178 140 174 C128 178 116 174 110 168 C108 160 106 150 104 142 Z"
        fill={ROBE}
        stroke={ROBE_LINE}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <g fill="none" stroke={TRIM} strokeWidth={4.5} strokeLinecap="round">
        <path d="M20 170 C30 176 46 174 60 170 C72 174 82 170 87 165" />
        <path d="M180 170 C170 176 154 174 140 170 C128 174 118 170 113 165" />
      </g>
      <path d={star(36, 157, 6)} fill={STAR} />
      <path d={star(62, 150, 5)} fill={STAR} />
      <path d={star(76, 162, 4)} fill={STAR} />
      <path d={star(138, 150, 5)} fill={STAR} />
      <path d={star(164, 158, 6)} fill={STAR} />
      <path d={star(124, 162, 4)} fill={STAR} />
      <path
        d="M92 148 Q100 170 108 148 Q104 158 100 170 Q96 158 92 148 Z"
        fill={TRIM}
        stroke={LINE}
        strokeWidth={1}
      />
      {/* воротник */}
      <path
        d="M30 138 Q100 116 170 138 L168 147 Q100 128 32 147 Z"
        fill={TRIM}
        stroke={ROBE_LINE}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <circle cx={100} cy={141} r={11} fill="#F6C24E" stroke={STAR_LINE} strokeWidth={1.8} />
      <path d={star(100, 141.5, 7)} fill="#FFE08A" />
    </g>
  ),
  prop: (
    <g className="outfit wizard-wand">
      <path d="M150 168 L170 118" stroke="#9A5B32" strokeWidth={3.4} strokeLinecap="round" />
      <path
        d={star(171, 114, 9)}
        fill={STAR}
        stroke={STAR_LINE}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      <path
        d="M182 100 L186 94 M186 110 L193 109 M176 96 L176 89"
        stroke={STAR}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
    </g>
  ),
  top: (
    <g className="outfit wizard-brim" transform="rotate(-5 100 80)">
      {/* поля колпака: шире головы, края опущены (вид чуть снизу) */}
      <path
        d="M20 96 C24 74 58 64 100 64 C142 64 176 74 180 96 C168 88 140 82 100 82 C60 82 32 88 20 96 Z"
        fill={ROBE}
        stroke={ROBE_LINE}
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      <path
        d="M24 92 C38 86 64 81 100 81 C136 81 162 86 176 92 C160 87 136 85 100 85 C64 85 40 87 24 92 Z"
        fill={ROBE_DARK}
      />
    </g>
  ),
};

/** Предметы, которые хомяк рисует по-своему (колпак на два слоя, большой плащ, палочка). */
const OWN = ['head:wizard', 'neck:cape', 'paw:wand'] as const;

/** Якоря гардероба хомяка (SPEC 4.9). */
export const HAMSTER_ANCHORS: Anchors = {
  head: { x: 100, y: 48, w: 52 },
  eyes: { l: 79, r: 121, y: 106, size: 12 },
  neck: { y: 140, w: 132 },
  paw: { x: 160, y: 152 },
};

export function Hamster(p: PetViewProps) {
  const base = DRAWN.has(p.state) ? p.state : 'idle';
  const r = p.reaction?.name;
  const drawn: FaceState = r === 'purr' || r === 'giggle' || r === 'dizzy' ? r : base;
  const acc = p.accessories;
  const hat = acc.includes('head:wizard');
  const anyHat = acc.some((a) => a.startsWith('head:'));
  const outfit = {
    back: hat ? wizard.back : null,
    top: hat ? wizard.top : null,
    front: acc.includes('neck:cape') ? wizard.front : null,
    prop: acc.includes('paw:wand') ? wizard.prop : null,
  };
  const A = (layer: 'back' | 'front' | 'eyes' | 'top' | 'paw') => (
    <Accessories items={acc} anchors={HAMSTER_ANCHORS} layer={layer} skip={OWN} />
  );
  const classes = [
    'pet',
    'vector',
    'species-hamster',
    `state-${drawn.replace(':', '-')}`,
    `stage-${p.stage}`,
    hat && acc.includes('neck:cape') && acc.includes('paw:wand') ? 'outfit-wizard' : '',
    p.blinking ? 'blink' : '',
    p.cozy ? 'cozy' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const arm = (side: 'l' | 'r') => {
    const x = side === 'l' ? 40 : 160;
    const rot = side === 'l' ? 14 : -14;
    return (
      <g className={`arm arm-${side}`}>
        {side === 'r' && outfit.prop}
        {side === 'r' && A('paw')}
        <ellipse
          cx={x}
          cy={146}
          rx={10}
          ry={15}
          fill={FUR}
          stroke={LINE}
          strokeWidth={2}
          transform={`rotate(${rot} ${x} 146)`}
        />
        <path
          d={
            side === 'l' ? 'M37 156 L38 160 M42 157 L42 161' : 'M163 156 L162 160 M158 157 L158 161'
          }
          stroke={LINE}
          strokeWidth={1.4}
          strokeLinecap="round"
        />
      </g>
    );
  };

  return (
    <div className={classes} data-state={p.state} aria-hidden>
      <svg className="shadow-layer" viewBox="0 0 200 200" width="100%" height="100%">
        <ellipse className="shadow" cx={100} cy={185} rx={54} ry={7} />
      </svg>
      <div className="hop" key={p.reaction?.key ?? 0} data-reaction={r ?? ''}>
        <div className="stage-scale">
          <div className="breath">
            <svg viewBox="0 0 200 200" width="100%" height="100%">
              <defs>
                <radialGradient id="hamFur" cx="40%" cy="28%" r="85%">
                  <stop offset="0%" stopColor={FUR_LIGHT} />
                  <stop offset="70%" stopColor={FUR} />
                  <stop offset="100%" stopColor="#EFA55A" />
                </radialGradient>
              </defs>
              {outfit.back}
              {base === 'adventure' && <Backpack x={174} y={118} />}
              {A('back')}
              <g data-hit>
                {/* ноги */}
                <ellipse
                  cx={74}
                  cy={180}
                  rx={14}
                  ry={7}
                  fill={PINK}
                  stroke={LINE}
                  strokeWidth={1.8}
                />
                <ellipse
                  cx={126}
                  cy={180}
                  rx={14}
                  ry={7}
                  fill={PINK}
                  stroke={LINE}
                  strokeWidth={1.8}
                />
                {/* уши */}
                <circle cx={54} cy={58} r={16} fill={FUR} stroke={LINE} strokeWidth={2.2} />
                <circle cx={146} cy={58} r={16} fill={FUR} stroke={LINE} strokeWidth={2.2} />
                <circle cx={56} cy={60} r={9} fill={PINK} />
                <circle cx={144} cy={60} r={9} fill={PINK} />
                {/* тело-булочка */}
                <path
                  d="M100 46 C148 46 174 78 175 118 C176 158 150 182 100 182 C50 182 24 158 25 118 C26 78 52 46 100 46 Z"
                  fill="url(#hamFur)"
                  stroke={LINE}
                  strokeWidth={2.4}
                />
                {/* светлая мордочка и живот */}
                <path
                  d="M40 118 C40 102 68 98 100 102 C132 98 160 102 160 118 C160 130 152 136 144 140 C156 154 150 179 100 179 C50 179 44 154 56 140 C48 136 40 130 40 118 Z"
                  fill={CREAM}
                />
                {/* хохолок (под колпаком не виден) */}
                {!anyHat && (
                  <path
                    d="M90 48 C90 38 98 34 104 38 C106 32 114 32 116 38 C112 38 110 42 110 48 Z"
                    fill={FUR}
                    stroke={LINE}
                    strokeWidth={2}
                    strokeLinejoin="round"
                  />
                )}
                {p.stage === 'teen' && !anyHat && (
                  <g className="sprout">
                    <path
                      d="M100 32 Q99 20 102 14"
                      stroke="#5aa784"
                      strokeWidth={3}
                      fill="none"
                      strokeLinecap="round"
                    />
                    <ellipse
                      cx={110}
                      cy={16}
                      rx={8}
                      ry={4.5}
                      fill="#7fcf9f"
                      transform="rotate(-25 110 16)"
                    />
                    <ellipse
                      cx={93}
                      cy={20}
                      rx={6.5}
                      ry={4}
                      fill="#7fcf9f"
                      transform="rotate(30 93 20)"
                    />
                  </g>
                )}
                {outfit.front}
                {A('front')}
                {arm('l')}
                {arm('r')}
                {r === 'eat' && <Snack x={112} y={124} />}
                {(r === 'drink' || base === 'onBreak:drinkWater') && (
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
                {p.cozy && (
                  <g className="scarf">
                    <path d="M42 136 Q100 160 158 136 L160 150 Q100 174 40 150 Z" fill="#f2a07a" />
                    <path d="M128 150 L140 176 L126 178 L118 154 Z" fill="#e88c63" />
                  </g>
                )}
                {base === 'thirsty' && (
                  <path
                    className="empty-glass"
                    d="M178 150 L198 150 L195 182 L181 182 Z"
                    fill="#f2fbff"
                    stroke="#9cc9e0"
                    strokeWidth={2}
                  />
                )}
                {base === 'tired' && (
                  <path
                    className="sweat"
                    d="M150 70 Q157 84 150 91 Q143 84 150 70 Z"
                    fill="#a9dcf5"
                    stroke="#7fbfe0"
                    strokeWidth={1}
                  />
                )}
                <g className="face" style={{ ['--lid' as string]: FUR }}>
                  <ellipse cx={62} cy={122} rx={13} ry={8} fill={PINK} opacity={0.55} />
                  <ellipse cx={138} cy={122} rx={13} ry={8} fill={PINK} opacity={0.55} />
                  {!hat && (
                    <g
                      className="brows"
                      stroke={LINE}
                      strokeWidth={2}
                      fill="none"
                      strokeLinecap="round"
                    >
                      <path d="M72 88 Q78 85 84 87" />
                      <path d="M116 87 Q122 85 128 88" />
                    </g>
                  )}
                  <Eyes state={drawn} />
                  <path
                    d="M96 111 Q100 109 104 111 Q103 115 100 116 Q97 115 96 111 Z"
                    fill="#F08C8C"
                  />
                  <Mouth state={drawn} />
                  {p.stage === 'wise' && !hasEyewear(acc) && (
                    <g className="glasses" fill="none" stroke="#5d5678" strokeWidth={2.2}>
                      <circle cx={79} cy={106} r={15} />
                      <circle cx={121} cy={106} r={15} />
                      <path d="M94 104 Q100 100 106 104" />
                    </g>
                  )}
                </g>
                {A('eyes')}
                {outfit.top}
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

/** Вариант А: зверь нарисован вектором — все состояния и реакции блоба, наряды слоями. */
export class SvgHamsterRenderer extends AnimatedPetRenderer {
  protected readonly eyeShift = 3;
  protected view(p: PetViewProps) {
    return <Hamster {...p} />;
  }
}
