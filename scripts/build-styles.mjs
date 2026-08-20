import { readFile, writeFile } from "node:fs/promises";
import { transform } from "esbuild";

const sources = [
  "styles/calendar.css",
  "styles/modals.css",
  "styles/settings.css",
  "styles/responsive.css"
];
const sections = await Promise.all(sources.map(async (path) => (await readFile(path, "utf8")).trimEnd()));
const banner = "/* Generated from styles/*.css by npm run build:styles. */";
const { code } = await transform(sections.join("\n\n"), { loader: "css", minify: true, target: "chrome112" });
await writeFile("styles.css", `${banner}\n${code.trimEnd()}\n`);
