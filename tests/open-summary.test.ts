import { describe, expect, it, vi } from "vitest";
import { openInNewTab } from "../src/open-summary";

describe("saved summary navigation", () => {
  it("opens the saved file in a new active tab", async () => {
    const file = { path: "Journal/Tally — 2026.md" };
    const openFile = vi.fn(async () => undefined);
    const getTabLeaf = vi.fn(() => ({ openFile }));

    await openInNewTab(file, getTabLeaf);

    expect(getTabLeaf).toHaveBeenCalledOnce();
    expect(openFile).toHaveBeenCalledWith(file, { active: true });
  });
});
