import { describe, expect, it } from "vitest";
import type { AuthzActor } from "../../types/authz";
import type { AuthAccount } from "../../types/auth";
import {
  authenticationAccountForActor,
  authenticationAccountMatchesSearch,
  authenticationActorForCollaborator,
  authenticationActorOptionLabel,
  authenticationCollaboratorOptionLabel,
  authenticationCollaboratorStatusLabel,
  canCreateAuthenticationAccountForCollaborator,
  canIssuePasswordResetToken,
  isAuthenticationActorEligible,
} from "./AuthenticationAdminPage";

const actor: AuthzActor = {
  id: "actor-expense",
  actorKey: "expense@example.com",
  displayName: "Expense Operator",
  collaboratorId: "collaborator-expense",
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

  it("uses every linked Actor when evaluating a multi-tenant account", () => {
    expect(
      canIssuePasswordResetToken({
        ...account,
        actorActive: false,
        actors: [
          {
            actorId: "actor-a",
            actorKey: "actor-a",
            displayName: "Actor A",
            scope: "TENANT",
            tenantId: "tenant-a",
            active: false,
            primary: true,
          },
          {
            actorId: "actor-b",
            actorKey: "actor-b",
            displayName: "Actor B",
            scope: "TENANT",
            tenantId: "tenant-b",
            active: true,
            primary: false,
          },
        ],
      }),
    ).toBe(true);
  });
});

describe("authentication account collaborator selection", () => {
  const collaborator = {
    id: "collaborator-expense",
    tenantId: "default",
    personId: "person-expense",
    personName: "Maria da Silva",
    personNickname: "Mari",
    journeyStartDate: "2026-08-01",
    defaultEndDate: "2026-10-30",
    extensionDays: 0,
    projectedEndDate: "2026-10-30",
    paymentMethodId: "ref-method-daily",
    paymentValue: 100,
    planningAvailability: "ACTIVE" as const,
    sectorId: "ref-sector-mining",
    locationId: "ref-location-main-mine",
    taskId: "ref-task-miner",
    statusId: "ref-collaborator-status-active",
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
  };

  const eligibleActor: AuthzActor = {
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

  it("maps a collaborator search result to its eligible authorization actor", () => {
    expect(
      authenticationActorForCollaborator(collaborator, [eligibleActor]),
    ).toEqual(eligibleActor);
    expect(
      authenticationActorForCollaborator(
        { ...collaborator, id: "collaborator-other" },
        [eligibleActor],
      ),
    ).toBeUndefined();
  });

  it("maps a collaborator nickname result through the 30C Person/Tenant Actor identity", () => {
    const personActor: AuthzActor = {
      ...eligibleActor,
      id: "actor-person",
      collaboratorId: undefined,
      personId: collaborator.personId,
      roleGrants: eligibleActor.roleGrants?.map((grant) => ({
        ...grant,
        actorId: "actor-person",
      })),
    };

    expect(authenticationActorForCollaborator(collaborator, [personActor])).toEqual(
      personActor,
    );
    expect(
      authenticationActorForCollaborator(
        { ...collaborator, tenantId: "other-tenant" },
        [personActor],
      ),
    ).toBeUndefined();
  });

  it("labels progressive-search choices with person name, nickname, actor, role, and tenant", () => {
    expect(
      authenticationCollaboratorOptionLabel(collaborator, eligibleActor),
    ).toBe(
      "Maria da Silva (Mari) — Expense Operator (expense@example.com) — EXPENSE_OPERATOR @ default",
    );
  });

  it("keeps matching collaborators discoverable when their actor already has an authentication account", () => {
    const account: AuthAccount = {
      id: "account-expense",
      actorId: eligibleActor.id,
      actorKey: eligibleActor.actorKey,
      displayName: eligibleActor.displayName,
      login: "mari@example.com",
      active: true,
      actorActive: true,
      mustChangePassword: false,
      createdAt: "2026-08-06T00:00:00Z",
      updatedAt: "2026-08-06T00:00:00Z",
    };

    expect(authenticationAccountForActor(eligibleActor, [account])).toEqual(account);
    expect(
      authenticationCollaboratorStatusLabel(eligibleActor, account),
    ).toBe(
      "Already has authentication account mari@example.com (active)",
    );
    expect(
      canCreateAuthenticationAccountForCollaborator(eligibleActor, account),
    ).toBe(false);
  });

  it("explains why a matching collaborator cannot yet be used for account creation", () => {
    expect(authenticationCollaboratorStatusLabel(undefined, undefined)).toBe(
      "No authorization actor",
    );
    expect(
      authenticationCollaboratorStatusLabel(
        { ...eligibleActor, active: false },
        undefined,
      ),
    ).toBe("Authorization actor is inactive");
    expect(
      authenticationCollaboratorStatusLabel(
        { ...eligibleActor, roleGrants: [] },
        undefined,
      ),
    ).toBe("Authorization actor has no active role grant");
    expect(
      authenticationCollaboratorStatusLabel(eligibleActor, undefined),
    ).toBe("Eligible for account creation");
  });
});

describe("authentication account actor/account filter", () => {
  const personAccount: AuthAccount = {
    id: "account-person",
    actorId: "actor-person-a",
    actorKey: "person-a",
    displayName: "Marina Oliveira",
    login: "marina.login@example.test",
    active: true,
    actorActive: true,
    mustChangePassword: false,
    createdAt: "2026-08-14T00:00:00Z",
    updatedAt: "2026-08-14T00:00:00Z",
    actors: [
      {
        actorId: "actor-person-a",
        actorKey: "person-a",
        displayName: "Marina Oliveira",
        scope: "TENANT",
        tenantId: "tenant-a",
        personId: "legacy-person-a",
        personName: "Marina Oliveira",
        personNickname: "Nina",
        active: true,
        primary: true,
      },
      {
        actorId: "actor-person-b",
        actorKey: "person-b",
        displayName: "Marina Oliveira",
        scope: "TENANT",
        tenantId: "tenant-b",
        personId: "legacy-person-b",
        personName: "Marina Oliveira",
        personNickname: "Nina",
        active: true,
        primary: false,
      },
    ],
  };

  it("finds a Person-based multi-tenant Authentication Account by nickname", () => {
    expect(authenticationAccountMatchesSearch(personAccount, "Nina")).toBe(true);
    expect(authenticationAccountMatchesSearch(personAccount, "nina")).toBe(true);
  });

  it("continues matching name, Actor key, login, and tenant", () => {
    expect(authenticationAccountMatchesSearch(personAccount, "Marina")).toBe(true);
    expect(authenticationAccountMatchesSearch(personAccount, "person-b")).toBe(true);
    expect(authenticationAccountMatchesSearch(personAccount, "marina.login")).toBe(true);
    expect(authenticationAccountMatchesSearch(personAccount, "tenant-b")).toBe(true);
    expect(authenticationAccountMatchesSearch(personAccount, "missing")).toBe(false);
  });
});
