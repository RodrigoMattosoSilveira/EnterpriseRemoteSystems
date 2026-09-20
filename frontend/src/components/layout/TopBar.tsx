import type { AuthSession, AuthTenantOption } from "../../types/auth";
import type { AuthzCurrentActor } from "../../types/authz";
import { useI18n } from "../../i18n";
import { LanguageSelector } from "./LanguageSelector";
import { TenantSelector } from "./TenantSelector";

export function TopBar({
  session,
  tenants,
  selectedTenantId,
  effectiveActor,
  onTenantChange,
  onTenantOptionsRefresh,
  onLogout,
}: {
  session: AuthSession;
  tenants: AuthTenantOption[];
  selectedTenantId: string;
  effectiveActor: AuthzCurrentActor;
  onTenantChange: (tenantId: string) => void;
  onTenantOptionsRefresh: () => Promise<void> | void;
  onLogout: () => void;
}) {
  const { t, formatDateTime } = useI18n();
  return (
    <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div
        data-effective-actor-id={effectiveActor.actorRecordId}
        data-effective-actor-scope={effectiveActor.scope}
        data-effective-actor-key={effectiveActor.actorKey}
      >
        <p className="text-lg font-bold text-slate-950">{session.displayName || session.login}</p>
        <p className="text-sm font-medium text-slate-600">{session.login}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {effectiveActor.supportLeaseId && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" data-testid="support-access-active">
            <p className="font-bold">{t("shell.supportAccessActive")}</p>
            <p className="font-mono text-xs">{effectiveActor.supportLeaseId}</p>
            {effectiveActor.supportLeaseExpiresAt && <p className="text-xs">{t("shell.expires", { value: formatDateTime(effectiveActor.supportLeaseExpiresAt) })}</p>}
          </div>
        )}
        <LanguageSelector compact />
        <TenantSelector tenants={tenants} selectedTenantId={selectedTenantId} onTenantChange={onTenantChange} onRefreshTenants={onTenantOptionsRefresh} />
        <button className="rounded-xl border border-slate-300 px-4 py-2.5 text-base font-bold text-slate-800 shadow-sm hover:bg-slate-50" onClick={onLogout}>
          {t("common.signOut")}
        </button>
      </div>
    </header>
  );
}
