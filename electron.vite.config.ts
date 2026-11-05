import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    build: {
      // koffi грузит нативный бинарник из @koromix/koffi-<platform>; бандлить его нельзя.
      externalizeDeps: true,
      rollupOptions: { external: ['koffi'] },
    },
  },
  preload: {
    build: { externalizeDeps: true },
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          widget: resolve(__dirname, 'src/renderer/widget/index.html'),
          debug: resolve(__dirname, 'src/renderer/debug/index.html'),
          overlay: resolve(__dirname, 'src/renderer/overlay/index.html'),
          tasks: resolve(__dirname, 'src/renderer/tasks/index.html'),
        },
      },
    },
  },
});
