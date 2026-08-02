import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import { shouldRetryQuery } from "./queryRetryPolicy";

describe("shouldRetryQuery", () => {
  it.each([400, 401, 403, 404, 409, 422])(
    "does not retry terminal HTTP %s client failures",
    (status) => {
      expect(
        shouldRetryQuery(
          0,
          new ApiError({ message: "request rejected", status }),
        ),
      ).toBe(false);
    },
  );

  it.each([408, 429, 500, 503])(
    "allows transient HTTP %s failures to retry",
    (status) => {
      expect(
        shouldRetryQuery(
          0,
          new ApiError({ message: "temporary failure", status }),
        ),
      ).toBe(true);
    },
  );

  it("allows network failures to retry within the retry limit", () => {
    expect(shouldRetryQuery(0, new Error("network unavailable"))).toBe(true);
    expect(shouldRetryQuery(2, new Error("network unavailable"))).toBe(true);
    expect(shouldRetryQuery(3, new Error("network unavailable"))).toBe(false);
  });
});
