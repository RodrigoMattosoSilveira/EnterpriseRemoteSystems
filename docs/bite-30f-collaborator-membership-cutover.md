# Bite 30F — Collaborator Membership Cutover

## Purpose

Bite 30F makes **Person–Tenant Membership** the prerequisite and enduring
parent relationship for collaboration.

The legacy tenant-owned `people.id` value remains on `collaborator_journeys`
only as a compatibility foreign key for financial, planning, authentication,
and legacy UI paths that are removed in later Bite 30 cutovers. New
Collaborator creation no longer selects a tenant-owned Person row as its
business parent.

## Canonical relationship

```text
Global Person
  -> Person–Tenant Membership
      -> zero or more historical Collaborator Journeys
      -> at most one open Collaborator Journey
```

A Journey ending does not delete or deactivate the Person, Membership, or
Account-owned Tenant Actor. It ends only the current collaboration lifecycle.
A later Journey may be created for the same Membership after the previous
Journey is closed.

## Creation eligibility

`GET /api/v1/collaborators/candidates` is Membership-native. A result is
eligible only when all of the following hold for the selected Tenant:

- the Person–Tenant Membership exists in that Tenant;
- the Membership status is active `person_status` code `ACTIVE`;
- the Membership has its temporary legacy Person projection required by later
  compatibility paths;
- the authoritative global Person profile is complete and
  `can_create_collaborator = true`;
- no open Collaborator Journey already references that Membership.

The candidate response retains the existing Person-shaped presentation for the
frontend, but includes the canonical `globalPersonId` and `membershipId`.

## Create API

`POST /api/v1/collaborators` now requires:

```json
{
  "membershipId": "..."
}
```

as the canonical parent selector.

For staged compatibility, the backend still accepts the legacy `personId`
selector during Bite 30F. That value is never treated as the parent: the service
resolves it to the ACTIVE same-Tenant Membership first, and all new Journey
writes persist `membership_id`. The frontend and new tests use `membershipId`;
the legacy selector remains only until the later compatibility-removal bite.

The service re-resolves the Membership in the authenticated Tenant and verifies
that it remains ACTIVE at write time. The server derives the compatibility
legacy Person ID from the Membership; clients cannot choose a mismatched legacy
Person.

## Journey API identity fields

Collaborator Journey responses now expose:

- `membershipId` — canonical parent Membership ID;
- `personId` — canonical global Person ID;
- `legacyPersonId` — temporary tenant-owned `people.id` compatibility value.

`legacyPersonId` remains only until the remaining Bite 30 financial,
authentication compatibility, and schema-removal work is complete.

## Database migration

Migration `000056_collaborator_membership_cutover`:

1. adds `collaborator_journeys.membership_id`;
2. backfills it from the existing `(tenant_id, person_id)` compatibility
   relationship through `person_tenant_memberships.legacy_person_id`;
3. fails migration if any existing Journey cannot be mapped exactly;
4. indexes Membership-based Journey lookup;
5. requires all new Journeys to reference a same-Tenant Membership whose
   legacy Person projection matches the compatibility `person_id`;
6. requires that Membership to be ACTIVE when a new Journey is created;
7. prevents more than one open Journey for a Membership;
8. makes Journey Tenant/Membership/legacy-Person identity immutable;
9. protects Membership rows that are referenced by Journey history.

The migration intentionally does not remove `collaborator_journeys.person_id`.
That compatibility removal belongs to Bite 30J after downstream modules have
cut over.

## Follow-on cutovers

Bite 30G moves Expense, Earnings/Accrual, Ledger Entry, and Ledger Receipt
ownership to global Person + Tenant while retaining Collaborator Journey as
provenance. See `docs/bite-30g-person-tenant-financial-ownership-refactor.md`.

Legacy Person rows, legacy Actor Person/Collaborator pointers, and remaining
compatibility schema are still retained until Bite 30J.
