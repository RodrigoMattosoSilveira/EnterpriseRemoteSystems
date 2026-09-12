import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { useAuthorizationContext } from "../../components/layout/AuthorizationContext";
import type {
  AuthzActor,
  AuthzActorRoleGrant,
  AuthzAdminRequestActor,
  TenantOperatorRoleCode,
} from "../../types/authz";
import {
  useGrantTenantOperatorRole,
  useRevokeTenantOperatorRoleGrant,
  useSetTenantActorActive,
  useTenantRoleActors,
} from "./useAuthzAdmin";
import { PageTitle } from "../../components/layout/PageHeading";

const roles: Array<{ code: TenantOperatorRoleCode; label: string }> = [
  { code: "EARNINGS_OPERATOR", label: "Earnings Operator" },
  { code: "EXPENSE_OPERATOR", label: "Expenses Operator" },
];

type TenantRoleFilter = "ALL" | "NONE" | TenantOperatorRoleCode;
type ActorStateFilter = "ALL" | "ACTIVE" | "INACTIVE";

type TenantRoleActorFilters = {
  searchTerm: string;
  roleFilter: TenantRoleFilter;
  actorStateFilter: ActorStateFilter;
  collaboratorsOnly: boolean;
};

export function TenantRoleDelegationPage() {
  const currentActor = useAuthorizationContext();
  const requestActor: AuthzAdminRequestActor = {
    actorId: currentActor.actorRecordId || currentActor.actorKey,
    tenantId: currentActor.tenantId,
  };
  const actorsQuery = useTenantRoleActors(requestActor);
  const setActorActiveMutation = useSetTenantActorActive(requestActor);
  const grantMutation = useGrantTenantOperatorRole(requestActor);
  const revokeMutation = useRevokeTenantOperatorRoleGrant(requestActor);
  const [message, setMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<TenantRoleFilter>("ALL");
  const [actorStateFilter, setActorStateFilter] = useState<ActorStateFilter>("ALL");
  const [collaboratorsOnly, setCollaboratorsOnly] = useState(false);
  const [selectedRoleByActor, setSelectedRoleByActor] = useState<
    Record<string, TenantOperatorRoleCode | undefined>
  >({});

  const actors = useMemo(() => {
    const rows = Array.isArray(actorsQuery.data) ? actorsQuery.data : [];
    return [...rows].sort((a, b) =>
      (a.displayName || a.actorKey).localeCompare(b.displayName || b.actorKey),
    );
  }, [actorsQuery.data]);

  const filteredActors = useMemo(
    () =>
      filterTenantRoleActors(actors, {
        searchTerm,
        roleFilter,
        actorStateFilter,
        collaboratorsOnly,
      }),
    [actors, searchTerm, roleFilter, actorStateFilter, collaboratorsOnly],
  );

  async function setActorActive(targetActorId: string, active: boolean) {
    setMessage("");
    try {
      await setActorActiveMutation.mutateAsync({ targetActorId, active });
      setMessage(`Tenant Actor ${active ? "activated" : "deactivated"}.`);
    } catch {
      // ApiErrorPanel renders the mutation error.
    }
  }

  async function grant(targetActorId: string, roleCode: TenantOperatorRoleCode) {
    setMessage("");
    try {
      await grantMutation.mutateAsync({ targetActorId, input: { roleCode } });
      setMessage(`${roleLabel(roleCode)} granted.`);
    } catch {
      // ApiErrorPanel renders the mutation error.
    }
  }

  async function revoke(targetActorId: string, grant: AuthzActorRoleGrant) {
    setMessage("");
    try {
      await revokeMutation.mutateAsync({ targetActorId, grantId: grant.id });
      setMessage(`${roleLabel(grant.roleCode as TenantOperatorRoleCode)} revoked.`);
    } catch {
      // ApiErrorPanel renders the mutation error.
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b bg-white px-4 py-4">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Administration</p>
          <PageTitle>Tenant Authorization</PageTitle>
          <p className="text-sm text-gray-600">
            Activate or deactivate this tenant&apos;s Account-bound Actors and grant or remove Earnings Operator and Expenses Operator authority.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            A missing Tenant Actor is created from the Person&apos;s Authentication section in People. Role grants require an ACTIVE Actor backed by an ACTIVE same-tenant Person–Tenant Membership.
          </p>
        </div>
      </header>

      <section className="mx-auto max-w-5xl space-y-4 p-4">
        <div className="flex justify-end">
          <Link to="/people" className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-gray-800">
            Open People
          </Link>
        </div>
        {message && <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</div>}
        <ApiErrorPanel error={actorsQuery.error ?? setActorActiveMutation.error ?? grantMutation.error ?? revokeMutation.error} />

        <div className="grid gap-3 rounded-2xl border bg-white p-4 shadow-sm md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_12rem_auto] lg:items-end">
          <label className="grid gap-1 text-sm font-medium text-gray-800">
            Filter People / Actors
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Name, login, Actor ID, or Actor Key"
              className="rounded-lg border px-3 py-2 font-normal text-gray-950"
            />
          </label>

          <label className="grid gap-1 text-sm font-medium text-gray-800">
            Actor state
            <select
              value={actorStateFilter}
              onChange={(event) => setActorStateFilter(event.target.value as ActorStateFilter)}
              className="rounded-lg border bg-white px-3 py-2 font-normal text-gray-950"
            >
              <option value="ALL">All Actors</option>
              <option value="ACTIVE">Active Actors</option>
              <option value="INACTIVE">Inactive Actors</option>
            </select>
          </label>

          <label className="grid gap-1 text-sm font-medium text-gray-800">
            Delegated role
            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as TenantRoleFilter)}
              className="rounded-lg border bg-white px-3 py-2 font-normal text-gray-950"
            >
              <option value="ALL">All candidates</option>
              <option value="NONE">No operator role</option>
              <option value="EARNINGS_OPERATOR">Earnings Operator</option>
              <option value="EXPENSE_OPERATOR">Expenses Operator</option>
            </select>
          </label>

          <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-gray-800">
            <input
              type="checkbox"
              checked={collaboratorsOnly}
              onChange={(event) => setCollaboratorsOnly(event.target.checked)}
            />
            Collaborators only
          </label>
        </div>

        {actorsQuery.isPending && <p className="text-sm text-gray-600">Loading tenant Actors…</p>}
        {!actorsQuery.isPending && actors.length === 0 && (
          <div className="rounded-xl border border-dashed bg-white p-4 text-sm text-gray-600">
            <p>No Account-bound tenant Actors are available.</p>
            <p className="mt-1">Use People → Person → Authentication to enable Authentication and create the Person&apos;s Tenant Actor.</p>
          </div>
        )}
        {!actorsQuery.isPending && actors.length > 0 && (
          <p className="text-sm text-gray-600">
            Showing {filteredActors.length} of {actors.length} tenant Actors, including inactive Actors.
          </p>
        )}
        {!actorsQuery.isPending && actors.length > 0 && filteredActors.length === 0 && (
          <p className="rounded-xl border border-dashed bg-white p-4 text-sm text-gray-600">No candidates match these filters.</p>
        )}

        {filteredActors.map((actor) => {
          const binding = actor.binding;
          const membershipEligible = Boolean(binding?.membershipActive && binding?.membershipSameTenant);
          const roleEligible = actor.active && membershipEligible;
          const isCurrentActor = actor.id === currentActor.actorRecordId;
          const lifecycleBusy = setActorActiveMutation.isPending;
          return (
            <article key={actor.id} data-testid="tenant-role-actor-card" className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-gray-950">{actor.displayName || actor.actorKey}</h2>
                  <p className="text-xs text-gray-500">Actor ID: {actor.id}</p>
                  <p className="text-xs text-gray-500">Actor Key: {actor.actorKey}</p>
                  {binding?.accountLogin && <p className="text-xs text-gray-500">Login: {binding.accountLogin}</p>}
                  {binding?.membershipId && <p className="text-xs text-gray-500">Membership ID: {binding.membershipId}</p>}
                  {actor.personId && (
                    <Link to={`/people/${encodeURIComponent(actor.personId)}`} className="mt-1 inline-block text-xs font-semibold text-gray-700 underline">
                      Open Person
                    </Link>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${actor.active ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
                    Actor {actor.active ? "ACTIVE" : "INACTIVE"}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${membershipEligible ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-700"}`}>
                    Membership {membershipEligible ? "ACTIVE" : "INACTIVE"}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                    {actor.collaboratorId ? "Collaborator" : "Tenant member"}
                  </span>
                </div>
              </div>

              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Tenant Actor lifecycle</p>
                  <p className="text-xs text-gray-500">
                    {actor.active
                      ? "Deactivate only this tenant identity; the Authentication Account remains independent."
                      : membershipEligible
                        ? "Reactivate this existing Actor and restore this tenant context."
                        : "Reactivate the Person–Tenant Membership before activating this Actor."}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={lifecycleBusy || (actor.active && isCurrentActor) || (!actor.active && !membershipEligible)}
                  onClick={() => void setActorActive(actor.id, !actor.active)}
                  className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  title={actor.active && isCurrentActor ? "A Tenant Administrator cannot deactivate the Actor currently authorizing this session." : undefined}
                >
                  {actor.active ? "Deactivate Actor" : "Activate Actor"}
                </button>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <section className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
                  <h3 className="text-sm font-semibold text-gray-950">Grant a Role</h3>
                  <p className="mt-0.5 text-xs text-gray-600">
                    Choose one tenant-delegable Role from the selector, then grant it to this Actor.
                  </p>
                  <div className="mt-3">
                    <TenantOperatorRoleSelector
                      actorId={actor.id}
                      roles={roles}
                      selectedRoleCode={selectedRoleByActor[actor.id] ?? ""}
                      onChange={(roleCode) =>
                        setSelectedRoleByActor((current) => ({
                          ...current,
                          [actor.id]: roleCode,
                        }))
                      }
                      disabled={!roleEligible}
                    />
                  </div>
                  {!roleEligible && (
                    <p className="mt-2 text-xs font-medium text-amber-700">
                      Actor and same-tenant Membership must both be ACTIVE before a Role can be granted.
                    </p>
                  )}
                  {selectedRoleByActor[actor.id] &&
                    activeOperatorGrant(actor, selectedRoleByActor[actor.id]!) && (
                      <p className="mt-2 text-xs font-medium text-gray-600">
                        {roleLabel(selectedRoleByActor[actor.id]!)} is already granted.
                      </p>
                    )}
                  <button
                    type="button"
                    disabled={
                      lifecycleBusy ||
                      grantMutation.isPending ||
                      revokeMutation.isPending ||
                      !roleEligible ||
                      !selectedRoleByActor[actor.id] ||
                      Boolean(
                        selectedRoleByActor[actor.id] &&
                          activeOperatorGrant(actor, selectedRoleByActor[actor.id]!),
                      )
                    }
                    onClick={() => {
                      const roleCode = selectedRoleByActor[actor.id];
                      if (roleCode) void grant(actor.id, roleCode);
                    }}
                    className="mt-3 rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Grant Role
                  </button>
                </section>

                <section className="rounded-xl border p-3">
                  <h3 className="text-sm font-semibold text-gray-950">Current Role Grants</h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Roles already granted to this Actor are listed here and can be removed individually.
                  </p>
                  <div className="mt-3 space-y-2">
                    {roles.every((role) => !activeOperatorGrant(actor, role.code)) && (
                      <p className="rounded-lg border border-dashed p-3 text-sm text-gray-500">
                        No current operator Role Grants.
                      </p>
                    )}
                    {roles.map((role) => {
                      const existingGrant = activeOperatorGrant(actor, role.code);
                      if (!existingGrant) return null;
                      const busy =
                        lifecycleBusy ||
                        grantMutation.isPending ||
                        revokeMutation.isPending;
                      return (
                        <div
                          key={role.code}
                          className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 p-3"
                        >
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              {role.code}
                            </p>
                            <p className="text-xs text-gray-500">{role.label}</p>
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void revoke(actor.id, existingGrant)}
                            className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}


function TenantOperatorRoleSelector({
  actorId,
  roles,
  selectedRoleCode,
  onChange,
  disabled,
}: {
  actorId: string;
  roles: Array<{ code: TenantOperatorRoleCode; label: string }>;
  selectedRoleCode: TenantOperatorRoleCode | "";
  onChange: (roleCode: TenantOperatorRoleCode) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const selectedRole = roles.find((role) => role.code === selectedRoleCode);
  const normalizedFilter = filterText.trim().toLocaleLowerCase();
  const visibleRoles = normalizedFilter
    ? roles.filter((role) =>
        [role.code, role.label].some((value) =>
          value.toLocaleLowerCase().includes(normalizedFilter),
        ),
      )
    : roles;
  const optionsId = `tenant-role-options-${actorId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  function closeSelector({ restoreFocus = false }: { restoreFocus?: boolean } = {}) {
    setFilterText("");
    setOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => {
        rootRef.current
          ?.querySelector<HTMLButtonElement>('button[aria-label="Role selector"]')
          ?.focus();
      });
    }
  }

  function openSelector() {
    if (disabled) return;
    setFilterText("");
    setOpen(true);
    window.requestAnimationFrame(() => filterRef.current?.focus());
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (
          open &&
          (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget))
        ) {
          closeSelector();
        }
      }}
    >
      <p className="text-sm font-semibold text-gray-800">Role</p>
      <button
        type="button"
        aria-label="Role selector"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? optionsId : undefined}
        disabled={disabled}
        onClick={() => (open ? closeSelector() : openSelector())}
        className="mt-1 flex w-full items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2 text-left text-sm text-gray-950 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
      >
        <span>
          <span className="block font-semibold">
            {selectedRole?.code ?? (disabled ? "Role selection unavailable" : "Select a Role")}
          </span>
          {selectedRole && (
            <span className="block text-xs text-gray-500">{selectedRole.label}</span>
          )}
        </span>
        <span aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border border-gray-300 bg-white shadow-lg">
          <div className="border-b border-gray-200 p-2">
            <label className="grid gap-1 text-xs font-semibold text-gray-700">
              Filter roles
              <input
                ref={filterRef}
                type="search"
                role="combobox"
                aria-label="Filter roles"
                aria-autocomplete="list"
                aria-controls={optionsId}
                aria-expanded="true"
                value={filterText}
                onChange={(event) => setFilterText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeSelector({ restoreFocus: true });
                  }
                }}
                placeholder="Role code or name"
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal text-gray-950 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
            </label>
          </div>
          <div
            id={optionsId}
            role="listbox"
            aria-label="Role choices"
            className="max-h-48 overflow-y-auto p-1"
          >
            {visibleRoles.length === 0 ? (
              <p className="px-3 py-4 text-sm text-gray-500">No matching Roles.</p>
            ) : (
              visibleRoles.map((role) => (
                <button
                  key={role.code}
                  type="button"
                  role="option"
                  aria-selected={role.code === selectedRoleCode}
                  data-role-code={role.code}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(role.code);
                    closeSelector();
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left hover:bg-gray-50 focus:bg-gray-100 focus:outline-none"
                >
                  <span className="block text-sm font-semibold text-gray-950">
                    {role.code}
                  </span>
                  <span className="block text-xs text-gray-500">{role.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function filterTenantRoleActors(
  actors: AuthzActor[],
  filters: TenantRoleActorFilters,
): AuthzActor[] {
  const query = filters.searchTerm.trim().toLocaleLowerCase();

  return actors.filter((actor) => {
    if (filters.collaboratorsOnly && !actor.collaboratorId) {
      return false;
    }

    if (filters.actorStateFilter === "ACTIVE" && !actor.active) {
      return false;
    }
    if (filters.actorStateFilter === "INACTIVE" && actor.active) {
      return false;
    }

    if (query) {
      const searchable = [
        actor.id,
        actor.displayName,
        actor.actorKey,
        actor.personId,
        actor.collaboratorId,
        actor.binding?.accountLogin,
        actor.binding?.membershipId,
      ]
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .join(" ")
        .toLocaleLowerCase();
      if (!searchable.includes(query)) {
        return false;
      }
    }

    if (filters.roleFilter === "NONE") {
      return !roles.some((role) => Boolean(activeOperatorGrant(actor, role.code)));
    }
    if (filters.roleFilter !== "ALL") {
      return Boolean(activeOperatorGrant(actor, filters.roleFilter));
    }
    return true;
  });
}

function activeOperatorGrant(
  actor: AuthzActor,
  roleCode: TenantOperatorRoleCode,
): AuthzActorRoleGrant | undefined {
  return (actor.roleGrants ?? []).find(
    (candidate) =>
      candidate.active && !candidate.lifecycleSuspended && candidate.roleCode === roleCode,
  );
}

function roleLabel(roleCode: TenantOperatorRoleCode): string {
  return roleCode === "EARNINGS_OPERATOR" ? "Earnings Operator" : "Expenses Operator";
}
