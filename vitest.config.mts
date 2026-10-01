import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Même alias que tsconfig.json ("@/*" -> racine du projet).
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/api/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    // Les tests d'intégration partagent une seule base (émulateur Firestore) :
    // on exécute donc les fichiers l'un après l'autre.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
