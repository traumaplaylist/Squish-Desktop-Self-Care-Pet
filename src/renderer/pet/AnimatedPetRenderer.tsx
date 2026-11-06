import type { ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type {
  AccessoryId,
  GrowthStage,
  MicroPetId,
  Palette,
  PetReaction,
  PetVisualState,
} from '../../core/types';
import type { PetRenderer } from './PetRenderer';
import { BREATH_TICK_MS, breathTransform } from './breath';

/** Общие свойства кадра для любого рендерера питомца. */
export interface PetViewProps {
  state: PetVisualState;
  stage: GrowthStage;
  palette: Palette;
  cozy: boolean;
  blinking: boolean;
  reaction: { name: PetReaction; key: number } | null;
  accessories: AccessoryId[];
}

/** Длительность реакций (мс) — одна на всех зверей. */
export const REACTION_MS: Partial<Record<PetReaction, number>> = {
  bounce: 650,
  celebrate: 1500,
  drink: 1400,
  coinCatch: 900,
  hug: 1600,
  straighten: 900,
  purr: 1800,
  giggle: 1100,
  dizzy: 1400,
};

/**
 * База для React-рендереров питомца: моргание (3–7 с), дыхание таймером 150 мс (без rAF, SPEC 7.5),
 * реакции с Promise, пауза, слежение глаз через CSS-переменные. Наследник рисует только кадр.
 */
export abstract class AnimatedPetRenderer implements PetRenderer {
  private readonly root: Root;
  protected props: PetViewProps = {
    state: 'idle',
    stage: 'baby',
    palette: 'mint',
    cozy: false,
    blinking: false,
    reaction: null,
    accessories: [],
  };
  private paused = false;
  private blinkTimer: number | null = null;
  private breathTimer: number | null = null;
  private readonly breathStart = performance.now();
  private reactionKey = 0;

  /** Насколько сдвигаются глаза при слежении за курсором (в единицах CSS px кадра). */
  protected abstract readonly eyeShift: number;
  protected abstract view(p: PetViewProps): ReactElement;

  constructor(protected readonly container: HTMLElement) {
    this.root = createRoot(container);
    // Отрисовка — после конструктора наследника (у него могут быть свои поля).
    queueMicrotask(() => {
      this.render();
      this.scheduleBlink();
      this.startBreath();
    });
  }

  setState(state: PetVisualState): void {
    if (state !== this.props.state) this.update({ state });
  }

  play(reaction: PetReaction): Promise<void> {
    if (this.paused) return Promise.resolve();
    if (reaction === 'blink') return this.blinkOnce();
    const ms = REACTION_MS[reaction];
    if (ms === undefined) return Promise.resolve();
    const key = ++this.reactionKey;
    this.update({ reaction: { name: reaction, key } });
    return new Promise((resolve) => {
      window.setTimeout(() => {
        if (this.props.reaction?.key === key) this.update({ reaction: null });
        resolve();
      }, ms);
    });
  }

  setAccessories(ids: AccessoryId[]): void {
    if (ids.join('|') !== this.props.accessories.join('|')) this.update({ accessories: [...ids] });
  }

  setStage(stage: GrowthStage): void {
    if (stage !== this.props.stage) this.update({ stage });
  }

  setMicroPets(_ids: MicroPetId[]): void {
    /* P1 (микро-питомцы, SPEC 4.8) — Неделя 2 */
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.container.classList.toggle('pet-paused', paused);
    if (paused) {
      this.clearBlink();
      this.stopBreath();
    } else {
      this.scheduleBlink();
      this.startBreath();
    }
  }

  setPalette(palette: Palette): void {
    if (palette !== this.props.palette) this.update({ palette });
  }

  setCozy(cozy: boolean): void {
    if (cozy !== this.props.cozy) this.update({ cozy });
  }

  lookAt(dir: { x: number; y: number } | null): void {
    // Без перерисовки React: только CSS-переменные.
    this.container.style.setProperty('--eye-x', `${(dir?.x ?? 0) * this.eyeShift}px`);
    this.container.style.setProperty('--eye-y', `${(dir?.y ?? 0) * this.eyeShift}px`);
  }

  destroy(): void {
    this.clearBlink();
    this.stopBreath();
    this.root.unmount();
  }

  protected update(patch: Partial<PetViewProps>): void {
    this.props = { ...this.props, ...patch };
    this.render();
  }

  private render(): void {
    this.root.render(this.view(this.props));
  }

  private startBreath(): void {
    this.stopBreath();
    this.breathTimer = window.setInterval(() => {
      const el = this.container.querySelector<HTMLElement>('.breath');
      if (!el) return;
      // Во время упражнения тело анимирует CSS (оверлей) — дыхание таймером не мешает.
      el.style.transform = this.props.state.startsWith('onBreak:')
        ? ''
        : breathTransform(this.props.state, performance.now() - this.breathStart);
    }, BREATH_TICK_MS);
  }

  private stopBreath(): void {
    if (this.breathTimer !== null) window.clearInterval(this.breathTimer);
    this.breathTimer = null;
  }

  /** Случайное моргание раз в 3–7 с (SPEC 7.2). */
  private scheduleBlink(): void {
    this.clearBlink();
    const delay = 3000 + Math.random() * 4000;
    this.blinkTimer = window.setTimeout(() => {
      void this.blinkOnce().then(() => {
        if (!this.paused) this.scheduleBlink();
      });
    }, delay);
  }

  private clearBlink(): void {
    if (this.blinkTimer !== null) window.clearTimeout(this.blinkTimer);
    this.blinkTimer = null;
  }

  private blinkOnce(): Promise<void> {
    const s = this.props.state;
    if (s === 'sleeping' || s === 'happy' || s === 'quiet' || s === 'tired')
      return Promise.resolve();
    this.update({ blinking: true });
    return new Promise((resolve) =>
      window.setTimeout(() => {
        this.update({ blinking: false });
        resolve();
      }, 140),
    );
  }
}
