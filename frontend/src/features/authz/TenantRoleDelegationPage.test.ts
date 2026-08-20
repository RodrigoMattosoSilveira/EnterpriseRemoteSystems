import { describe, expect, it } from "vitest";
import type { AuthzActor } from "../../types/authz";
import { filterTenantRoleActors } from "./TenantRoleDelegationPage";

const actors: AuthzActor[] = [
  {
    id: "actor-collaborator",
    actorKey: "collaborator@example.test",
    displayName: "Mateus Collaborator",
    personId: "person-collaborator",
    collaboratorId: "collaborator-1",
    active: true,
    roleGrants: [],
  },
  {
    id: "actor-expenses",
    actorKey: "expenses@example.test",
    displayName: "Sofia ExpensesOperator",
    personId: "person-expenses",
    active: true,
    roleGrants: [
      {
        id: "grant-expenses",
        actorId: "actor-expenses",
        roleId: "role-expenses",
        roleCode: "EXPENSE_OPERATOR",
        tenantId: "tenant-a",
        scopeType: "TENANT",
        active: true,
      },
    ],
  },
  {
    id: "actor-earnings",
    actorKey: "earnings@example.test",
    displayName: "Renato EarningsOperator",
    personId: "person-earnings",
    active: true,
    roleGrants: [
      {
        id: "grant-earnings",
        actorId: "actor-earnings",
        roleId: "role-earnings",
        roleCode: "EARNINGS_OPERATOR",
        tenantId: "tenant-a",
        scopeType: "TENANT",
        active: true,
      },
    ],
  },
  {
    id: "actor-identity-d",
    actorKey: "manual30e-identity-d",
    displayName: "Diana Disposable (30E Identity D)",
    personId: "person-identity-d",
    active: false,
    roleGrants: [],
    binding: {
      accountId: "account-identity-d",
      accountLogin: "manual30e.identity-d@example.test",
      scopeType: "TENANT",
      tenantId: "tenant-a",
      membershipId: "membership-identity-d",
      membershipTenantId: "tenant-a",
      membershipActive: true,
      membershipSameTenant: true,
    },
  },
];

describe("filterTenantRoleActors", () => {
  it("searches candidates by display name and login", () => {
    expect(
      filterTenantRoleActors(actors, {
        searchTerm: "sofia",
        roleFilter: "ALL",
        actorStateFilter: "ALL",
        collaboratorsOnly: false,
      }).map((actor) => actor.id),
    ).toEqual(["actor-expenses"]);

    expect(
      filterTenantRoleActors(actors, {
        searchTerm: "collaborator@example.test",
        roleFilter: "ALL",
        actorStateFilter: "ALL",
        collaboratorsOnly: false,
      }).map((actor) => actor.id),
    ).toEqual(["actor-collaborator"]);
  });

  it("finds candidates with an existing operator grant for removal", () => {
    expect(
      filterTenantRoleActors(actors, {
        searchTerm: "",
        roleFilter: "EXPENSE_OPERATOR",
        actorStateFilter: "ALL",
        collaboratorsOnly: false,
      }).map((actor) => actor.id),
    ).toEqual(["actor-expenses"]);

    expect(
      filterTenantRoleActors(actors, {
        searchTerm: "",
        roleFilter: "EARNINGS_OPERATOR",
        actorStateFilter: "ALL",
        collaboratorsOnly: false,
      }).map((actor) => actor.id),
    ).toEqual(["actor-earnings"]);
  });

  it("finds candidates with no operator grant and can narrow to Collaborators", () => {
    expect(
      filterTenantRoleActors(actors, {
        searchTerm: "",
        roleFilter: "NONE",
        actorStateFilter: "ALL",
        collaboratorsOnly: false,
      }).map((actor) => actor.id),
    ).toEqual(["actor-collaborator", "actor-identity-d"]);

    expect(
      filterTenantRoleActors(actors, {
        searchTerm: "",
        roleFilter: "ALL",
        actorStateFilter: "ALL",
        collaboratorsOnly: true,
      }).map((actor) => actor.id),
    ).toEqual(["actor-collaborator"]);
  });


  it("finds inactive tenant Actors by Authentication Account login", () => {
    expect(
      filterTenantRoleActors(actors, {
        searchTerm: "manual30e.identity-d@example.test",
        roleFilter: "ALL",
        actorStateFilter: "INACTIVE",
        collaboratorsOnly: false,
      }).map((actor) => actor.id),
    ).toEqual(["actor-identity-d"]);
  });
});
