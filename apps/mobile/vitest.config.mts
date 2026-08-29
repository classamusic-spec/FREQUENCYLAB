import { defineConfig } from 'vitest/config';

/**
 * Tests for the app's own logic — the parts that are plain TypeScript and have
 * nothing to do with React Native.
 *
 * Deliberately narrow. Rendering a React Native tree in Node needs a preset,
 * a transformer and a pile of mocks, and the screens are already checked by
 * driving the real web build in a browser, which catches things a renderer
 * cannot (a button that paints under its own background, for one). What a unit
 * test is genuinely better at is the storage and scheduling logic underneath,
 * where the failure is a wrong value rather than a wrong pixel.
 *
 * `@react-native-async-storage/async-storage` is aliased to an in-memory
 * double, because the thing under test is what this app writes and reads back,
 * not what the native module does with it.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    alias: {
      '@react-native-async-storage/async-storage': new URL(
        './src/storage/__mocks__/asyncStorage.ts',
        import.meta.url,
      ).pathname,
    },
  },
});
