import { describe, expect, it } from "vitest";
import {
  ensureDefaultRequestActorStored,
  readRequestActorSelection,
  resetDefaultRequestActorStored,
} from "./requestActorBootstrap";

const STORAGE_KEY = "ers.authzAdmin.requestActor";

function memoryStorage(initial?: string): Storage {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(STORAGE_KEY, initial);

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("ensureDefaultRequestActorStored", () => {
  it("stores the bootstrap actor when no actor is present", () => {
    const storage = memoryStorage();

    ensureDefaultRequestActorStored(storage);

    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}")).toEqual({
      actorId: "bootstrap-admin",
      tenantId: "default",
    });
  });

  it("preserves a stored actor and fills a missing tenant", () => {
    const storage = memoryStorage(JSON.stringify({ actorId: "tenant-admin" }));

    ensureDefaultRequestActorStored(storage);

    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}")).toEqual({
      actorId: "tenant-admin",
      tenantId: "default",
    });
  });

  it("preserves a complete stored actor selection", () => {
    const selected = JSON.stringify({
      actorId: "expense-operator",
      tenantId: "tenant-a",
    });
    const storage = memoryStorage(selected);

    ensureDefaultRequestActorStored(storage);

    expect(storage.getItem(STORAGE_KEY)).toBe(selected);
  });

  it("repairs malformed stored actor state", () => {
    const storage = memoryStorage("not-json");

    ensureDefaultRequestActorStored(storage);

    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}")).toEqual({
      actorId: "bootstrap-admin",
      tenantId: "default",
    });
  });

  it("reads and explicitly resets a restricted local operating actor", () => {
    const storage = memoryStorage(
      JSON.stringify({ actorId: "restricted-actor", tenantId: "tenant-a" }),
    );

    expect(readRequestActorSelection(storage)).toEqual({
      actorId: "restricted-actor",
      tenantId: "tenant-a",
    });

    resetDefaultRequestActorStored(storage);

    expect(readRequestActorSelection(storage)).toEqual({
      actorId: "bootstrap-admin",
      tenantId: "default",
    });
  });
});
