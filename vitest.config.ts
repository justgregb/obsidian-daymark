import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      obsidian: new URL("./tests/obsidian-mock.ts", import.meta.url).pathname
    }
  },
  test: {
    benchmark: { include: ["benchmarks/**/*.bench.ts"] },
    coverage: { enabled: false },
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
