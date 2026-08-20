import { describe, expect, it } from "vitest";
import {
  escapeMarkdownLabel,
  formatTagLabel,
  normalizeTallyLabel,
  normalizeTallyMetricLabels,
  normalizeTallyTagLabels,
  resolveTagLabel,
  resolveTallyMetricLabel,
  serializeTallyMetricLabels,
  serializeTallyTagLabels,
  sortByResolvedTagLabel
} from "../src/format";

describe("tag labels", () => {
  it("renders tags as natural-language sidebar labels", () => {
    expect(formatTagLabel("greek", "en-US")).toBe("Greek");
    expect(formatTagLabel("morning_run", "en-US")).toBe("Morning run");
    expect(formatTagLabel("exercise/running", "en-US")).toBe("Exercise running");
    expect(formatTagLabel("ελληνικά", "el-GR")).toBe("Ελληνικά");
  });

  it("uses configured labels without changing automatic fallbacks", () => {
    const labels = normalizeTallyTagLabels({ Running: "  Kilometres   run  " });
    expect(labels).toEqual({ running: "Kilometres run" });
    expect(resolveTagLabel("RUNNING", labels, "en-US")).toBe("Kilometres run");
    expect(resolveTagLabel("morning_run", labels, "en-US")).toBe("Morning run");
  });

  it("normalizes, resolves, and stably serializes core metric labels", () => {
    const labels = normalizeTallyMetricLabels({
      dailyNotes: "  Journal   days ",
      words: "",
      photos: "Images",
      checkedItems: "Done"
    });
    expect(labels).toEqual({ dailyNotes: "Journal days", photos: "Images" });
    expect(resolveTallyMetricLabel("dailyNotes", labels)).toBe("Journal days");
    expect(resolveTallyMetricLabel("words", labels)).toBe("Words");
    expect(serializeTallyMetricLabels({ photos: "Images", dailyNotes: "Journal days" }))
      .toBe(serializeTallyMetricLabels({ dailyNotes: "Journal days", photos: "Images" }));
  });

  it("removes blank and invalid aliases and limits labels to 80 characters", () => {
    expect(normalizeTallyTagLabels({ running: "  ", "bad tag": "Bad", pushups: 10 })).toEqual({});
    expect(normalizeTallyLabel(`  ${"a".repeat(90)}  `)).toHaveLength(80);
  });

  it("sorts by resolved label while keeping identical labels distinct", () => {
    const tags = [{ tag: "pushups" }, { tag: "running" }, { tag: "cycling" }];
    const sorted = sortByResolvedTagLabel(tags, {
      pushups: "Strength",
      running: "Distance",
      cycling: "Distance"
    }, "en-US");
    expect(sorted.map((tag) => tag.tag)).toEqual(["cycling", "running", "pushups"]);
    expect(sorted).toHaveLength(3);
    expect(serializeTallyTagLabels({ running: "Run", pushups: "Push-ups" }))
      .toBe(serializeTallyTagLabels({ pushups: "Push-ups", running: "Run" }));
  });

  it("escapes formatting characters before labels enter Markdown reports", () => {
    expect(escapeMarkdownLabel("Run *far* | fast [now]")).toBe("Run \\*far\\* \\| fast \\[now\\]");
  });
});
