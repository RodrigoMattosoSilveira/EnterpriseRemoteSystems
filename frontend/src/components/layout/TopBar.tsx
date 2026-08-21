import type { AuthSession, AuthTenantOption } from "../../types/auth";
import type { AuthzCurrentActor } from "../../types/authz";
import { TenantSelector } from "./TenantSelector";

export function TopBar({
  session,
  tenants,
  selectedTenantId,
  effectiveActor,
  onTenantChange,
  onLogout,
}: {
  session: AuthSession;
  tenants: AuthTenantOption[];
  selectedTenantId: string;
  effectiveActor: AuthzCurrentActor;
  onTenantChange: (tenantId: string) => void;
  onLogout: () => void;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div
        data-effective-actor-id={effectiveActor.actorRecordId}
        data-effective-actor-scope={effectiveActor.scope}
        data-effective-actor-key={effectiveActor.actorKey}
      >
        <p className="text-lg font-bold text-slate-950">
          {session.displayName || session.login}
        </p>
        <p className="text-sm font-medium text-slate-600">{session.login}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <TenantSelector
          tenants={tenants}
          selectedTenantId={selectedTenantId}
          onTenantChange={onTenantChange}
        />
        <button
          className="rounded-xl border border-slate-300 px-4 py-2.5 text-base font-bold text-slate-800 shadow-sm hover:bg-slate-50"
          onClick={onLogout}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
