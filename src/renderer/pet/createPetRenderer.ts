import { LayeredRenderer } from './LayeredRenderer';
import type { PetRenderer } from './PetRenderer';
import { assetsFor, RIGS } from './species';
import { SvgBlobRenderer } from './SvgBlobRenderer';

/**
 * Подмена рендерера — только здесь (SPEC 7.1, 7.3). kind — вид питомца:
 * 'blob' (SVG-блоб «Сквиш») или id зверя из деталей ('hamster', …).
 */
export function createPetRenderer(kind: string, container: HTMLElement): PetRenderer {
  const rig = RIGS[kind];
  if (rig) return new LayeredRenderer(container, rig, assetsFor(kind));
  return new SvgBlobRenderer(container);
}
