import { useMemo, useState } from "react";
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
  useTenantRoleActors,
} from "./useAuthzAdmin";

const roles: Array<{ code: TenantOperatorRoleCode; label: string }> = [
  { code: "EARNINGS_OPERATOR", label: "Earnings Operator" },
  { code: "EXPENSE_OPERATOR", label: "Expenses Operator" },
];

type TenantRoleFilter = "ALL" | "NONE" | TenantOperatorRoleCode;

type TenantRoleActorFilters = {
  searchTerm: string;
  roleFilter: TenantRoleFilter;
  collaboratorsOnly: boolean;
};

export function TenantRoleDelegationPage() {
  const currentActor = useAuthorizationContext();
  const requestActor: AuthzAdminRequestActor = {
    actorId: currentActor.actorRecordId || currentActor.actorKey,
    tenantId: currentActor.tenantId,
  };
  const actorsQuery = useTenantRoleActors(requestActor);
  const grantMutation = useGrantTenantOperatorRole(requestActor);
  const revokeMutation = useRevokeTenantOperatorRoleGrant(requestActor);
  const [message, setMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<TenantRoleFilter>("ALL");
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
        collaboratorsOnly,
      }),
    [actors, searchTerm, roleFilter, collaboratorsOnly],
  );

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
          <h1 className="text-xl font-bold text-gray-950">Delegated Roles</h1>
          <p className="text-sm text-gray-600">
            Grant or remove Earnings Operator and Expenses Operator authority for active members of this tenant.
          </p>
        </div>
      </header>

      <section className="mx-auto max-w-5xl space-y-4 p-4">
        {message && <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</div>}
        <ApiErrorPanel error={actorsQuery.error ?? grantMutation.error ?? revokeMutation.error} />

        <div className="grid gap-3 rounded-2xl border bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_14rem_auto] md:items-end">
          <label className="grid gap-1 text-sm font-medium text-gray-800">
            Filter collaborators / members
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Name, login, or Actor"
              className="rounded-lg border px-3 py-2 font-normal text-gray-950"
            />
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

        {actorsQuery.isPending && <p className="text-sm text-gray-600">Loading tenant members…</p>}
        {!actorsQuery.isPending && actors.length === 0 && (
          <p className="rounded-xl border border-dashed bg-white p-4 text-sm text-gray-600">No active tenant-member Actors are available.</p>
        )}
        {!actorsQuery.isPending && actors.length > 0 && (
          <p className="text-sm text-gray-600">
            Showing {filteredActors.length} of {actors.length} active tenant members.
          </p>
        )}
        {!actorsQuery.isPending && actors.length > 0 && filteredActors.length === 0 && (
          <p className="rounded-xl border border-dashed bg-white p-4 text-sm text-gray-600">No candidates match these filters.</p>
        )}

        {filteredActors.map((actor) => (
          <article key={actor.id} className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold text-gray-950">{actor.displayName || actor.actorKey}</h2>
                <p className="text-xs text-gray-500">Actor: {actor.actorKey}</p>
              </div>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                {actor.collaboratorId ? "Collaborator" : "Tenant member"}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {roles.map((role) => {
                const existingGrant = activeOperatorGrant(actor, role.code);
                const busy = grantMutation.isPending || revokeMutation.isPending;
                return (
                  <div key={role.code} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{role.label}</p>
                      <p className="text-xs text-gray-500">{existingGrant ? "Granted" : "Not granted"}</p>
                    </div>
                    {existingGrant ? (
                      <button type="button" disabled={busy} onClick={() => void revoke(actor.id, existingGrant)} className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50">Remove</button>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => void grant(actor.id, role.code)} className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Grant</button>
                    )}
                  </div>
                );
              })}
            </div>
          </article>
        ))}
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

    if (query) {
      const searchable = [
        actor.displayName,
        actor.actorKey,
        actor.personId,
        actor.collaboratorId,
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
