import type { CSSProperties } from 'react';
import type { PetVisualState } from '../../core/types';
import { AnimatedPetRenderer, type PetViewProps } from './AnimatedPetRenderer';
import { faceFor, type RigPart, type SpeciesRig } from './rig';
import './blob.css';
import './layered.css';

/** Картинки и размеры деталей вида: { 'hamster/body': url } и { 'hamster/body': [w, h] }. */
export interface SpeciesAssets {
  urls: Record<string, string>;
  sizes: Record<string, [number, number]>;
}

const NOT_DRAWN: ReadonlySet<PetVisualState> = new Set<PetVisualState>(['adventure']);

/**
 * «Зверь из деталей» (вариант Б): PNG-детали в одном SVG по ригу. Классы слоёв те же, что у блоба
 * (.hop / .stage-scale / .breath / .arm-l / .arm-r / .pupil / .eye), поэтому прыжки, упражнения,
 * обнимашки и т. п. — общий CSS из blob.css. Новый зверь = папка с PNG + риг, без нового кода.
 */
export class LayeredRenderer extends AnimatedPetRenderer {
  /** Глаза сдвигаются сильнее: у рига свой масштаб (viewBox ~360 против 200 у блоба). */
  protected readonly eyeShift = 8;

  constructor(
    container: HTMLElement,
    private readonly rig: SpeciesRig,
    private readonly assets: SpeciesAssets,
  ) {
    super(container);
  }

  protected view(p: PetViewProps) {
    return <Layered p={p} rig={this.rig} assets={this.assets} />;
  }
}

function Part({
  part,
  rig,
  assets,
  className,
  hit,
  style,
}: {
  part: RigPart;
  rig: SpeciesRig;
  assets: SpeciesAssets;
  className?: string;
  hit?: boolean;
  style?: CSSProperties;
}) {
  const key = `${rig.id}/${part.src}`;
  const size = assets.sizes[key];
  const url = assets.urls[key];
  if (!size || !url) return null;
  const h = part.h ?? (part.w * size[1]) / size[0];
  return (
    <image
      href={url}
      x={part.x}
      y={part.y}
      width={part.w}
      height={h}
      preserveAspectRatio={part.h ? 'none' : undefined}
      className={className}
      style={style}
      {...(hit ? { 'data-hit': true } : {})}
    />
  );
}

function Layered({ p, rig, assets }: { p: PetViewProps; rig: SpeciesRig; assets: SpeciesAssets }) {
  const base = NOT_DRAWN.has(p.state) ? 'idle' : p.state;
  const r = p.reaction?.name;
  const faceState = r === 'purr' || r === 'giggle' || r === 'dizzy' ? r : base;
  const face = faceFor(faceState);
  // Моргание: открытые глаза сжимаются (как у блоба); закрытые/сонные — без изменений.
  const eyes = rig.eyes[face.eyes];
  const mouth = rig.mouths[face.mouth];
  const outfit = p.accessories.map((id) => rig.outfits[id.replace(/^outfit:/, '')]).find(Boolean);
  const { l, r: rs } = rig.shoulders;
  const P = (
    part: RigPart,
    extra: Omit<Parameters<typeof Part>[0], 'part' | 'rig' | 'assets'> = {},
  ) => <Part part={part} rig={rig} assets={assets} {...extra} />;
  // viewBox: тело занимает ту же долю кадра, что у блоба (≈ 72% ширины), низ — у ног.
  const vbW = rig.body.w / 0.72;
  const vbX = -(vbW - rig.body.w) / 2;
  const vbY = rig.body.h + 10 - vbW * 0.92;
  const viewBox = `${vbX} ${vbY} ${vbW} ${vbW}`;
  const classes = [
    'pet',
    'layered',
    `species-${rig.id}`,
    `state-${base.replace(':', '-')}`,
    `stage-${p.stage}`,
    p.blinking ? 'blink' : '',
    p.cozy ? 'cozy' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const { glass, sweat, neck } = rig.anchors;

  return (
    <div className={classes} data-state={p.state} aria-hidden>
      <svg className="shadow-layer" viewBox={viewBox} width="100%" height="100%">
        {P(rig.parts.shadow)}
      </svg>
      <div className="hop" key={p.reaction?.key ?? 0} data-reaction={p.reaction?.name ?? ''}>
        <div className="stage-scale">
          <div className="breath">
            <svg viewBox={viewBox} width="100%" height="100%">
              {outfit?.back?.map((x) => (
                <g key={x.src}>{P(x)}</g>
              ))}
              {P(rig.parts.feet, { hit: true })}
              {P(rig.parts.body, { hit: true })}
              {outfit?.front?.map((x) => (
                <g key={x.src}>{P(x, { hit: true })}</g>
              ))}
              <g className="arm arm-l" style={{ transformOrigin: `${l.x}px ${l.y}px` }}>
                {P(rig.parts.armL, { hit: true })}
              </g>
              <g className="arm arm-r" style={{ transformOrigin: `${rs.x}px ${rs.y}px` }}>
                {outfit?.prop && P(outfit.prop)}
                {P(rig.parts.armR, { hit: true })}
              </g>
              {p.cozy && (
                // Тяжёлый день: тёплый шарфик (R0: модификатор cozy)
                <path
                  className="scarf"
                  d={`M${neck.x - 95} ${neck.y - 6} Q${neck.x} ${neck.y + 26} ${neck.x + 95} ${neck.y - 6} L${neck.x + 97} ${neck.y + 12} Q${neck.x} ${neck.y + 46} ${neck.x - 97} ${neck.y + 12} Z`}
                  fill="#f2a07a"
                  stroke="#c4744f"
                  strokeWidth={2}
                />
              )}
              <g className="face">
                {P(rig.parts.blush)}
                <g className="pupil">
                  <g className={face.eyes === 'open' ? 'eye' : ''}>{P(eyes)}</g>
                </g>
                {P(mouth)}
              </g>
              {base === 'tired' && (
                <path
                  className="sweat"
                  d={`M${sweat.x} ${sweat.y} q10 18 0 28 q-10 -10 0 -28 Z`}
                  fill="#a9dcf5"
                  stroke="#7fb8d6"
                  strokeWidth={1.5}
                />
              )}
              {base === 'thirsty' && (
                <path
                  className="empty-glass"
                  d={`M${glass.x} ${glass.y} l34 0 l-5 50 l-24 0 Z`}
                  fill="#f2fbff"
                  stroke="#9cc9e0"
                  strokeWidth={3}
                />
              )}
              {r === 'drink' && (
                <g className="glass">
                  <path
                    d={`M${rs.x - 6} ${rs.y - 40} l34 0 l-5 52 l-24 0 Z`}
                    fill="#dff4ff"
                    stroke="#9cc9e0"
                    strokeWidth={3}
                  />
                  <path
                    d={`M${rs.x - 4} ${rs.y - 20} l30 0 l-4 32 l-22 0 Z`}
                    fill="#7cc4ec"
                    opacity={0.75}
                  />
                </g>
              )}
              {outfit?.top?.map((x) => (
                <g key={x.src}>{P(x)}</g>
              ))}
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
      {base === 'sleeping' && (
        <div className="zzz">
          <span>z</span>
          <span>z</span>
          <span>Z</span>
        </div>
      )}
    </div>
  );
}
