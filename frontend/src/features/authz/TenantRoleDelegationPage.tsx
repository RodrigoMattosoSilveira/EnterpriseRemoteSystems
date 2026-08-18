import { useMemo, useState } from "react";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { useAuthorizationContext } from "../../components/layout/AuthorizationContext";
import type {
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
  const actors = useMemo(() => {
    const rows = Array.isArray(actorsQuery.data) ? actorsQuery.data : [];
    return [...rows].sort((a, b) =>
      (a.displayName || a.actorKey).localeCompare(b.displayName || b.actorKey),
    );
  }, [actorsQuery.data]);

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

        {actorsQuery.isPending && <p className="text-sm text-gray-600">Loading tenant members…</p>}
        {!actorsQuery.isPending && actors.length === 0 && (
          <p className="rounded-xl border border-dashed bg-white p-4 text-sm text-gray-600">No active tenant-member Actors are available.</p>
        )}

        {actors.map((actor) => (
          <article key={actor.id} className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="mb-3">
              <h2 className="font-semibold text-gray-950">{actor.displayName || actor.actorKey}</h2>
              <p className="text-xs text-gray-500">Actor: {actor.actorKey}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {roles.map((role) => {
                const grant = (actor.roleGrants ?? []).find(
                  (candidate) => candidate.active && candidate.roleCode === role.code,
                );
                const busy = grantMutation.isPending || revokeMutation.isPending;
                return (
                  <div key={role.code} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{role.label}</p>
                      <p className="text-xs text-gray-500">{grant ? "Granted" : "Not granted"}</p>
                    </div>
                    {grant ? (
                      <button type="button" disabled={busy} onClick={() => void revoke(actor.id, grant)} className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50">Remove</button>
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

function roleLabel(roleCode: TenantOperatorRoleCode): string {
  return roleCode === "EARNINGS_OPERATOR" ? "Earnings Operator" : "Expenses Operator";
}
