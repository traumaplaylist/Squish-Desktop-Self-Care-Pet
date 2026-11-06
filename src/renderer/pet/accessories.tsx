/**
 * Гардероб (SPEC 4.9): SVG-слои с якорями — голова, глаза, шея, лапка. Рисуются внутри рендерера
 * питомца, поэтому двигаются вместе с ним на всех стадиях. Фон виджета (bg:*) — в островке виджета.
 * Якоря у каждого вида свои (блоб и хомяк — в одной системе координат 200×200).
 */
import type { ReactNode } from 'react';

export interface Anchors {
  /** Макушка: центр и полуширина головы. */
  head: { x: number; y: number; w: number };
  eyes: { l: number; r: number; y: number; size: number };
  neck: { y: number; w: number };
  /** Точка в правой лапке (рисуется внутри группы .arm-r). */
  paw: { x: number; y: number };
}

export type Layer = 'back' | 'front' | 'eyes' | 'top' | 'paw';

const STAR = '#FFD66E';
const LINE = '#6E5088';

function star(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.48;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join(' L')} Z`;
}

function heart(cx: number, cy: number, s: number): string {
  return `M${cx} ${cy + s * 0.9} C${cx - s * 1.4} ${cy - s * 0.1} ${cx - s * 0.7} ${cy - s * 1.1} ${cx} ${cy - s * 0.35} C${cx + s * 0.7} ${cy - s * 1.1} ${cx + s * 1.4} ${cy - s * 0.1} ${cx} ${cy + s * 0.9} Z`;
}

type Draw = (a: Anchors) => ReactNode;

const ITEMS: Record<string, Partial<Record<Layer, Draw>>> = {
  'head:beanie': {
    top: ({ head: h }) => (
      <g className="acc acc-beanie">
        <path
          d={`M${h.x - h.w * 0.62} ${h.y + 14} C${h.x - h.w * 0.6} ${h.y - 26} ${h.x + h.w * 0.6} ${h.y - 26} ${h.x + h.w * 0.62} ${h.y + 14} Z`}
          fill="#E98C8C"
          stroke="#B65F63"
          strokeWidth={2}
        />
        <rect
          x={h.x - h.w * 0.66}
          y={h.y + 6}
          width={h.w * 1.32}
          height={11}
          rx={5.5}
          fill="#F6C1B8"
          stroke="#B65F63"
          strokeWidth={2}
        />
        <circle cx={h.x} cy={h.y - 22} r={7} fill="#FBE3DC" stroke="#B65F63" strokeWidth={2} />
      </g>
    ),
  },
  'head:flowers': {
    top: ({ head: h }) => (
      <g className="acc acc-flowers">
        <path
          d={`M${h.x - h.w * 0.62} ${h.y + 10} Q${h.x} ${h.y - 12} ${h.x + h.w * 0.62} ${h.y + 10}`}
          fill="none"
          stroke="#6FAE72"
          strokeWidth={3}
        />
        {[-0.55, -0.28, 0, 0.28, 0.55].map((k, i) => {
          const x = h.x + k * h.w;
          const y = h.y + 10 - (1 - Math.abs(k) * 1.6) * 16 + 4;
          const c = ['#FFB3C7', '#FFE08A', '#C9B6F2', '#FFE08A', '#FFB3C7'][i];
          return (
            <g key={k}>
              {[0, 72, 144, 216, 288].map((a) => (
                <circle
                  key={a}
                  cx={x + 4.5 * Math.cos((a * Math.PI) / 180)}
                  cy={y + 4.5 * Math.sin((a * Math.PI) / 180)}
                  r={3.6}
                  fill={c}
                />
              ))}
              <circle cx={x} cy={y} r={2.6} fill="#F2A65A" />
            </g>
          );
        })}
      </g>
    ),
  },
  'head:wizard': {
    top: ({ head: h }) => (
      <g className="acc acc-wizard" transform={`rotate(-6 ${h.x} ${h.y})`}>
        <path
          d={`M${h.x - h.w * 0.5} ${h.y + 6} C${h.x - 20} ${h.y - 30} ${h.x} ${h.y - 52} ${h.x + 14} ${h.y - 62} C${h.x + 26} ${h.y - 58} ${h.x + 34} ${h.y - 50} ${h.x + 42} ${h.y - 48} C${h.x + 30} ${h.y - 40} ${h.x + 24} ${h.y - 20} ${h.x + h.w * 0.5} ${h.y + 6} Z`}
          fill="#9C7CBD"
          stroke={LINE}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <path d={star(h.x + 42, h.y - 48, 6.5)} fill={STAR} stroke="#D9A441" strokeWidth={1.2} />
        <path d={star(h.x + 4, h.y - 22, 5.5)} fill={STAR} />
        <ellipse
          cx={h.x}
          cy={h.y + 8}
          rx={h.w * 0.95}
          ry={9}
          fill="#9C7CBD"
          stroke={LINE}
          strokeWidth={2}
        />
      </g>
    ),
  },
  'eyes:hearts': {
    eyes: ({ eyes: e }) => (
      <g className="acc acc-hearts" stroke="#C2557A" strokeWidth={2}>
        <path d={heart(e.l, e.y, e.size)} fill="rgba(255,150,190,.45)" />
        <path d={heart(e.r, e.y, e.size)} fill="rgba(255,150,190,.45)" />
        <path
          d={`M${e.l + e.size * 0.9} ${e.y - e.size * 0.2} Q${(e.l + e.r) / 2} ${e.y - e.size * 0.6} ${e.r - e.size * 0.9} ${e.y - e.size * 0.2}`}
          fill="none"
        />
      </g>
    ),
  },
  'eyes:sun': {
    eyes: ({ eyes: e }) => (
      <g className="acc acc-sun">
        {[e.l, e.r].map((x) => (
          <rect
            key={x}
            x={x - e.size * 1.05}
            y={e.y - e.size * 0.7}
            width={e.size * 2.1}
            height={e.size * 1.45}
            rx={e.size * 0.6}
            fill="rgba(40,36,60,.82)"
            stroke="#2E2A3D"
            strokeWidth={2}
          />
        ))}
        <path
          d={`M${e.l + e.size} ${e.y - e.size * 0.3} L${e.r - e.size} ${e.y - e.size * 0.3}`}
          stroke="#2E2A3D"
          strokeWidth={2.4}
        />
        <path
          d={`M${e.l - e.size * 0.6} ${e.y - e.size * 0.2} l${e.size * 0.5} ${-e.size * 0.3}`}
          stroke="#fff"
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.6}
        />
      </g>
    ),
  },
  'neck:scarf': {
    front: ({ neck: n }) => (
      <g className="acc acc-scarf">
        <path
          d={`M${100 - n.w / 2} ${n.y - 6} Q100 ${n.y + 18} ${100 + n.w / 2} ${n.y - 6} L${100 + n.w / 2 + 2} ${n.y + 8} Q100 ${n.y + 34} ${100 - n.w / 2 - 2} ${n.y + 8} Z`}
          fill="#7CC4EC"
          stroke="#4E93B8"
          strokeWidth={1.8}
        />
        {[-0.3, 0, 0.3].map((k) => (
          <path
            key={k}
            d={`M${100 + k * n.w - 4} ${n.y + 4 + Math.abs(k) * -10 + 8} l8 0`}
            stroke="#FFF6E8"
            strokeWidth={4}
            strokeLinecap="round"
          />
        ))}
        <path
          d={`M${100 + n.w * 0.22} ${n.y + 12} l10 26 l-13 2 l-6 -24 Z`}
          fill="#7CC4EC"
          stroke="#4E93B8"
          strokeWidth={1.8}
        />
      </g>
    ),
  },
  'neck:cape': {
    back: ({ neck: n }) => (
      <path
        className="acc acc-cape-back"
        d={`M${100 - n.w / 2} ${n.y - 8} C${100 - n.w / 2 - 16} ${n.y + 20} ${100 - n.w / 2 - 12} ${n.y + 32} ${100 - n.w / 2 - 18} ${n.y + 40} L${100 + n.w / 2 + 18} ${n.y + 40} C${100 + n.w / 2 + 12} ${n.y + 32} ${100 + n.w / 2 + 16} ${n.y + 20} ${100 + n.w / 2} ${n.y - 8} Z`}
        fill="#9C7CBD"
        stroke={LINE}
        strokeWidth={2}
      />
    ),
    front: ({ neck: n }) => (
      <g className="acc acc-cape">
        <path
          d={`M${100 - n.w / 2} ${n.y - 6} Q100 ${n.y + 8} ${100 + n.w / 2} ${n.y - 6} L${100 + n.w / 2 - 2} ${n.y + 2} Q100 ${n.y + 16} ${100 - n.w / 2 + 2} ${n.y + 2} Z`}
          fill="#FBE7B5"
          stroke={LINE}
          strokeWidth={1.6}
        />
        <circle cx={100} cy={n.y + 6} r={7} fill="#F6C24E" stroke="#D9A441" strokeWidth={1.6} />
        <path d={star(100, n.y + 6.5, 4.6)} fill="#FFE08A" />
      </g>
    ),
  },
  'paw:flower': {
    paw: ({ paw: p }) => (
      <g className="acc acc-flower">
        <path d={`M${p.x} ${p.y + 6} L${p.x + 4} ${p.y - 26}`} stroke="#5AA784" strokeWidth={3} />
        {[0, 72, 144, 216, 288].map((a) => (
          <circle
            key={a}
            cx={p.x + 4 + 6 * Math.cos((a * Math.PI) / 180)}
            cy={p.y - 30 + 6 * Math.sin((a * Math.PI) / 180)}
            r={4.8}
            fill="#FFB3C7"
          />
        ))}
        <circle cx={p.x + 4} cy={p.y - 30} r={3.6} fill="#FFE08A" />
      </g>
    ),
  },
  'paw:mug': {
    paw: ({ paw: p }) => (
      <g className="acc acc-mug">
        <path
          d={`M${p.x + 9} ${p.y - 12} q9 0 9 8 q0 8 -9 8`}
          fill="none"
          stroke="#B76E4C"
          strokeWidth={3}
        />
        <rect
          x={p.x - 9}
          y={p.y - 16}
          width={19}
          height={22}
          rx={4}
          fill="#FFF6E8"
          stroke="#B76E4C"
          strokeWidth={2}
        />
        <path d={heart(p.x + 0.5, p.y - 5, 4)} fill="#E98C8C" />
      </g>
    ),
  },
  'paw:wand': {
    paw: ({ paw: p }) => (
      <g className="acc acc-wand">
        <path
          d={`M${p.x - 6} ${p.y + 14} L${p.x + 10} ${p.y - 30}`}
          stroke="#9A5B32"
          strokeWidth={3.2}
          strokeLinecap="round"
        />
        <path d={star(p.x + 11, p.y - 34, 8)} fill={STAR} stroke="#D9A441" strokeWidth={1.4} />
      </g>
    ),
  },
};

/** Нарисовать слой надетых предметов. skip — предметы, которые вид рисует по-своему. */
export function Accessories({
  items,
  anchors,
  layer,
  skip = [],
}: {
  items: readonly string[];
  anchors: Anchors;
  layer: Layer;
  skip?: readonly string[];
}) {
  const out = items
    .filter((id) => !skip.includes(id))
    .map((id) => {
      const d = ITEMS[id]?.[layer];
      return d ? <g key={id}>{d(anchors)}</g> : null;
    });
  return <>{out}</>;
}

export const hasEyewear = (items: readonly string[]) => items.some((i) => i.startsWith('eyes:'));

/** Угощение у рта (реакция eat). */
export function Snack({ x, y }: { x: number; y: number }) {
  return (
    <g className="snack" style={{ transformOrigin: `${x}px ${y}px` }}>
      <circle cx={x} cy={y} r={7} fill="#E8B46A" stroke="#B5803F" strokeWidth={1.6} />
      <circle cx={x - 2.5} cy={y - 2} r={1.2} fill="#7A4A26" />
      <circle cx={x + 2.5} cy={y + 1.5} r={1.2} fill="#7A4A26" />
      <circle cx={x + 1} cy={y - 3.5} r={1} fill="#7A4A26" />
    </g>
  );
}

/** Рюкзак (поза adventure, SPEC 7.2). */
export function Backpack({ x, y }: { x: number; y: number }) {
  return (
    <g className="backpack">
      <rect
        x={x - 16}
        y={y - 20}
        width={32}
        height={40}
        rx={10}
        fill="#C98A4B"
        stroke="#8C5A2B"
        strokeWidth={2}
      />
      <rect
        x={x - 11}
        y={y + 2}
        width={22}
        height={13}
        rx={4}
        fill="#E0A964"
        stroke="#8C5A2B"
        strokeWidth={1.6}
      />
      <path d={`M${x - 12} ${y - 26} q12 -10 24 0`} fill="none" stroke="#8C5A2B" strokeWidth={3} />
    </g>
  );
}
