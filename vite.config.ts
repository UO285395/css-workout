import { defineConfig } from 'vitest/config';

// Se compila a un único archivo IIFE que se puede cargar con <script> o desde un bookmarklet.
export default defineConfig({
  root: '.',
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'CssWorkout',
      formats: ['iife'],
      fileName: () => 'css-workout.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: { open: process.env.CI ? false : '/demo/index.html' },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.test.ts'],
  },
});
