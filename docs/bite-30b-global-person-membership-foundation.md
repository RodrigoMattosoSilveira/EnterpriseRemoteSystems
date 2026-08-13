# Bite 30B — Global Person and Person–Tenant Membership Foundation

## Scope

Bite 30B is the first implementation bite after the Bite 30A identity/access decision. It establishes the global Person identity and the tenant-confidential Person–Tenant Membership **without** performing the later Account/Actor, self-service authorization, Collaborator, or financial ownership cutovers.

This is intentionally an additive migration.

## New authoritative structures

### `global_people`

`global_people` is the authoritative business identity for one human. It contains the fields that are shared when the same Person participates in more than one Tenant.

It has no `tenant_id`.

The migration uses normalized CPF as the deterministic identity key for backfilling historical tenant-local Person rows. If the same CPF already exists in more than one Tenant, the most recently updated legacy Person row becomes the canonical global row (with deterministic created-at/ID tie breakers) and every matching tenant row receives a Membership to that global Person.

### `person_tenant_memberships`

A Membership records that one global Person participates in one Tenant.

The Membership owns tenant-private Person state introduced in this bite:

- `status_id`
- `notes`
- Tenant identity

The database enforces one Membership per `(person_id, tenant_id)` and validates that the Membership status belongs to the same Tenant and is an active `person_status` reference-data row.

`legacy_person_id` is a temporary compatibility link to the existing tenant-owned `people` row. It exists only so Bites 30C–30G can cut over downstream foreign keys incrementally.

## Why `people.tenant_id` remains in 30B

Bite 30B does **not** remove the legacy `people.tenant_id` column or rewrite its downstream foreign keys.

Current Actors, Collaborator Journeys, Expenses, ledger/current-account logic, and other modules still depend on the legacy Person row. Removing it in 30B would collapse several later Bite boundaries into one high-risk migration.

Instead:

- the People service creates the global Person, current Tenant compatibility projection, and Membership atomically;
- reads overlay authoritative global fields onto the compatibility projection;
- a global Person update synchronizes shared fields to all existing legacy projections;
- Membership `status_id` and `notes` remain independent by Tenant;
- later Bites remove the compatibility projection only after their domains are cut over.

## Tenant Administrator workflows

### New human

`POST /api/v1/people` remains as a transitional Bite 28 compatibility workflow. In 30B it now creates:

1. one global Person;
2. one legacy compatibility `people` row for the selected Tenant;
3. one Person–Tenant Membership.

A duplicate global identity is rejected. A Tenant Administrator must use the existing-Person Membership workflow instead.

The legacy create route temporarily retains its existing `people.create` authorization guard so the Bite 28 Application Administrator test/support path continues to function until Bite 30H performs the global-control-plane cutover. This is an explicit transitional exception: the new `POST /api/v1/people/memberships` endpoint is Tenant-Administrator-only, and the final Bite 30 model removes Application Administrator tenant creation authority entirely.

### Existing global Person

A Tenant Administrator can search the global identity directory through:

`GET /api/v1/people/global?search=...`

The normal People-list filter remains intentionally Tenant-local and calls `GET /api/v1/people`. If a Tenant Administrator searches the Tenant-local list and gets no match, the UI offers **Search global People**, carrying the entered search term into the Add Existing Person workflow. The Add Existing page then performs the `/people/global` lookup. This keeps Tenant membership browsing distinct from the exceptional global identity lookup and avoids presenting non-members as if they already belonged to the selected Tenant.

Security properties:

- only a persisted Tenant Actor with the `TENANT_ADMIN` role may use the route;
- an Application Administrator cannot use the route as a global Person directory;
- at least three literal search characters are required;
- SQL `LIKE` wildcard characters are escaped;
- Persons who already have a Membership in the selected Tenant are excluded;
- the result contains identity/contact fields only;
- no Membership, Actor, Collaborator, Role, Earnings, Expenses, or other-Tenant relationship is exposed.

The administrator creates the Membership with:

`POST /api/v1/people/memberships`

The operation creates a new legacy Person compatibility projection for that Tenant so existing Collaborator and financial modules continue to function until their scheduled cutovers.

## Shared vs Tenant-private updates

A Tenant Administrator may update global Person information while operating through that Tenant's Person projection. The People repository writes shared Person fields to `global_people` and synchronizes them to every existing legacy projection.

Membership status and notes are updated only for the originating Tenant.

The handler records authorization audit events for:

- global Person creation with initial Membership;
- Membership creation;
- tenant-originated global Person updates.

Bite 30I will enrich the final audit identity chain further.

## Manual-test data

`scripts/seed-manual-testdata.py` now requires the 30B schema and synchronizes every directly inserted manual Person into `global_people` and `person_tenant_memberships`.

This prevents direct SQL seeding from bypassing the new authoritative identity foundation.

## Deliberately deferred work

### Human self-creation of a Person

The Bite 30A model requires that any human can create their ERS Person record. 30B establishes the schema required for a Person to exist without any Tenant Membership, but it does **not** expose an unauthenticated/public Person-claim endpoint.

The current Bite 28 Authentication Account is still one-to-one with one Actor. Until Bite 30C establishes the final Account→Actor/Person relationship, a public CPF-based create/claim endpoint would permit an attacker to pre-claim another human's identity without a safe Account binding.

The user-facing self-creation/claim flow must therefore be added only after the identity binding needed to prove ownership exists. This is a sequencing safeguard, not a reversal of the 30A decision.

### Actor/account model

Bite 30C owns:

- one Authentication Account controlling multiple tenant Actors;
- explicit tenant Actor binding to Membership;
- global Actor semantics.

### Self-service authorization

Bite 30D owns removal of the persisted `PERSON` Role Grant dependency and the intrinsic self-service authorization chain.

### Collaborator cutover

Bite 30F will change Collaborator creation and Journey ownership to depend directly on Membership. In 30B, the newly created tenant compatibility Person row allows the existing Collaborator implementation to keep working.

### Financial ownership

Bite 30G will move Earnings and Expenses to enduring `person_id + tenant_id` ownership. 30B does not rewrite those financial foreign keys.

### Legacy removal

Bite 30J removes the compatibility structures only after every runtime domain has cut over.

## 30B database invariants

The foundation enforces:

1. global Person has no Tenant owner;
2. CPF is unique across `global_people`;
3. at most one Membership exists for a global Person in a Tenant;
4. Membership Tenant and Person identity are immutable;
5. Membership status must be active `person_status` reference data from the same Tenant;
6. a Membership's compatibility Person must belong to the same Tenant and have the same CPF as the global Person;
7. Tenant-private Membership state does not propagate across Tenants;
8. global-directory results do not reveal other-Tenant relationships.

Secondary identity uniqueness and final legacy-schema removal are deliberately hardened later, after the additive model has been cut over safely.
