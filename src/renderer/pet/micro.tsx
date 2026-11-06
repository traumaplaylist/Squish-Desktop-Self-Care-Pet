/**
 * Микро-питомцы (SPEC 4.8): 12 маленьких простых SVG в кадре 40×40. Без анимаций в покое
 * (бюджет CPU, SPEC 7.5) — подпрыгивают только на галочку (класс .hop-once снаружи).
 */
const L = '#5d5678';
const eyes = (y = 22, dx = 5, cx = 20) => (
  <>
    <circle cx={cx - dx} cy={y} r={1.8} fill="#2E2A3D" />
    <circle cx={cx + dx} cy={y} r={1.8} fill="#2E2A3D" />
  </>
);

const DRAW: Record<string, () => JSX.Element> = {
  snail: () => (
    <>
      <path
        d="M6 32 Q6 26 14 26 L32 26 Q36 26 36 32 Z"
        fill="#F4D7A1"
        stroke={L}
        strokeWidth={1.4}
      />
      <circle cx={22} cy={20} r={9} fill="#E9A97A" stroke={L} strokeWidth={1.4} />
      <path d="M22 20 m-4 0 a4 4 0 1 0 4 -4" fill="none" stroke={L} strokeWidth={1.2} />
      <path d="M8 26 L6 18 M11 26 L11 18" stroke={L} strokeWidth={1.2} />
      {eyes(18, 0, 8.5)}
    </>
  ),
  firefly: () => (
    <>
      <circle cx={20} cy={28} r={7} fill="#FFF0A0" opacity={0.7} />
      <ellipse cx={20} cy={20} rx={7} ry={8} fill="#6B6488" />
      <ellipse cx={13} cy={15} rx={5} ry={3} fill="#DDE8FF" opacity={0.8} />
      <ellipse cx={27} cy={15} rx={5} ry={3} fill="#DDE8FF" opacity={0.8} />
      <circle cx={20} cy={29} r={4} fill="#FFE066" />
      <circle cx={17.5} cy={18} r={1.5} fill="#fff" />
      <circle cx={22.5} cy={18} r={1.5} fill="#fff" />
    </>
  ),
  mushroom: () => (
    <>
      <rect
        x={15}
        y={20}
        width={10}
        height={14}
        rx={4}
        fill="#FFF6E8"
        stroke={L}
        strokeWidth={1.4}
      />
      <path d="M5 21 Q20 2 35 21 Z" fill="#E86F6F" stroke={L} strokeWidth={1.4} />
      <circle cx={14} cy={14} r={2.4} fill="#fff" />
      <circle cx={25} cy={12} r={2} fill="#fff" />
      {eyes(27, 3)}
    </>
  ),
  cloud: () => (
    <>
      <path
        d="M9 30 Q3 30 4 24 Q5 18 12 19 Q14 11 22 12 Q30 12 31 20 Q37 20 36 26 Q35 30 30 30 Z"
        fill="#F4F6FF"
        stroke={L}
        strokeWidth={1.4}
      />
      {eyes(23, 5)}
      <path d="M17 26 Q20 28 23 26" fill="none" stroke={L} strokeWidth={1.2} />
    </>
  ),
  pebble: () => (
    <>
      <ellipse cx={20} cy={26} rx={13} ry={9} fill="#B9B4C8" stroke={L} strokeWidth={1.4} />
      <ellipse cx={15} cy={22} rx={3} ry={1.6} fill="#fff" opacity={0.5} />
      {eyes(26, 4.5)}
    </>
  ),
  sprout: () => (
    <>
      <path d="M20 34 L20 18" stroke="#5AA784" strokeWidth={3} strokeLinecap="round" />
      <ellipse cx={13} cy={15} rx={7} ry={4} fill="#7FCF9F" transform="rotate(25 13 15)" />
      <ellipse cx={27} cy={13} rx={7} ry={4} fill="#7FCF9F" transform="rotate(-25 27 13)" />
      <ellipse cx={20} cy={34} rx={9} ry={3} fill="#C9A27A" />
      {eyes(27, 3.5)}
    </>
  ),
  bee: () => (
    <>
      <ellipse cx={14} cy={13} rx={5} ry={3.5} fill="#DDE8FF" opacity={0.85} />
      <ellipse cx={26} cy={13} rx={5} ry={3.5} fill="#DDE8FF" opacity={0.85} />
      <ellipse cx={20} cy={23} rx={10} ry={8.5} fill="#FFD66E" stroke={L} strokeWidth={1.4} />
      <path
        d="M14 18 L14 29 M20 15 L20 31 M26 18 L26 29"
        stroke="#5d5678"
        strokeWidth={2}
        opacity={0.6}
      />
      {eyes(21, 4)}
    </>
  ),
  ladybug: () => (
    <>
      <circle cx={20} cy={14} r={5} fill="#3B3650" />
      <ellipse cx={20} cy={25} rx={11} ry={9} fill="#E86F6F" stroke={L} strokeWidth={1.4} />
      <path d="M20 16 L20 34" stroke="#3B3650" strokeWidth={1.4} />
      <circle cx={14} cy={24} r={2} fill="#3B3650" />
      <circle cx={26} cy={27} r={2} fill="#3B3650" />
      <circle cx={17.5} cy={13} r={1.2} fill="#fff" />
      <circle cx={22.5} cy={13} r={1.2} fill="#fff" />
    </>
  ),
  jelly: () => (
    <>
      <path
        d="M8 30 Q8 12 20 12 Q32 12 32 30 Q29 27 26 30 Q23 27 20 30 Q17 27 14 30 Q11 27 8 30 Z"
        fill="#C9B6F2"
        stroke={L}
        strokeWidth={1.4}
        opacity={0.95}
      />
      <ellipse cx={15} cy={17} rx={3} ry={1.8} fill="#fff" opacity={0.6} />
      {eyes(22, 4.5)}
    </>
  ),
  moth: () => (
    <>
      <ellipse cx={11} cy={22} rx={8} ry={10} fill="#E9DCC8" stroke={L} strokeWidth={1.2} />
      <ellipse cx={29} cy={22} rx={8} ry={10} fill="#E9DCC8" stroke={L} strokeWidth={1.2} />
      <ellipse cx={20} cy={23} rx={4} ry={9} fill="#B7A48A" />
      <path d="M18 14 Q15 8 12 8 M22 14 Q25 8 28 8" fill="none" stroke={L} strokeWidth={1.2} />
      {eyes(19, 2)}
    </>
  ),
  acorn: () => (
    <>
      <ellipse cx={20} cy={25} rx={9} ry={10} fill="#D9A56B" stroke={L} strokeWidth={1.4} />
      <path d="M9 18 Q20 8 31 18 Q20 22 9 18 Z" fill="#8C6A43" stroke={L} strokeWidth={1.4} />
      <path d="M20 12 L21 7" stroke="#8C6A43" strokeWidth={2} strokeLinecap="round" />
      {eyes(26, 3.5)}
    </>
  ),
  star: () => (
    <>
      <path
        d="M20 6 L24 16 L35 16 L26 23 L29 34 L20 27 L11 34 L14 23 L5 16 L16 16 Z"
        fill="#FFD66E"
        stroke="#D9A441"
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      {eyes(20, 3.5)}
    </>
  ),
};

export function MicroPet({ id, size = 34 }: { id: string; size?: number }) {
  const d = DRAW[id];
  if (!d) return null;
  return (
    <svg className={`micro micro-${id}`} viewBox="0 0 40 40" width={size} height={size} aria-hidden>
      {d()}
    </svg>
  );
}

export const MICRO_IDS = Object.keys(DRAW);
