import type { SquishApi } from '../core/ipc';

declare global {
  interface Window {
    squish: SquishApi;
  }
}

export {};
