import esbuild from "esbuild";
import process from "node:process";

const production = process.argv[2] === "production";

const context = await esbuild.context({
  banner: { js: "/* Daymark for Obsidian */" },
  bundle: true,
  entryPoints: ["src/main.ts"],
  external: ["obsidian"],
  format: "cjs",
  logLevel: "info",
  minify: production,
  outfile: "main.js",
  platform: "browser",
  sourcemap: production ? false : "inline",
  target: "es2018",
  treeShaking: true
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
