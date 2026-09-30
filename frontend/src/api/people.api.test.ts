import { afterEach, describe, expect, it, vi } from "vitest";
import { exportPeopleCSV } from "./people.api";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("exportPeopleCSV", () => {
  it("downloads the Tenant People portability CSV without caching", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("firstName,lastName\nAna,Silva\n", {
        status: 200,
        headers: { "Content-Type": "text/csv; charset=utf-8" },
      }),
    );

    const blob = await exportPeopleCSV();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/people/export.csv");
    expect(init?.cache).toBe("no-store");
    expect(await blob.text()).toContain("firstName,lastName");
  });
});
