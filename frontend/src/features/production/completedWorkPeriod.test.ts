import { describe, expect, it } from "vitest";
import { isCompletedWorkPeriod, todayLocalDate } from "./MineProductionPage";

describe("isCompletedWorkPeriod", () => {
  const now = new Date(2026, 10, 18, 12, 41); // 18-Nov-2026 12:41 local

  it("treats a period that ended earlier today as completed", () => {
    // Work period 06:00-12:10 on 18-Nov, created by the user.
    expect(isCompletedWorkPeriod({ endsAt: new Date(2026, 10, 18, 12, 10).toISOString() }, now)).toBe(true);
  });

  it("treats a period that ends later today as not completed", () => {
    expect(isCompletedWorkPeriod({ endsAt: new Date(2026, 10, 18, 18, 0).toISOString() }, now)).toBe(false);
  });

  it("treats a period ending exactly now as completed", () => {
    expect(isCompletedWorkPeriod({ endsAt: now.toISOString() }, now)).toBe(true);
  });

  it("treats tomorrow's period as not completed", () => {
    expect(isCompletedWorkPeriod({ endsAt: new Date(2026, 10, 19, 18, 0).toISOString() }, now)).toBe(false);
  });

  it("fails closed when endsAt cannot be parsed", () => {
    expect(isCompletedWorkPeriod({ endsAt: "not-a-date" }, now)).toBe(false);
  });
});

describe("todayLocalDate", () => {
  it("returns today in the local calendar, even late in the evening", () => {
    // 18-Nov 23:30 local: the UTC date is already 19-Nov, but local is still 18-Nov.
    expect(todayLocalDate(new Date(2026, 10, 18, 23, 30))).toBe("2026-11-18");
  });

  it("pads month and day and crosses year boundaries", () => {
    expect(todayLocalDate(new Date(2027, 0, 1, 9, 0))).toBe("2027-01-01");
    expect(todayLocalDate(new Date(2026, 2, 5, 9, 0))).toBe("2026-03-05");
  });
});
