import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import process from "node:process";

const scriptPath = fileURLToPath(import.meta.url);
const rootPath = resolve(dirname(scriptPath), "..");
const copyPath = resolve(rootPath, "public-copy.json");
const manifestPath = resolve(rootPath, "manifest.json");
const packagePath = resolve(rootPath, "package.json");
const readmePath = resolve(rootPath, "README.md");

const MAX_SHORT_DESCRIPTION_LENGTH = 200;
const MAX_GITHUB_DESCRIPTION_LENGTH = 350;
const MAX_COMMUNITY_LONG_DESCRIPTION_LENGTH = 1000;

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readPublicCopy() {
  const copy = await readJson(copyPath);
  validatePublicCopy(copy);
  return copy;
}

function requireText(value, label) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new Error(`${label} must be a non-empty string without surrounding whitespace.`);
  }
  return value;
}

function requireParagraphs(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must contain at least one paragraph.`);
  }
  return value.map((paragraph, index) => requireText(paragraph, `${label}[${index}]`));
}

function requirePrintableAscii(value, label) {
  if (!/^[\x20-\x7E]+$/.test(value)) {
    throw new Error(`${label} must use printable ASCII characters only.`);
  }
}

function requireMaximumLength(value, maximum, label) {
  if (value.length > maximum) {
    throw new Error(`${label} is ${value.length} characters; the limit is ${maximum}.`);
  }
}

function validatePublicCopy(copy) {
  if (copy === null || typeof copy !== "object" || Array.isArray(copy)) {
    throw new Error("public-copy.json must contain an object.");
  }

  const shortDescription = requireText(copy.shortDescription, "shortDescription");
  const githubDescription = requireText(copy.githubDescription, "githubDescription");
  const communityLongDescription = requireParagraphs(
    copy.communityLongDescription,
    "communityLongDescription",
  );
  const readmeIntroduction = requireParagraphs(copy.readmeIntroduction, "readmeIntroduction");
  const communityLongText = communityLongDescription.join("\n\n");

  requireMaximumLength(shortDescription, MAX_SHORT_DESCRIPTION_LENGTH, "shortDescription");
  requireMaximumLength(githubDescription, MAX_GITHUB_DESCRIPTION_LENGTH, "githubDescription");
  requireMaximumLength(
    communityLongText,
    MAX_COMMUNITY_LONG_DESCRIPTION_LENGTH,
    "communityLongDescription",
  );

  if (!shortDescription.endsWith(".")) {
    throw new Error("shortDescription must end with a period.");
  }
  if (/^this is (an? )?plugin\b/i.test(shortDescription)) {
    throw new Error("shortDescription must describe Daymark directly, without saying that it is a plugin.");
  }

  requirePrintableAscii(shortDescription, "shortDescription");
  requirePrintableAscii(githubDescription, "githubDescription");
  communityLongDescription.forEach((paragraph, index) => {
    requirePrintableAscii(paragraph, `communityLongDescription[${index}]`);
  });
  readmeIntroduction.forEach((paragraph, index) => {
    requirePrintableAscii(paragraph, `readmeIntroduction[${index}]`);
  });
}

function expectedReadmeIntroduction(copy) {
  return copy.readmeIntroduction.join("\n\n");
}

function replaceReadmeIntroduction(readme, copy) {
  const heading = "# Daymark\n\n";
  const imageMarker = "\n\n![";
  if (!readme.startsWith(heading)) {
    throw new Error("README.md must begin with the Daymark heading.");
  }
  const end = readme.indexOf(imageMarker, heading.length);
  if (end === -1) {
    throw new Error("README.md must place its first image after the introduction.");
  }
  return `${heading}${expectedReadmeIntroduction(copy)}${readme.slice(end)}`;
}

export async function checkPublicCopy() {
  const copy = await readPublicCopy();
  const [manifest, packageJson, readme] = await Promise.all([
    readJson(manifestPath),
    readJson(packagePath),
    readFile(readmePath, "utf8"),
  ]);
  const drift = [];

  if (manifest.description !== copy.shortDescription) {
    drift.push("manifest.json description");
  }
  if (packageJson.description !== copy.shortDescription) {
    drift.push("package.json description");
  }
  if (replaceReadmeIntroduction(readme, copy) !== readme) {
    drift.push("README.md introduction");
  }

  if (drift.length > 0) {
    throw new Error(`Public copy is out of sync: ${drift.join(", ")}. Run npm run copy:sync.`);
  }
}

export async function syncPublicCopy() {
  const copy = await readPublicCopy();
  const [manifest, packageJson, readme] = await Promise.all([
    readJson(manifestPath),
    readJson(packagePath),
    readFile(readmePath, "utf8"),
  ]);

  manifest.description = copy.shortDescription;
  packageJson.description = copy.shortDescription;

  await Promise.all([
    writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`),
    writeFile(readmePath, replaceReadmeIntroduction(readme, copy)),
  ]);
}

export async function showPublicCopy() {
  const copy = await readPublicCopy();
  const sections = [
    ["GitHub About", copy.githubDescription],
    ["Community short description", copy.shortDescription],
    ["Community long description", copy.communityLongDescription.join("\n\n")],
    ["README introduction", expectedReadmeIntroduction(copy)],
  ];

  for (const [label, value] of sections) {
    process.stdout.write(`${label} (${value.length} characters)\n${value}\n\n`);
  }
}

async function main() {
  const command = process.argv[2] ?? "check";
  if (command === "check") {
    await checkPublicCopy();
    return;
  }
  if (command === "sync") {
    await syncPublicCopy();
    await checkPublicCopy();
    return;
  }
  if (command === "show") {
    await showPublicCopy();
    return;
  }
  throw new Error(`Unknown public-copy command: ${command}`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === scriptPath) {
  await main();
}
