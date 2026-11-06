import type { PetRenderer } from './PetRenderer';
import { SvgHamsterRenderer } from './species/hamster/HamsterSvg';
import { SvgBlobRenderer } from './SvgBlobRenderer';

/**
 * Подмена рендерера — только здесь (SPEC 7.1, 7.3). kind — вид питомца:
 * 'blob' (SVG-блоб «Сквиш») или векторный зверь ('hamster', …).
 */
export function createPetRenderer(kind: string, container: HTMLElement): PetRenderer {
  if (kind === 'hamster') return new SvgHamsterRenderer(container);
  return new SvgBlobRenderer(container);
}
