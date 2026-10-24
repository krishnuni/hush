import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { voiceBridge } from './scripts/voice-bridge.ts';
import { offlineShell } from './scripts/offline-shell.ts';

export default defineConfig({
  base: process.env.HUSH_BASE_PATH ?? '/',
  plugins: [react(), voiceBridge(), offlineShell()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1100 },
  test: { environment: 'jsdom', include: ['src/**/*.test.ts'], setupFiles: ['src/test-setup.ts'] },
});
