import { describe, expect, it, vi } from "vitest";
import type { App, PluginManifest } from "obsidian";
import DaymarkPlugin from "../src/main";
import { normalizeDayNames, splitDayName, withDayName } from "../src/day-names";
import { migrateStoredSettings } from "../src/settings-migration";
import { DEFAULT_SETTINGS } from "../src/types";

vi.mock("obsidian", async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  Plugin: class {}, PluginSettingTab: class {}, ItemView: class {}, Modal: class {},
  Platform: { isMobile: false }
}));

function pluginFixture() {
  const plugin = new DaymarkPlugin({} as App, {} as PluginManifest);
  plugin.settings = { ...DEFAULT_SETTINGS, dayNames: {}, tallyTagLabels: { swimming: "Swim sessions" } };
  const save = vi.fn((_settings: unknown) => Promise.resolve());
  plugin.saveData = save;
  return { plugin, save };
}

describe("leading day-name emoji", () => {
  it.each(["📖", "🎬", "🎮", "👋🏽", "👩🏽‍🚀", "👨‍👩‍👧‍👦", "🇨🇾", "1️⃣", "#️⃣", "❤️", "🏳️‍🌈", "🏴‍☠️", "🫱🏽‍🫲🏻", "🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}"])("keeps %s intact and moves only the first emoji", emoji => {
    expect(splitDayName(`${emoji}  A day`)).toEqual({ emoji, text: "A day" });
    expect(splitDayName(`${emoji}🎬 Movie`)).toEqual({ emoji, text: "🎬 Movie" });
    expect(splitDayName(emoji)).toEqual({ emoji, text: "" });
  });
  it.each(["", "Finished 📖 Dune", "A day", "1 book", "#reading", "* Important", "© Copyright", "™ Brand", "☀\uFE0E Morning", "🏽", "🇨", "👩‍"])("leaves ordinary text and incomplete emoji unchanged: %s", text => {
    expect(splitDayName(text)).toEqual({ emoji: "", text });
  });
});

describe("day-name settings", () => {
  it("notifies only the renamed date and only after its settings save succeeds", async () => {
    const { plugin, save } = pluginFixture();
    const listener = vi.fn();
    plugin.subscribe(listener);
    await plugin.setDayName("2026-09-21", "A quiet day");
    expect(listener).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ full: false, dailyDates: ["2026-09-21"] }));
    listener.mockClear();
    save.mockRejectedValueOnce(new Error("disk full"));
    await expect(plugin.setDayName("2026-09-22", "Unsaved")).rejects.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });
  it("accepts real dates and Unicode labels, discarding malformed stored data", () => {
    expect(normalizeDayNames({
      "2026-09-20": "  Тихое   утро ", "2026-02-29": "invalid", "2028-02-29": "Leap day",
      "2026-09-21": 5, "2026-09-22": " ", constructor: "unsafe", "2026-09-23": "<b>literal</b>"
    })).toEqual({ "2026-09-20": "Тихое утро", "2028-02-29": "Leap day", "2026-09-23": "<b>literal</b>" });
    for (const invalid of [null, [], true, "Name"]) expect(normalizeDayNames(invalid)).toEqual({});
  });
  it("keys names across years and clears only the chosen day", () => {
    const names = { "2026-09-20": "One", "2027-09-20": "Two" };
    expect(withDayName(names, "2026-09-20", "")).toEqual({ "2027-09-20": "Two" });
    expect(names["2026-09-20"]).toBe("One");
    expect(() => withDayName(names, "2026-02-30", "Bad")).toThrow();
  });
  it("migrates existing settings without replacing personal preferences or inventing names", () => {
    const before = { ...DEFAULT_SETTINGS, settingsVersion: 4, journalFolder: "Diary", marginTag: "swimming", tallyTagLabels: { swimming: "Swim sessions" } };
    const result = migrateStoredSettings(before);
    expect(result.settings).toEqual({ ...before, settingsVersion: 5 });
    expect(migrateStoredSettings(result.settings).changed).toBe(false);
  });
  it("serializes rapid name and preference saves without losing either", async () => {
    const { plugin, save } = pluginFixture();
    await Promise.all([
      plugin.setDayName("2026-09-20", "First"),
      plugin.setDayName("2026-09-21", "Second"),
      plugin.updateSettings({ showCoverPhotos: false }),
      plugin.setDayName("2026-09-20", "Revised")
    ]);
    expect(save).toHaveBeenCalledTimes(4);
    const persisted = JSON.parse(JSON.stringify(save.mock.calls.at(-1)?.[0])) as unknown;
    expect(migrateStoredSettings(persisted).settings).toMatchObject({
      dayNames: { "2026-09-20": "Revised", "2026-09-21": "Second" }, showCoverPhotos: false,
      tallyTagLabels: { swimming: "Swim sessions" }
    });
  });
  it("does not claim a failed save succeeded and allows the next save", async () => {
    const { plugin, save } = pluginFixture();
    save.mockRejectedValueOnce(new Error("disk full"));
    await expect(plugin.setDayName("2026-09-20", "Lost")).rejects.toThrow("disk full");
    expect(plugin.settings.dayNames).toEqual({});
    await plugin.setDayName("2026-09-20", "Retry");
    expect(plugin.settings.dayNames).toEqual({ "2026-09-20": "Retry" });
    await plugin.setDayName("2026-09-20", "");
    expect(plugin.settings.dayNames).toEqual({});
  });
});
