import { describe, expect, it } from "vitest";
import { normalizeAuthzActorList, normalizeAuthzCurrentActor } from "./authz.api";

describe("normalizeAuthzCurrentActor", () => {
  it("normalizes null authorization collections for a Person-only Actor", () => {
    expect(
      normalizeAuthzCurrentActor({
        actorKey: "manual30d.identity-a@example.test",
        actorRecordId: "actor-a",
        tenantId: "tenant-a",
        scope: "TENANT",
        personId: "person-a",
        globalPersonId: "global-person-a",
        membershipId: "membership-a",
        roleCodes: null,
        permissions: ["authz.self.read", "people.self.read"],
        intrinsicPermissions: ["authz.self.read", "people.self.read"],
        delegatedPermissions: null,
      }),
    ).toEqual({
      actorKey: "manual30d.identity-a@example.test",
      actorRecordId: "actor-a",
      tenantId: "tenant-a",
      scope: "TENANT",
      personId: "person-a",
      globalPersonId: "global-person-a",
      membershipId: "membership-a",
      collaboratorId: undefined,
      roleCodes: [],
      permissions: ["authz.self.read", "people.self.read"],
      intrinsicPermissions: ["authz.self.read", "people.self.read"],
      delegatedPermissions: [],
    });
  });

  it("filters malformed collection entries instead of exposing nullable arrays", () => {
    const actor = normalizeAuthzCurrentActor({
      actorKey: "actor-a",
      actorRecordId: "actor-a",
      tenantId: "tenant-a",
      scope: "TENANT",
      roleCodes: ["TENANT_ADMIN", null, 7],
      permissions: null,
      intrinsicPermissions: undefined,
      delegatedPermissions: ["people.read", false],
    });

    expect(actor.roleCodes).toEqual(["TENANT_ADMIN"]);
    expect(actor.permissions).toEqual([]);
    expect(actor.intrinsicPermissions).toEqual([]);
    expect(actor.delegatedPermissions).toEqual(["people.read"]);
  });
});

describe("normalizeAuthzActorList", () => {
  const actor = {
    id: "actor-a",
    actorKey: "person-a@example.test",
    displayName: "Person A",
    active: true,
    roleGrants: [],
  };

  it("preserves the tenant-role actor array returned by the API", () => {
    expect(normalizeAuthzActorList([actor])).toEqual([actor]);
  });

  it("unwraps a nested data array instead of exposing a non-iterable object to React Query consumers", () => {
    expect(normalizeAuthzActorList({ data: [actor] })).toEqual([actor]);
  });

  it("returns an empty array for an unexpected successful response shape", () => {
    expect(normalizeAuthzActorList({ data: { actor } })).toEqual([]);
  });
});
