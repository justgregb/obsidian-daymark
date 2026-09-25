import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// Targeted compatibility guard for the CSS warnings caught by Obsidian review.
// Keep basic text decoration available; use borders for styled underlines.
const rules = [
  [/:has\s*\(/g, "Use explicit state instead of :has selectors"],
  [/\bdisplay\s*:\s*contents\b/g, "Use a layout box instead of display: contents"],
  [/\b(?:text-decoration-(?:style|color|thickness)|text-underline-offset)\s*:/g, "Use borders for styled underlines"],
  [/\btext-decoration\s*:(?!\s*(?:none|underline|overline|line-through)\s*[;}])[^;{}]+/g, "Use borders for styled underlines"]
];

export async function checkStyles(files = ["styles.css"]) {
  const errors = [];
  for (const file of files) {
    const css = (await readFile(file, "utf8")).replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, " "));
    for (const [pattern, message] of rules) {
      for (const match of css.matchAll(pattern)) {
        errors.push(`${file}:${css.slice(0, match.index).split("\n").length}: ${message}`);
      }
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sources = (await readdir("styles")).filter(file => file.endsWith(".css")).map(file => `styles/${file}`);
  await checkStyles([...sources, "styles.css"]);
}
