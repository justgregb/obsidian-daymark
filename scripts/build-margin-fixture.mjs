import { build } from "esbuild";

await build({
  entryPoints: ["tests/visual/margin-entry.ts"],
  outfile: "tests/visual/margin-fixture.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  alias: { obsidian: "./tests/visual/margin-obsidian.ts" }
});
