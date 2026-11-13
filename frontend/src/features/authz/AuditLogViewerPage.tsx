import { useI18n } from "../../i18n";
import type { TranslationKey } from "../../i18n/resources";
import { Fragment, FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import {
  authorizationRequestContext,
  readSelectedTenantId,
  setSelectedTenantId,
} from "../../api/tenantSelection";
import type { AuthzAuditLog, AuthzAuditLogFilters } from "../../types/authz";
import { useAuthzAuditLogs } from "./useAuthzAdmin";
import { PageTitle } from "../../components/layout/PageHeading";

const defaultFilters: Required<Pick<AuthzAuditLogFilters, "operation" | "decision" | "actorId" | "targetType" | "targetId" | "supportLeaseId">> & { limit: number } = {
  operation: "",
  decision: "",
  actorId: "",
  targetType: "",
  targetId: "",
  supportLeaseId: "",
  limit: 100,
};

const sensitiveOperationOptions: Array<{ value: string; key: TranslationKey }> = [
  { value: "", key: "byte354b.audit.operation.00" },
  { value: "current_accounts.zero_gold", key: "byte354b.audit.operation.01" },
  { value: "current_accounts.partial_payout", key: "byte354b.audit.operation.02" },
  { value: "current_accounts.close_journey", key: "byte354b.audit.operation.03" },
  { value: "ledger_entries.reverse", key: "byte354b.audit.operation.04" },
  { value: "ledger_entries.replace", key: "byte354b.audit.operation.05" },
  { value: "ledger_receipts.print", key: "byte354b.audit.operation.06" },
  { value: "ledger_receipts.return", key: "byte354b.audit.operation.07" },
  { value: "ledger_receipts.backfill_debit_entries", key: "byte354b.audit.operation.08" },
  { value: "authentication.accounts.create", key: "byte354b.audit.operation.09" },
  { value: "authz.actors.create", key: "byte354b.audit.operation.10" },
  { value: "authz.role_grants.create", key: "byte354b.audit.operation.11" },
  { value: "authz.role_grants.revoke", key: "byte354b.audit.operation.12" },
  { value: "authentication.accounts.security_suspend", key: "byte354b.audit.operation.13" },
  { value: "authentication.accounts.security_suspension_clear", key: "byte354b.audit.operation.14" },
  { value: "authz.actors.activate", key: "byte354b.audit.operation.15" },
  { value: "authz.actors.deactivate", key: "byte354b.audit.operation.16" },
  { value: "authz.tenant_actors.activate", key: "byte354b.audit.operation.17" },
  { value: "authz.tenant_actors.deactivate", key: "byte354b.audit.operation.18" },
  { value: "authz.tenant_role_grants.create", key: "byte354b.audit.operation.19" },
  { value: "authz.tenant_role_grants.revoke", key: "byte354b.audit.operation.20" },
  { value: "people.memberships.create", key: "byte354b.audit.operation.21" },
  { value: "people.memberships.status_change", key: "byte354b.audit.operation.22" },
  { value: "people.memberships.reactivate", key: "byte354b.audit.operation.23" },
  { value: "collaborators.journey.create", key: "byte354b.audit.operation.24" },
  { value: "collaborators.journey.close", key: "byte354b.audit.operation.25" },
  { value: "support_access_leases.request", key: "byte354b.audit.operation.26" },
  { value: "support_access_leases.approve", key: "byte354b.audit.operation.27" },
  { value: "support_access_leases.terminate", key: "byte354b.audit.operation.28" },
  { value: "support_access.use", key: "byte354b.audit.operation.29" },
];

const operationLabels = new Map(sensitiveOperationOptions.map((option) => [option.value, option.key]));

export function AuditLogViewerPage() {
  const { t, formatDateTime } = useI18n();
  const [tenantId, setTenantId] = useState(() =>
    typeof window === "undefined" ? "default" : readSelectedTenantId(window.localStorage),
  );
  const requestActor = useMemo(() => authorizationRequestContext(tenantId), [tenantId]);
  const [draftFilters, setDraftFilters] = useState(defaultFilters);
  const [filters, setFilters] = useState<AuthzAuditLogFilters>({ limit: defaultFilters.limit });

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSelectedTenantId(window.localStorage, tenantId);
    }
  }, [tenantId]);

  const auditQuery = useAuthzAuditLogs(requestActor, filters);
  const logs = useMemo(() => auditQuery.data ?? [], [auditQuery.data]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters(cleanFilters(draftFilters));
  }

  function handleReset() {
    setDraftFilters(defaultFilters);
    setFilters({ limit: defaultFilters.limit });
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t("admin.audit.administration_b8be3d")}
            </p>
            <PageTitle>{t("admin.audit.audit.log.viewer_d307e6")}</PageTitle>
            <p className="text-sm text-gray-500">
              {t("admin.audit.review.append.only.authorization.audit.events.for.sensi_8a1ba6")}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/authorization">
              {t("admin.audit.authorization_5e25ce")}
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/current-account-settings">
              {t("admin.audit.current.account.settings_ba8f33")}
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/gold-prices">
              {t("admin.audit.gold.prices_d529be")}
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/price-list-items">
              {t("admin.audit.price.list_760d09")}
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/people">
              {t("admin.audit.back.to.people_59f4cb")}
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-4 p-4">
        <ApiErrorPanel error={auditQuery.error} translate={t} />

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">{t("admin.audit.authenticated.authorization.context_baa0e6")}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {t("audit.fragments.the.session.identifies.the.actor.audit.log.acc_8dafb7")}
          </p>
          <label className="mt-4 block max-w-md text-sm font-semibold text-gray-700">
            {t("admin.audit.selected.tenant.id_f0aa67")}
            <input
              className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
            />
          </label>
        </section>

        <form className="rounded-2xl border bg-white p-4 shadow-sm" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">{t("admin.audit.sensitive.event.filters_b42a76")}</h2>
              <p className="mt-1 text-sm text-gray-500">
                {t("admin.audit.filter.by.operation.decision.actor.or.target.results.ar_371a1c")}
              </p>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
              {t("admin.audit.append.only.audit.trail_b2ca9c")}
            </span>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <label className="block text-sm font-semibold text-gray-700">
              {t("admin.audit.operation_430d32")}
              <select
                className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                value={draftFilters.operation}
                onChange={(event) => setDraftFilters((current) => ({ ...current, operation: event.target.value }))}
              >
                {sensitiveOperationOptions.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {t(option.key)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-semibold text-gray-700">
              {t("admin.audit.decision_7f59a1")}
              <select
                className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                value={draftFilters.decision}
                onChange={(event) => setDraftFilters((current) => ({ ...current, decision: event.target.value }))}
              >
                <option value="">{t("admin.audit.all.decisions_cc26b5")}</option>
                <option value="AUTHORIZED">{t("admin.audit.authorized_991f4c")}</option>
                <option value="DENIED">{t("admin.audit.denied_63b16b")}</option>
              </select>
            </label>

            <label className="block text-sm font-semibold text-gray-700">
              {t("admin.audit.limit_24d948")}
              <input
                className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                min={1}
                max={500}
                type="number"
                value={draftFilters.limit}
                onChange={(event) =>
                  setDraftFilters((current) => ({ ...current, limit: Number(event.target.value) || defaultFilters.limit }))
                }
              />
            </label>

            <label className="block text-sm font-semibold text-gray-700">
              {t("admin.audit.actor.id.key_2e9aa7")}
              <input
                className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                placeholder="bootstrap-admin"
                value={draftFilters.actorId}
                onChange={(event) => setDraftFilters((current) => ({ ...current, actorId: event.target.value }))}
              />
            </label>

            <label className="block text-sm font-semibold text-gray-700">
              {t("admin.audit.support.lease.id_c64aa5")}
              <input
                className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                placeholder={t("audit.fragments.tenant.support.access.lease.id_01e555")}
                value={draftFilters.supportLeaseId}
                onChange={(event) => setDraftFilters((current) => ({ ...current, supportLeaseId: event.target.value }))}
              />
            </label>

            <label className="block text-sm font-semibold text-gray-700">
              {t("admin.audit.target.type_a45f80")}
              <input
                className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                placeholder={t("audit.fragments.collaborator.ledger.entry.ledger.receipt_405441")}
                value={draftFilters.targetType}
                onChange={(event) => setDraftFilters((current) => ({ ...current, targetType: event.target.value }))}
              />
            </label>

            <label className="block text-sm font-semibold text-gray-700">
              {t("admin.audit.target.id_00960a")}
              <input
                className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                placeholder={t("audit.fragments.collaborator.or.ledger.entry.id_a12547")}
                value={draftFilters.targetId}
                onChange={(event) => setDraftFilters((current) => ({ ...current, targetId: event.target.value }))}
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white" type="submit">
              {t("admin.audit.apply.filters_6b2a78")}
            </button>
            <button
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800"
              type="button"
              onClick={handleReset}
            >
              {t("admin.audit.reset_44c57a")}
            </button>
            <button
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 disabled:opacity-60"
              disabled={auditQuery.isFetching}
              type="button"
              onClick={() => void auditQuery.refetch()}
            >
              {t("admin.audit.refresh_56e3ba")}
            </button>
          </div>
        </form>

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">{t("admin.audit.audit.events_9e7d8c")}</h2>
              <p className="text-sm text-gray-500">
                {auditQuery.isLoading ? t("admin.support.loading.audit.events_813d81") : t(logs.length === 1 ? "byte352.audit.oneEventShown" : "byte352.audit.eventsShown", { count: logs.length })}
              </p>
            </div>
            {auditQuery.isFetching && !auditQuery.isLoading && (
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                {t("admin.audit.refreshing_505ddd")}
              </span>
            )}
          </div>

          {!auditQuery.isLoading && logs.length === 0 && (
            <div className="mt-4 rounded-2xl border border-dashed p-6 text-center text-sm text-gray-500">
              {t("admin.audit.no.audit.logs.match.the.current.filters_74e553")}
            </div>
          )}

          {logs.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2">{t("admin.audit.when_769bb1")}</th>
                    <th className="px-3 py-2">{t("admin.audit.decision_7f59a1")}</th>
                    <th className="px-3 py-2">{t("admin.audit.operation_430d32")}</th>
                    <th className="px-3 py-2">{t("admin.audit.actor_cbd19b")}</th>
                    <th className="px-3 py-2">{t("admin.audit.target_61ad50")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => (
                    <Fragment key={log.id}>
                      <tr data-testid="audit-log-row" className="align-top">
                        <td className="whitespace-nowrap px-3 py-3 text-gray-700">{formatOptionalDateTime(log.occurredAt, formatDateTime)}</td>
                        <td className="px-3 py-3">
                          <DecisionBadge decision={log.decision} />
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-semibold text-gray-950">{operationLabel(log.operation, t)}</p>
                          <p className="mt-1 text-xs text-gray-500">{log.operation}</p>
                          {log.permissionCode && <p className="mt-1 text-xs text-gray-500">{log.permissionCode}</p>}
                        </td>
                        <td className="px-3 py-3 text-gray-700">
                          <p className="font-medium">{log.actorId || "—"}</p>
                          {log.tenantId && <p className="mt-1 text-xs text-gray-500">{t("audit.fragments.tenant_be7b76")} {log.tenantId}</p>}
                          {log.actorRecordId && <p className="mt-1 text-xs text-gray-500">{t("audit.fragments.record_9b5e24")} {log.actorRecordId}</p>}
                          {log.supportLeaseId && (
                            <p className="mt-1 break-all text-xs font-semibold text-amber-700">
                              {t("audit.fragments.support.lease_b18df5")} {log.supportLeaseId}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-gray-700">
                          <p>{log.targetType || "—"}</p>
                          {log.targetId && <p className="mt-1 break-all text-xs text-gray-500">{log.targetId}</p>}
                        </td>
                      </tr>
                      <tr data-testid="audit-log-evidence-row">
                        <td colSpan={5} className="bg-gray-50/60 px-3 pb-4 pt-2 text-gray-700">
                          <div className="min-w-0 rounded-lg border border-gray-200 bg-white p-3">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                              {t("admin.audit.evidence_7ea014")}
                            </p>
                            <AuditEvidence log={log} />
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function AuditEvidence({ log }: { log: AuthzAuditLog }) {
  const { t, formatDateTime } = useI18n();
  const metadata = parseMetadata(log.metadataJson);
  const items = auditEvidenceItems(log, metadata, t, formatDateTime);

  if (items.length === 0 && !log.metadataJson) {
    return <span className="text-gray-500">{t("admin.audit.no.extra.evidence.recorded_2a416c")}</span>;
  }

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <dl className="space-y-1">
          {items.map((item) => (
            <div key={item.label}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{item.label}</dt>
              <dd className="break-all text-sm text-gray-800">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {log.metadataJson && (
        <details className="rounded-xl bg-gray-50 p-2 text-xs text-gray-600">
          <summary className="cursor-pointer font-semibold">{t("admin.audit.raw.metadata_21770c")}</summary>
          <pre className="mt-2 max-w-md overflow-x-auto whitespace-pre-wrap break-words">{prettyMetadata(log.metadataJson)}</pre>
        </details>
      )}
    </div>
  );
}

function DecisionBadge({ decision }: { decision: string }) {
  const { t } = useI18n();
  const normalized = decision.toUpperCase();
  const className =
    normalized === "AUTHORIZED"
      ? "rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700"
      : normalized === "DENIED"
        ? "rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700"
        : "rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700";

  return <span className={className}>{normalized || "UNKNOWN"}</span>;
}

type Metadata = Record<string, unknown>;

function auditEvidenceItems(
  log: AuthzAuditLog,
  metadata: Metadata,
  t: ReturnType<typeof useI18n>["t"],
  formatDateTime: (date: Date) => string,
): Array<{ label: string; value: string }> {
  const items: Array<{ label: string; value: string }> = [];

  if (log.accountId) items.push({ label: t("byte354b.audit.evidence.00"), value: log.accountId });
  if (log.actorScope) items.push({ label: t("byte354b.audit.evidence.01"), value: log.actorScope });
  if (log.personId) items.push({ label: t("byte354b.audit.evidence.02"), value: log.personId });
  if (log.membershipId) items.push({ label: t("byte354b.audit.evidence.03"), value: log.membershipId });
  if (log.sessionId) items.push({ label: t("byte354b.audit.evidence.04"), value: log.sessionId });
  if (log.correlationId) items.push({ label: t("byte354b.audit.evidence.05"), value: log.correlationId });
  if (log.authorizationSource) {
    items.push({
      label: t("byte354b.audit.evidence.06"),
      value: [log.authorizationSource, log.authorizationRoleCode, log.authorizationSourceId]
        .filter(Boolean)
        .join(" · "),
    });
  }

  if (log.reason) {
    items.push({ label: t("byte354b.audit.evidence.07"), value: log.reason });
  }

  const reasonCode = stringValue(metadata.reasonCode);
  const reasonText = stringValue(metadata.reasonText);
  if (reasonCode) items.push({ label: t("byte354b.audit.evidence.08"), value: reasonCode });
  if (reasonText) items.push({ label: t("byte354b.audit.evidence.09"), value: reasonText });

  const recentReauthentication = recordValue(metadata.recentReauthentication);
  if (recentReauthentication) {
    const method = stringValue(recentReauthentication.method);
    const authenticatedAt = stringValue(recentReauthentication.authenticatedAt);
    items.push({
      label: t("byte354b.audit.evidence.10"),
      value: [method, formatOptionalDateTime(authenticatedAt, formatDateTime)].filter(Boolean).join(" · ") || t("byte354b.audit.evidence.11"),
    });
  }

  const secondApproval = recordValue(metadata.secondApproval);
  if (secondApproval) {
    const approvedBy = stringValue(secondApproval.approvedBy);
    const notes = stringValue(secondApproval.notes);
    items.push({
      label: t("byte354b.audit.evidence.12"),
      value: [approvedBy, notes].filter(Boolean).join(" · ") || t("byte354b.audit.evidence.11"),
    });
  }

  if (log.requestMethod || log.requestPath) {
    items.push({
      label: t("byte354b.audit.evidence.13"),
      value: [log.requestMethod, log.requestPath].filter(Boolean).join(" "),
    });
  }

  return items;
}

function parseMetadata(metadataJson: string | undefined): Metadata {
  if (!metadataJson) return {};

  try {
    const parsed = JSON.parse(metadataJson) as unknown;
    return recordValue(parsed) ?? {};
  } catch {
    return {};
  }
}

function recordValue(value: unknown): Metadata | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Metadata;
  }
  return undefined;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function prettyMetadata(metadataJson: string): string {
  try {
    return JSON.stringify(JSON.parse(metadataJson), null, 2);
  } catch {
    return metadataJson;
  }
}

function operationLabel(operation: string, t: ReturnType<typeof useI18n>["t"]): string {
  const key = operationLabels.get(operation);
  return key ? t(key) : operation || t("byte354b.audit.unknown");
}

function cleanFilters(filters: typeof defaultFilters): AuthzAuditLogFilters {
  return {
    operation: filters.operation.trim() || undefined,
    decision: filters.decision.trim() || undefined,
    actorId: filters.actorId.trim() || undefined,
    targetType: filters.targetType.trim() || undefined,
    targetId: filters.targetId.trim() || undefined,
    supportLeaseId: filters.supportLeaseId.trim() || undefined,
    limit: clampLimit(filters.limit),
  };
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return defaultFilters.limit;
  return Math.min(500, Math.max(1, Math.trunc(limit)));
}

function formatOptionalDateTime(value: string | undefined, formatDateTime: (date: Date) => string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatDateTime(date);
}
