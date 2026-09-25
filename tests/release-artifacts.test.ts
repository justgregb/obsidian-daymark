import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import process from "node:process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
let directory: string;

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "daymark-release-"));
  for (const file of ["manifest.json", "package.json", "package-lock.json", "versions.json"]) {
    writeFileSync(resolve(directory, file), readFileSync(resolve(root, file)));
  }
  writeFileSync(resolve(directory, "main.js"), "/* Daymark release fixture */");
  writeFileSync(resolve(directory, "styles.css"), ".daymark-fixture { display: block; }");
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

function edit(file: string, change: (data: Record<string, unknown>) => void): void {
  const path = resolve(directory, file);
  const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  change(data);
  writeFileSync(path, JSON.stringify(data));
}

function check(): void {
  execFileSync(process.execPath, [resolve(root, "scripts/check-release.mjs")], {
    cwd: directory, encoding: "utf8", stdio: "pipe"
  });
}

describe("release artifact checks", () => {
  it("accepts matching release metadata", () => expect(check).not.toThrow());

  it.each(["package.json", "package-lock.json"])("rejects an outdated %s", file => {
    edit(file, data => { data.version = "0.0.0"; });
    expect(check).toThrow("Manifest, package, and lockfile versions must match");
  });

  it("rejects an outdated lockfile root package", () => {
    edit("package-lock.json", data => {
      (data.packages as Record<string, { version: string }>)[""].version = "0.0.0";
    });
    expect(check).toThrow("Manifest, package, and lockfile versions must match");
  });

  it("rejects a missing compatibility mapping", () => {
    writeFileSync(resolve(directory, "versions.json"), "{}");
    expect(check).toThrow("versions.json must map this release");
  });

  it("rejects a release that drops mobile support", () => {
    edit("manifest.json", data => { data.isDesktopOnly = true; });
    expect(check).toThrow("mobile support");
  });

  it("rejects an accidental plugin id change", () => {
    edit("manifest.json", data => { data.id = "another-plugin"; });
    expect(check).toThrow("plugin id");
  });

  it("rejects an unreleased version label", () => {
    edit("manifest.json", data => { data.version = "0.3.0-dev"; });
    expect(check).toThrow("Release version must be major.minor.patch");
  });
});
