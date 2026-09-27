# Bite 32.2 — Person Self-Service Journey History

## Purpose

Bite 32.2 lets an authenticated Person inspect their own current and closed Collaborator Journeys for the currently selected Tenant.

The authorization foundation for this already existed before this Bite: intrinsic Person self-service grants `collaborators.self.read` when the Person's current-Tenant Membership has any Collaborator Journey history, including when every Journey is closed. Bite 32.2 completes the Person-centered UX by surfacing that history directly on the Person's own detail page.

## Authorization and Tenant boundary

Person self-service Journey history uses:

```text
GET /api/v1/collaborators/self
```

The client does not send a Person ID or Membership ID to select whose history is returned. The backend derives the Membership from the authenticated Tenant Actor and applies the request Tenant through the canonical Journey repository query.

The effective boundary is therefore:

```text
authenticated Account
  -> exact current-Tenant Actor
  -> Actor Membership
  -> current Tenant + Membership Journey history
```

A Person cannot use the self-service endpoint to request another Person's Membership or another Tenant's Journeys.

The existing Journey detail self-service endpoint remains:

```text
GET /api/v1/collaborators/self/{journeyId}
```

and verifies that the requested Journey belongs to the authenticated Actor's Membership in the current Tenant.

## Person detail UX

When the signed-in Person opens their own Person page and has `collaborators.self.read`, the page displays **Journey History** / **Histórico de Jornadas**.

The section uses the same visual history presentation introduced in Bite 32.1, showing:

- current versus closed lifecycle state;
- Journey start date;
- projected end date for an open Journey or closure date for a closed Journey;
- work assignment summary;
- compensation method;
- Journey ID; and
- a link to open that Journey through the existing self-service Journey detail path.

Tenant Administrators continue to use the Membership-scoped administrative endpoint from Bite 32.1. Person self-service never falls back to that endpoint.

## Closed-only Journey history

`collaborators.self.read` is derived from the existence of Journey history, not from the existence of an open Journey. A Person whose current Journey has been closed therefore keeps read access to their historical Journeys in that Tenant while current-Journey-only capabilities remain unavailable.

## I18N

The feature ships simultaneously in the two supported ERS locales:

```text
en-US
pt-BR
```

The Person-facing description and empty state are translated separately from the Tenant Administrator wording. Journey dates continue to use the active locale formatter.

## Non-goals

This Bite does not provide:

- Work and Credit Evidence — Bite 32.3; or
- cross-Tenant delegated-role isolation — Bite 32.4.
