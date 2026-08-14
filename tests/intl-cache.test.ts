import { describe, expect, it } from "vitest";
import { dateTimeFormatter, numberFormatter, wordSegmenter } from "../src/intl-cache";

describe("internationalisation caches", () => {
  it("reuses equivalent date and number formatters", () => {
    expect(dateTimeFormatter("en-US", { month: "short", timeZone: "UTC" })).toBe(
      dateTimeFormatter("en-US", { timeZone: "UTC", month: "short" })
    );
    expect(numberFormatter("en-US", { maximumFractionDigits: 3 })).toBe(
      numberFormatter("en-US", { maximumFractionDigits: 3 })
    );
  });

  it("reuses word segmenters when the runtime supports them", () => {
    const first = wordSegmenter("en-US");
    const second = wordSegmenter("en-US");
    expect(second).toBe(first);
  });
});
