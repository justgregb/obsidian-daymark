import { describe, expect, it } from "vitest";
import { nextCalendarMode } from "../src/calendar-mode";

describe("Calendar mode cycle", () => {
  it("matches the Tally Week to Month to Year cycle", () => {
    expect(nextCalendarMode("week")).toBe("month");
    expect(nextCalendarMode("month")).toBe("year");
    expect(nextCalendarMode("year")).toBe("week");
  });
});
