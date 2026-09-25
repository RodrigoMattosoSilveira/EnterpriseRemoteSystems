import { describe, expect, it } from "vitest";
import { interpolateMessage } from "./translate";

describe("translation interpolation", () => {
  it("replaces named values without imposing English word order on callers", () => {
    expect(
      interpolateMessage("Lease expires at {time} for {tenant}.", {
        time: "18:30",
        tenant: "Tenant A",
      }),
    ).toBe("Lease expires at 18:30 for Tenant A.");
  });

  it("leaves an unresolved placeholder visible instead of silently deleting content", () => {
    expect(interpolateMessage("Hello {name}", {})).toBe("Hello {name}");
  });
});
