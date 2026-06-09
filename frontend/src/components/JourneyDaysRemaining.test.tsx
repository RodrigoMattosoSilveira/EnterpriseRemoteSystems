import { describe, expect, it } from "vitest";
import { getJourneyDaysPresentation } from "./JourneyDaysRemaining";

const now = new Date(2026, 5, 9, 12, 0, 0);

describe("getJourneyDaysPresentation", () => {
  it("uses green for more than 30 days remaining", () => {
    expect(getJourneyDaysPresentation("2026-07-10", now)).toMatchObject({
      daysRemaining: 31,
      label: "31 days remaining",
      colorClass: "text-green-700",
    });
  });

  it("uses yellow for 8 through 30 days remaining", () => {
    expect(getJourneyDaysPresentation("2026-07-09", now)).toMatchObject({
      daysRemaining: 30,
      colorClass: "text-yellow-700",
    });
    expect(getJourneyDaysPresentation("2026-06-17", now)).toMatchObject({
      daysRemaining: 8,
      colorClass: "text-yellow-700",
    });
  });

  it("uses red for 7 days or fewer", () => {
    expect(getJourneyDaysPresentation("2026-06-16", now)).toMatchObject({
      daysRemaining: 7,
      colorClass: "text-red-700",
    });
    expect(getJourneyDaysPresentation("2026-06-09", now)).toMatchObject({
      daysRemaining: 0,
      label: "Ends today",
      colorClass: "text-red-700",
    });
  });

  it("uses red and overdue wording for past dates", () => {
    expect(getJourneyDaysPresentation("2026-06-04", now)).toMatchObject({
      daysRemaining: -5,
      label: "5 days overdue",
      colorClass: "text-red-700",
    });
  });

  it("returns null for an invalid date", () => {
    expect(getJourneyDaysPresentation("not-a-date", now)).toBeNull();
    expect(getJourneyDaysPresentation("2026-02-30", now)).toBeNull();
  });
});
