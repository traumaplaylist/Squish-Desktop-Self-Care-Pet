import { useEffect, useRef, type RefObject } from 'react';
import type { Snapshot } from '../../core/types';
import { createPetRenderer } from './createPetRenderer';
import type { PetRenderer } from './PetRenderer';

/** Применить к питомцу всё из снапшота (кроме визуального состояния — его решает окно). */
export function applyLook(pet: PetRenderer, s: Snapshot): void {
  pet.setPalette(s.pet.palette);
  pet.setStage(s.pet.stage);
  pet.setCozy(s.pet.cozy);
  pet.setAccessories(s.pet.accessories);
}

/**
 * Рендерер питомца в host для вида `species`. Сменился вид (Debug, онбординг) — пересоздаём.
 * onReady вызывается с новым рендерером: применить снапшот, подписаться на реакции и т. п.
 */
export function usePetRenderer(
  hostRef: RefObject<HTMLDivElement | null>,
  species: string | null,
  onReady?: (pet: PetRenderer) => (() => void) | void,
): RefObject<PetRenderer | null> {
  const petRef = useRef<PetRenderer | null>(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !species) return;
    const pet = createPetRenderer(species, host);
    petRef.current = pet;
    const off = readyRef.current?.(pet);
    return () => {
      off?.();
      pet.destroy();
      if (petRef.current === pet) petRef.current = null;
    };
  }, [hostRef, species]);
  return petRef;
}
