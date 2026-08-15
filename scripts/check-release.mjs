import { readFile, stat } from "node:fs/promises";

const runtimeFiles = ["manifest.json", "main.js", "styles.css"];

await Promise.all(runtimeFiles.map(async (path) => {
  const details = await stat(path);
  if (!details.isFile() || details.size === 0) {
    throw new Error(`Release asset is missing or empty: ${path}`);
  }
}));

JSON.parse(await readFile("manifest.json", "utf8"));
