# Bite 32.1 — Tenant Administrator Journey History

## Purpose

Bite 32.1 lets a Tenant Administrator inspect the current and closed Collaborator Journeys that belong to a Person's Membership in the currently selected Tenant.

This closes the lifecycle-visibility gap exposed during the Brazilian demo: historical Journeys remain canonical records, but the Tenant Administrator previously had no Person-centered way to discover them after closure.

## Authorization and Tenant boundary

Journey history is read through `collaborators.read`.

The history query is keyed by the selected Person's `PersonTenantMembership` and always applies both:

- the request Tenant from the authenticated Tenant context; and
- the requested Membership ID.

A Membership or Journey belonging to another Tenant therefore cannot become visible merely because it belongs to the same global Person or because its identifier is supplied to the endpoint.

The endpoint is:

```text
GET /api/v1/collaborators/by-membership/{membershipId}
```

It returns current and closed Journeys ordered newest Journey first.

## Person detail UX

For an actor with `collaborators.read`, the Person detail page includes **Journey History** / **Histórico de Jornadas**.

Each Journey shows:

- current versus closed lifecycle state;
- Journey start date;
- projected end date for an open Journey or closure date for a closed Journey;
- work assignment summary;
- compensation method;
- Journey ID; and
- a link to open the Journey detail.

The Person page uses the Membership-scoped history response to identify the current Journey as well, rather than downloading the Tenant-wide active Collaborator catalog.

## I18N

The feature ships simultaneously in the two supported ERS locales:

```text
en-US
pt-BR
```

All new user-facing strings use translation resources and all Journey dates use the active locale formatter.

## Non-goals

This Bite does not yet provide:

- Person self-service Journey history — Bite 32.2;
- Work and Credit Evidence — Bite 32.3; or
- cross-Tenant delegated-role isolation — Bite 32.4.
