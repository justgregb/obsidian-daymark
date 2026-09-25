import { describe, expect, it } from "vitest";
import { parseDailyNote } from "../src/parser";

describe("Indexed data used by current views", () => {
  it("retains words, photos, ordinary checked items and tagged values without obsolete excerpt data", () => {
    const record = parseDailyNote("Journal/2026-09-20.md", "2026-09-20", { year: 2026, month: 9, day: 20 },
      "A calm morning.\n![[photo.jpg]]\n- [ ] Call home\n- [x] Finished\n- [x] 3 #swimming", "en");
    expect(record).toMatchObject({ words: 3, photos: 1, totalCheckboxes: 2, completedCheckboxes: 1,
      taggedValues: [{ tag: "swimming", value: 3 }] });
    expect(record).not.toHaveProperty("excerpt");
    expect(record).not.toHaveProperty("uncheckedItems");
  });
});
