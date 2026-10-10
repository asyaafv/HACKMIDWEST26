/** Financial integration tests use one real local PostgreSQL cluster with independent connections. */
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/**/*.test.ts"], fileParallelism: false, testTimeout: 30000, hookTimeout: 60000 } });
