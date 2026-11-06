/**
 * Реестр зверей из деталей. Картинки подтягиваются Vite из species/<id>/*.png,
 * размеры — из species/<id>/sizes.json (их пишет scripts/pet-sizes.mjs).
 */
import type { SpeciesAssets } from '../LayeredRenderer';
import type { SpeciesRig } from '../rig';
import { HAMSTER } from './hamster/rig';
import hamsterSizes from './hamster/sizes.json';

const urls = import.meta.glob<string>('./*/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

export const RIGS: Record<string, SpeciesRig> = { hamster: HAMSTER };

const SIZES: Record<string, Record<string, [number, number]>> = {
  hamster: hamsterSizes as unknown as Record<string, [number, number]>,
};

export function assetsFor(id: string): SpeciesAssets {
  const out: SpeciesAssets = { urls: {}, sizes: {} };
  for (const [path, url] of Object.entries(urls)) {
    const m = /^\.\/([^/]+)\/([^/]+)\.png$/.exec(path);
    if (m && m[1] === id) out.urls[`${id}/${m[2]}`] = url;
  }
  for (const [name, size] of Object.entries(SIZES[id] ?? {})) out.sizes[`${id}/${name}`] = size;
  return out;
}
