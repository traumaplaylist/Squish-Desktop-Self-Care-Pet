import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PetVisualState } from '../../core/types';
import { faceFor, type RigPart } from './rig';
import { HAMSTER } from './species/hamster/rig';
import hamsterSizes from './species/hamster/sizes.json';

const RIGS = [{ rig: HAMSTER, sizes: hamsterSizes as unknown as Record<string, [number, number]> }];

function allParts(r: typeof HAMSTER): RigPart[] {
  const o = Object.values(r.outfits).flatMap((x) => [
    ...(x.back ?? []),
    ...(x.front ?? []),
    ...(x.top ?? []),
    ...(x.prop ? [x.prop] : []),
  ]);
  return [...Object.values(r.parts), ...Object.values(r.eyes), ...Object.values(r.mouths), ...o];
}

describe('риги зверей из деталей', () => {
  for (const { rig, sizes } of RIGS) {
    const dir = join(__dirname, 'species', rig.id);
    it(`${rig.id}: каждая деталь есть и как PNG, и в sizes.json`, () => {
      for (const p of allParts(rig)) {
        expect(existsSync(join(dir, `${p.src}.png`)), p.src).toBe(true);
        expect(sizes[p.src], p.src).toBeDefined();
      }
    });
    it(`${rig.id}: в sizes.json нет устаревших записей, у каждого PNG есть размер`, () => {
      const pngs = readdirSync(dir)
        .filter((f) => f.endsWith('.png'))
        .map((f) => f.slice(0, -4))
        .sort();
      expect(Object.keys(sizes).sort()).toEqual(pngs);
    });
    it(`${rig.id}: на каждое состояние есть глаза и рот`, () => {
      const states: (PetVisualState | 'purr' | 'giggle' | 'dizzy')[] = [
        'idle',
        'happy',
        'sleeping',
        'waving',
        'quiet',
        'thirsty',
        'tired',
        'adventure',
        'onBreak:lookFar',
        'onBreak:stretchUp',
        'onBreak:breathe',
        'purr',
        'giggle',
        'dizzy',
      ];
      for (const s of states) {
        const f = faceFor(s);
        expect(rig.eyes[f.eyes], s).toBeDefined();
        expect(rig.mouths[f.mouth], s).toBeDefined();
      }
    });
  }
});
