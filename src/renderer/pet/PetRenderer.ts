import type {
  AccessoryId,
  GrowthStage,
  MicroPetId,
  Palette,
  PetReaction,
  PetVisualState,
} from '../../core/types';

/**
 * Единственный способ рисовать питомца (SPEC 7.1). Остальной UI не знает, SVG это, спрайты или 3D.
 * Расширения к SPEC: setPalette, setCozy (R0: «Тяжёлый день» — модификатор), lookAt (слежение глаз), destroy.
 */
export interface PetRenderer {
  setState(state: PetVisualState): void;
  play(reaction: PetReaction): Promise<void>;
  setAccessories(ids: AccessoryId[]): void;
  setStage(stage: GrowthStage): void;
  setMicroPets(ids: MicroPetId[]): void;
  setPaused(paused: boolean): void;
  setPalette(palette: Palette): void;
  setCozy(cozy: boolean): void;
  /** Направление взгляда в [-1, 1] или null — смотреть прямо. */
  lookAt(dir: { x: number; y: number } | null): void;
  destroy(): void;
}

export type PetRendererKind = 'svgBlob';
