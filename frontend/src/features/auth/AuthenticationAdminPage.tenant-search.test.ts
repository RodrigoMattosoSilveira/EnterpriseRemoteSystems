import { describe, expect, it } from "vitest";
import type { AuthAccount } from "../../types/auth";
import {
  authenticationTenantActorIdsMatchingDisplayName,
} from "./AuthenticationAdminPage";

describe("Authentication Administration Tenant display-name search", () => {
  it("maps a matching Tenant display name to the linked Account Actor", () => {
    const account: AuthAccount = {
      id: "account-byte",
      actorId: "actor-byte",
      actorKey: "actor-byte",
      displayName: "Marina Oliveira",
      login: "marina@example.test",
      active: true,
      actorActive: true,
      mustChangePassword: false,
      createdAt: "2026-08-14T00:00:00Z",
      updatedAt: "2026-08-14T00:00:00Z",
      actors: [
        {
          actorId: "actor-byte",
          actorKey: "actor-byte",
          displayName: "Marina Oliveira",
          scope: "TENANT",
          tenantId: "tenant-byte",
          active: true,
          primary: true,
        },
      ],
    };

    expect(
      [...authenticationTenantActorIdsMatchingDisplayName(
        [account],
        [{ id: "tenant-byte", name: "Byte 28A Manual Test" }],
        "manual test",
      )],
    ).toEqual(["actor-byte"]);

    expect(
      [...authenticationTenantActorIdsMatchingDisplayName(
        [account],
        [{ id: "tenant-byte", name: "  Byte   28A\u00a0Manual Test  " }],
        "Byte 28A Manual Test",
      )],
    ).toEqual(["actor-byte"]);
  });
});
