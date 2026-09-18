import { describe, expect, it } from "vitest";
import { formatCurrency, formatDate, formatDateTime, formatNumber } from "./formatters";

describe("locale-bound ERS formatters", () => {
  it("formats the same number using the selected locale", () => {
    expect(formatNumber("en-US", 1234.5)).toBe("1,234.5");
    expect(formatNumber("pt-BR", 1234.5)).toBe("1.234,5");
  });

  it("formats BRL according to the selected locale without changing the currency", () => {
    expect(formatCurrency("en-US", 1234.5, "BRL")).toContain("1,234.50");
    expect(formatCurrency("pt-BR", 1234.5, "BRL")).toContain("1.234,50");
    expect(formatCurrency("pt-BR", 1234.5, "BRL")).toContain("R$");
  });

  it("formats dates and date-times in the selected locale while leaving timezone explicit to the caller", () => {
    const value = new Date("2026-09-15T18:30:00Z");
    const dateOptions: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "UTC",
    };
    const dateTimeOptions: Intl.DateTimeFormatOptions = {
      ...dateOptions,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    };

    expect(formatDate("en-US", value, dateOptions)).toBe("09/15/2026");
    expect(formatDate("pt-BR", value, dateOptions)).toBe("15/09/2026");
    expect(formatDateTime("pt-BR", value, dateTimeOptions)).toContain("18:30");
  });

  it("keeps date-only domain values on the same calendar day in every local timezone", () => {
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    };

    expect(formatDate("en-US", "2026-05-01", options)).toBe("05/01/2026");
    expect(formatDate("pt-BR", "2026-05-01", options)).toBe("01/05/2026");
  });

  it("rejects invalid date values instead of presenting misleading output", () => {
    expect(() => formatDate("en-US", "not-a-date")).toThrow(RangeError);
  });
});
