import { describe, expect, it } from "vitest";
import type { AuthzActor } from "../../types/authz";
import type { AuthAccount } from "../../types/auth";
import {
  authenticationActorOptionLabel,
  canIssuePasswordResetToken,
  isAuthenticationActorEligible,
} from "./AuthenticationAdminPage";

const actor: AuthzActor = {
  id: "actor-expense",
  actorKey: "expense@example.com",
  displayName: "Expense Operator",
  active: true,
  roleGrants: [],
};

describe("authentication account actor eligibility", () => {
  it("excludes actors without an active role grant", () => {
    expect(isAuthenticationActorEligible(actor)).toBe(false);
    expect(
      isAuthenticationActorEligible({
        ...actor,
        active: false,
        roleGrants: [
          {
            id: "grant-1",
            actorId: actor.id,
            roleId: "role-expense",
            roleCode: "EXPENSE_OPERATOR",
            tenantId: "default",
            scopeType: "TENANT",
            active: true,
          },
        ],
      }),
    ).toBe(false);
  });

  it("includes active actors with active tenant access and labels the grant", () => {
    const eligible: AuthzActor = {
      ...actor,
      roleGrants: [
        {
          id: "grant-1",
          actorId: actor.id,
          roleId: "role-expense",
          roleCode: "EXPENSE_OPERATOR",
          tenantId: "default",
          scopeType: "TENANT",
          active: true,
        },
      ],
    };

    expect(isAuthenticationActorEligible(eligible)).toBe(true);
    expect(authenticationActorOptionLabel(eligible)).toBe(
      "Expense Operator (expense@example.com) — EXPENSE_OPERATOR @ default",
    );
  });
});

describe("password reset token eligibility", () => {
  const account: AuthAccount = {
    id: "account-expense",
    actorId: actor.id,
    actorKey: actor.actorKey,
    displayName: actor.displayName,
    login: actor.actorKey,
    active: true,
    actorActive: true,
    mustChangePassword: false,
    createdAt: "2026-08-06T00:00:00Z",
    updatedAt: "2026-08-06T00:00:00Z",
  };

  it("allows reset-token issuance only for an active account and actor", () => {
    expect(canIssuePasswordResetToken(account)).toBe(true);
    expect(canIssuePasswordResetToken({ ...account, active: false })).toBe(false);
    expect(canIssuePasswordResetToken({ ...account, actorActive: false })).toBe(false);
  });
});
