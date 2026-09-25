import { readFile, stat } from "node:fs/promises";
import { checkPublicCopy } from "./public-copy.mjs";
import { checkStyles } from "./check-styles.mjs";

const runtimeFiles = ["manifest.json", "main.js", "styles.css"];
// Includes continuous recurring grain and shared stack/day styling; no runtime dependencies.
const MAX_RUNTIME_BYTES = 192 * 1024;

await checkPublicCopy();
await checkStyles();

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

const [manifest, packageJson, lock, versions] = await Promise.all(
  ["manifest.json", "package.json", "package-lock.json", "versions.json"]
    .map(async path => JSON.parse(await readFile(path, "utf8")))
);
const version = manifest.version;
if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error("Release version must be major.minor.patch.");
}
if (packageJson.version !== version || lock.version !== version || lock.packages?.[""]?.version !== version) {
  throw new Error("Manifest, package, and lockfile versions must match.");
}
if (versions[version] !== manifest.minAppVersion) {
  throw new Error("versions.json must map this release to its minimum Obsidian version.");
}
if (manifest.id !== "daymark" || manifest.isDesktopOnly !== false) {
  throw new Error("Release must preserve the Daymark plugin id and mobile support.");
}

const bundle = await readFile("main.js", "utf8");
const forbiddenBrowserCapability = ["clip", "board"].join("");
if (bundle.toLowerCase().includes(forbiddenBrowserCapability)) {
  throw new Error("Release bundle must not access the system copy buffer.");
}
if (bundle.includes("getResourcePath")) {
  throw new Error("Release bundle must not assign original vault resource URLs to calendar covers.");
}
