import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const fixture = readFileSync(new URL("visual/daymark-sidebar.html", import.meta.url), "utf8");
const calendarViewSource = readFileSync(new URL("../src/calendar-view.ts", import.meta.url), "utf8");
const calendarStyles = readFileSync(new URL("../styles/calendar.css", import.meta.url), "utf8");
const responsiveStyles = readFileSync(new URL("../styles/responsive.css", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../src/settings.ts", import.meta.url), "utf8");
const settingsStyles = readFileSync(new URL("../styles/settings.css", import.meta.url), "utf8");

describe("responsive visual fixture matrix", () => {
  it("includes narrow, compact, and normal sidebar widths", () => {
    expect(fixture).toContain("const widths = [285, 320, 420]");
    expect(fixture).toContain("fixture.dataset.width");
  });

  it("includes light and dark themes", () => {
    expect(fixture).toContain('const themes = ["light", "dark"]');
    expect(fixture).toContain("fixture.dataset.theme");
  });

  it.each(["collapsed", "expanded", "long-title", "empty"])("includes the %s state", (state) => {
    expect(fixture).toContain(state);
  });

  it("loads the same generated stylesheet that ships with the plugin", () => {
    expect(fixture).toContain('href="../../styles.css"');
  });

  it("keeps all calendar periods inside one stable responsive stage", () => {
    expect(calendarStyles).toContain(".daymark-calendar-body::before");
    expect(calendarStyles).toContain("min-height: 312px;");
    expect(calendarStyles).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(calendarStyles).toContain("max-width: 420px;");
    expect(calendarStyles).not.toContain("width: min(100%, 420px);");
    expect(calendarStyles).toContain("grid-area: 1 / 1;");
  });

  it("keeps the Year grid compact instead of distributing its rows through the leaf", () => {
    expect(calendarStyles).toContain("align-content: start;");
    expect(calendarStyles).not.toContain("align-content: space-between;");
    expect(calendarStyles).not.toContain("@container daymark-calendar-body");
  });

  it("names the selected day without changing the compact Year grid", () => {
    expect(calendarStyles).toMatch(
      /\.daymark-year-month-title \{[^}]*display: flex;[^}]*justify-content: space-between;/s
    );
    expect(calendarStyles).toContain(".daymark-year-selected-day");
    expect(calendarStyles).toMatch(
      /\.daymark-year-selected-day \{[^}]*font-variant-numeric: tabular-nums;[^}]*letter-spacing: 0;/s
    );
  });

  it("does not advertise or intercept internal calendar navigation keys", () => {
    expect(calendarViewSource).not.toContain("aria-keyshortcuts");
    expect(calendarViewSource).not.toContain('addEventListener("keydown"');
    expect(calendarViewSource).not.toContain("installRovingNavigation");
  });

  it("keeps read-only Tally totals visually inert", () => {
    expect(calendarStyles).not.toContain(".daymark-tally-metric:hover");
  });

  it("keeps the period switcher on one fixed-height header track at every width", () => {
    expect(calendarStyles).toContain("grid-auto-rows: var(--daymark-control-size);");
    expect(calendarStyles).toContain("max-height: var(--daymark-control-size);");
    expect(responsiveStyles).not.toContain("height: 28px;");
  });

  it("keeps the Tally disclosure in the left-hand slot in both states", () => {
    expect(calendarStyles).toMatch(
      /\.daymark-calendar-footer \{[^}]*grid-template-columns: auto minmax\(0, 1fr\);/s
    );
    expect(calendarStyles).toMatch(
      /\.daymark-tally-heading \{[^}]*grid-template-columns: auto minmax\(0, 1fr\);/s
    );
    expect(calendarStyles).toMatch(
      /\.daymark-tally-heading \.daymark-calendar-tally \{[^}]*grid-column: 1;/s
    );
    expect(calendarStyles).toMatch(
      /\.daymark-tally-heading \.daymark-tally-report-action \{[^}]*grid-column: 2;/s
    );
    expect(calendarStyles).not.toMatch(
      /\.daymark-calendar-view \.daymark-tally-report-action \{[^}]*justify-self: start;/s
    );
    expect(fixture.indexOf('<button class="daymark-calendar-tally"')).toBeLessThan(
      fixture.indexOf('<span class="daymark-calendar-selected-stats"')
    );
    expect(fixture.indexOf('<button class="daymark-calendar-tally"')).toBeLessThan(
      fixture.indexOf('<button class="daymark-tally-report-action"')
    );
    expect(fixture).toContain('<button class="daymark-tally-report-action"');
  });

  it("uses a responsive one-line calendar summary and the quiet Tally section label", () => {
    expect(fixture).toContain("daymark-calendar-selected-stats-text is-full");
    expect(fixture).toContain("daymark-calendar-selected-stats-text is-compact");
    expect(fixture).not.toContain("daymark-tally-period-summary");
    expect(fixture).toContain("Save");
    expect(fixture).not.toContain("daymark-calendar-tally-icon");
  });

  it("uses one compact metric ledger and hides only the report label at the narrow breakpoint", () => {
    expect(calendarStyles).toContain("min-height: 32px;");
    expect(fixture).toContain(">Daily notes</span>");
    expect(fixture).toContain(">Checked items</span>");
    expect(fixture).toContain("daymark-tally-metric daymark-tally-additional-source");
    expect(calendarStyles).toContain(".daymark-tally-tag-start");
    expect(responsiveStyles).toContain(".daymark-calendar-selected-stats-text.is-compact");
    expect(responsiveStyles).toContain(".daymark-tally-report-label");
  });

  it("keeps every Tally track inside narrow sidebar bounds", () => {
    expect(calendarStyles).toMatch(
      /\.daymark-tally-panel\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);[^}]*min-width: 0;[^}]*overflow: hidden;[^}]*width: 100%;/u
    );
    expect(calendarStyles).toMatch(
      /\.daymark-tally-metric\s*\{[^}]*max-width: 100%;[^}]*min-width: 0;[^}]*overflow: hidden;[^}]*width: 100%;/u
    );
    expect(calendarStyles).toMatch(
      /\.daymark-tally-metric-value\s*\{[^}]*max-width: 55%;[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;/u
    );
  });

  it("keeps configurable Tally labels usable in narrow Settings layouts", () => {
    expect(settingsSource).toContain("Display names");
    expect(settingsSource).toContain("Journal totals");
    expect(settingsSource).toContain("Hashtag tallies");
    expect(settingsSource).toContain("text.inputEl.maxLength = 80");
    expect(settingsSource).toContain("daymark-tally-label-core-row");
    expect(settingsSource).toContain("daymark-setting-toggle");
    expect(settingsStyles).toContain(".daymark-tally-label-group");
    expect(settingsStyles).toContain(".daymark-tally-label-row");
    expect(settingsStyles).toMatch(
      /\.daymark-tally-label-row \.setting-item-name \{[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;/s
    );
    expect(settingsStyles).toMatch(
      /\.daymark-settings-card input\[type="text"\] \{[^}]*max-width: 100%;/s
    );
    expect(responsiveStyles).toContain(".daymark-tally-label-group-rows > .setting-item");
    expect(responsiveStyles).toContain(".daymark-settings-card > .daymark-setting-toggle");
  });
});
