import { describe, expect, it } from "vitest";
import { formatTagLabel } from "../src/format";

describe("tag labels", () => {
  it("renders tags as natural-language sidebar labels", () => {
    expect(formatTagLabel("greek", "en-US")).toBe("Greek");
    expect(formatTagLabel("morning_run", "en-US")).toBe("Morning run");
    expect(formatTagLabel("exercise/running", "en-US")).toBe("Exercise running");
    expect(formatTagLabel("ελληνικά", "el-GR")).toBe("Ελληνικά");
  });
});
