import type { PetRenderer, PetRendererKind } from './PetRenderer';
import { SvgBlobRenderer } from './SvgBlobRenderer';

/** Подмена рендерера — только здесь (SPEC 7.1, 7.3). */
export function createPetRenderer(kind: PetRendererKind, container: HTMLElement): PetRenderer {
  switch (kind) {
    case 'svgBlob':
      return new SvgBlobRenderer(container);
  }
}
