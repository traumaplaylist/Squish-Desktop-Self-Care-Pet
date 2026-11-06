/**
 * Риг «зверя из деталей» (LayeredRenderer). Все координаты — в пикселях системы тела:
 * тело лежит в (0, 0) с шириной `body.w`; остальные детали — x, y (левый верх) и ширина w.
 * Высота детали берётся из пропорций её картинки, если не задана `h` (тогда деталь сплющивается).
 */
import type { PetVisualState } from '../../core/types';

export interface RigPart {
  /** Имя файла детали без .png. */
  src: string;
  x: number;
  y: number;
  w: number;
  /** Высота, если деталь нужно сплющить/вытянуть (поля шляпы, плащ). */
  h?: number;
}

export type EyesKind = 'open' | 'closed' | 'happy' | 'sleepy';
export type MouthKind = 'smile' | 'open' | 'o' | 'flat';

export interface OutfitRig {
  /** За телом (задняя часть плаща, рюкзак). */
  back?: RigPart[];
  /** Поверх тела, под лапками (передняя часть одежды). */
  front?: RigPart[];
  /** Поверх всего (шляпа). */
  top?: RigPart[];
  /** Предмет в правой лапке — двигается вместе с ней. */
  prop?: RigPart;
}

export interface SpeciesRig {
  id: string;
  /** Размер тела в системе координат рига (ширина, высота). */
  body: { w: number; h: number };
  parts: {
    shadow: RigPart;
    feet: RigPart;
    body: RigPart;
    armL: RigPart;
    armR: RigPart;
    blush: RigPart;
  };
  /** Точка вращения лапок (плечо), в системе тела. */
  shoulders: { l: { x: number; y: number }; r: { x: number; y: number } };
  eyes: Record<EyesKind, RigPart>;
  mouths: Record<MouthKind, RigPart>;
  /** Центр лица — для пустого стакана, капли пота и т. п. */
  anchors: {
    glass: { x: number; y: number };
    sweat: { x: number; y: number };
    neck: { x: number; y: number };
  };
  outfits: Record<string, OutfitRig>;
}

/** Выражение лица по визуальному состоянию (общее для всех зверей). */
export function faceFor(state: PetVisualState | 'purr' | 'giggle' | 'dizzy'): {
  eyes: EyesKind;
  mouth: MouthKind;
} {
  switch (state) {
    case 'happy':
    case 'purr':
      return { eyes: 'happy', mouth: 'open' };
    case 'giggle':
      return { eyes: 'happy', mouth: 'open' };
    case 'sleeping':
      return { eyes: 'closed', mouth: 'smile' };
    case 'onBreak:breathe':
      return { eyes: 'closed', mouth: 'smile' };
    case 'quiet':
    case 'tired':
    case 'dizzy':
      return { eyes: 'sleepy', mouth: 'flat' };
    case 'thirsty':
      return { eyes: 'open', mouth: 'o' };
    default:
      return { eyes: 'open', mouth: 'smile' };
  }
}
