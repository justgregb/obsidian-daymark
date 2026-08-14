import { readFile, writeFile } from "node:fs/promises";

const sources = [
  "styles/calendar.css",
  "styles/modals.css",
  "styles/settings.css",
  "styles/responsive.css"
];
const sections = await Promise.all(sources.map(async (path) => (await readFile(path, "utf8")).trimEnd()));
const banner = "/* Generated from styles/*.css by npm run build:styles. */";
await writeFile("styles.css", `${banner}\n${sections.join("\n\n")}\n`);
