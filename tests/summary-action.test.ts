import { describe, expect, it } from "vitest";
import { summaryActionPresentation } from "../src/summary-action";

describe("Tally title action", () => {
  it("keeps empty periods visibly unavailable", () => {
    expect(summaryActionPresentation(0)).toMatchObject({ intent: "none", label: "Save", disabled: true });
  });

  it("saves new and changed reports", () => {
    expect(summaryActionPresentation(2, "save")).toMatchObject({ intent: "save", label: "Save", disabled: false });
    expect(summaryActionPresentation(2, "update").ariaLabel).toContain("changes");
  });

  it("opens a current report", () => {
    expect(summaryActionPresentation(2, "saved")).toMatchObject({ intent: "open", label: "Report", disabled: false });
  });
});
