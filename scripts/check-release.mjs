import { readFile, stat } from "node:fs/promises";
import { checkPublicCopy } from "./public-copy.mjs";

const runtimeFiles = ["manifest.json", "main.js", "styles.css"];
const MAX_RUNTIME_BYTES = 128 * 1024;

await checkPublicCopy();

const sizes = await Promise.all(runtimeFiles.map(async (path) => {
  const details = await stat(path);
  if (!details.isFile() || details.size === 0) {
    throw new Error(`Release asset is missing or empty: ${path}`);
  }
  return details.size;
}));
const runtimeBytes = sizes.reduce((total, size) => total + size, 0);
if (runtimeBytes > MAX_RUNTIME_BYTES) {
  throw new Error(`Release assets exceed the ${MAX_RUNTIME_BYTES}-byte size budget: ${runtimeBytes}`);
}

JSON.parse(await readFile("manifest.json", "utf8"));

const bundle = await readFile("main.js", "utf8");
const forbiddenBrowserCapability = ["clip", "board"].join("");
if (bundle.toLowerCase().includes(forbiddenBrowserCapability)) {
  throw new Error("Release bundle must not access the system copy buffer.");
}
