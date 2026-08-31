import { useMemo, useState } from "react";
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
            <article key={actor.id} className="rounded-2xl border bg-white p-4 shadow-sm">
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

              <div className="grid gap-3 sm:grid-cols-2">
                {roles.map((role) => {
                  const existingGrant = activeOperatorGrant(actor, role.code);
                  const busy = lifecycleBusy || grantMutation.isPending || revokeMutation.isPending;
                  return (
                    <div key={role.code} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{role.label}</p>
                        <p className="text-xs text-gray-500">
                          {existingGrant ? "Granted" : roleEligible ? "Not granted" : "Actor/Membership must be ACTIVE"}
                        </p>
                      </div>
                      {existingGrant ? (
                        <button type="button" disabled={busy} onClick={() => void revoke(actor.id, existingGrant)} className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50">Remove</button>
                      ) : (
                        <button type="button" disabled={busy || !roleEligible} onClick={() => void grant(actor.id, role.code)} className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Grant</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </section>
    </main>
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
    (candidate) => candidate.active && candidate.roleCode === roleCode,
  );
}

function roleLabel(roleCode: TenantOperatorRoleCode): string {
  return roleCode === "EARNINGS_OPERATOR" ? "Earnings Operator" : "Expenses Operator";
}
