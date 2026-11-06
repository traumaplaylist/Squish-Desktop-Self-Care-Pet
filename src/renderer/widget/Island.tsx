import type { Snapshot } from '../../core/types';

/**
 * Островок под питомцем (SPEC 4.10): коврик, растение, окошко со временем суток.
 * Сцена статична (меняется не чаще раза в минуту — по снапшоту), кликов не ловит (нет data-hit).
 * Фон виджета из гардероба (bg:*) — мягкий круг за питомцем.
 */
const SKY: Record<Snapshot['island']['timeOfDay'], [string, string]> = {
  morning: ['#FFE3C2', '#BFE3F5'],
  day: ['#BFE3F5', '#E8F6FF'],
  evening: ['#F6B7A0', '#C9B6F2'],
  night: ['#3B3D6B', '#5B5E95'],
};

export function Island({ snap }: { snap: Snapshot }) {
  const bg = snap.pet.accessories.find((a) => a.startsWith('bg:'));
  const on = snap.island.enabled;
  if (!on && !bg) return null;
  const [s1, s2] = SKY[snap.island.timeOfDay];
  const night = snap.island.timeOfDay === 'night';
  return (
    <svg className="island" viewBox="0 0 240 360" width="240" height="360" aria-hidden>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={s1} />
          <stop offset="1" stopColor={s2} />
        </linearGradient>
        <radialGradient id="bgStars" cx="50%" cy="45%" r="55%">
          <stop offset="0" stopColor="#5B5E95" stopOpacity={0.9} />
          <stop offset="1" stopColor="#3B3D6B" stopOpacity={0} />
        </radialGradient>
        <radialGradient id="bgMeadow" cx="50%" cy="55%" r="55%">
          <stop offset="0" stopColor="#C8EFC0" stopOpacity={0.95} />
          <stop offset="1" stopColor="#9ED69A" stopOpacity={0} />
        </radialGradient>
      </defs>
      {bg === 'bg:stars' && (
        <g className="bg-stars">
          <circle cx={120} cy={222} r={96} fill="url(#bgStars)" />
          {[
            [70, 170],
            [160, 160],
            [185, 220],
            [60, 240],
            [120, 140],
            [150, 270],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={1.8} fill="#FFF6D0" />
          ))}
        </g>
      )}
      {bg === 'bg:meadow' && (
        <g className="bg-meadow">
          <circle cx={120} cy={226} r={96} fill="url(#bgMeadow)" />
          {[
            [62, 262],
            [180, 256],
            [92, 290],
            [154, 292],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} r={3} fill="#FFB3C7" />
              <circle cx={x} cy={y} r={1.3} fill="#FFE08A" />
            </g>
          ))}
        </g>
      )}
      {on && (
        <g className="scene">
          {/* окошко */}
          <g transform="translate(12 150)">
            <rect width={38} height={42} rx={6} fill="url(#sky)" stroke="#C9B49A" strokeWidth={3} />
            {night ? (
              <path d="M26 12 a7 7 0 1 1 -7 -7 a5.5 5.5 0 0 0 7 7 Z" fill="#FFF3C4" />
            ) : (
              <circle cx={26} cy={13} r={5} fill="#FFE08A" />
            )}
            <path d="M19 2 L19 40 M2 21 L36 21" stroke="#C9B49A" strokeWidth={2} />
          </g>
          {/* растение */}
          <g transform="translate(8 252)">
            <path
              d="M14 30 Q8 12 2 6 M14 30 Q16 10 22 2 M14 30 Q22 18 30 14"
              stroke="#5AA784"
              strokeWidth={2.4}
              fill="none"
              strokeLinecap="round"
            />
            <ellipse cx={3} cy={7} rx={6} ry={3.5} fill="#7FCF9F" transform="rotate(40 3 7)" />
            <ellipse cx={22} cy={3} rx={6} ry={3.5} fill="#7FCF9F" transform="rotate(-60 22 3)" />
            <ellipse cx={29} cy={14} rx={6} ry={3.5} fill="#7FCF9F" transform="rotate(-20 29 14)" />
            <path d="M4 30 L24 30 L21 46 L7 46 Z" fill="#E0A27A" stroke="#B5794F" strokeWidth={2} />
          </g>
          {/* коврик */}
          <ellipse
            cx={120}
            cy={300}
            rx={78}
            ry={12}
            fill="#F3D9C4"
            stroke="#E2BFA3"
            strokeWidth={2}
          />
          <ellipse
            cx={120}
            cy={300}
            rx={60}
            ry={8}
            fill="none"
            stroke="#E9C7AE"
            strokeWidth={2}
            strokeDasharray="4 5"
          />
        </g>
      )}
    </svg>
  );
}
