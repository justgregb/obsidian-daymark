import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rootPath = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicCopyScript = resolve(rootPath, "scripts/public-copy.mjs");

function runPublicCopy(command: "check" | "show"): string {
  return execFileSync(process.execPath, [publicCopyScript, command], {
    cwd: rootPath,
    encoding: "utf8",
  });
}

describe("public copy", () => {
  it("keeps release surfaces synchronized with the canonical copy", () => {
    expect(() => runPublicCopy("check")).not.toThrow();
  });

  it("prints the remote descriptions for copy and paste", () => {
    const output = runPublicCopy("show");

    expect(output).toContain("GitHub About");
    expect(output).toContain("Community short description");
    expect(output).toContain("Community long description");
    expect(output).toContain("week, month, and year views");
    expect(output).toContain("Quick Log");
    expect(output).toContain("Tally");
  });
});
