// Unit tests: the domain rules and queries, and helpers (no browser).
import path from 'node:path';

export default {
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: { include: ['src/**/*.test.ts'], passWithNoTests: true },
};
