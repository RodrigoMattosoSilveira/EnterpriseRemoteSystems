import { useI18n } from "../../i18n";
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

const sensitiveOperationOptions = [
  { value: "", label: "All sensitive and authorization events" },
  { value: "current_accounts.zero_gold", label: "Zero gold settlement" },
  { value: "current_accounts.partial_payout", label: "Partial payout" },
  { value: "current_accounts.close_journey", label: "Close journey settlement" },
  { value: "ledger_entries.reverse", label: "Ledger reversal" },
  { value: "ledger_entries.replace", label: "Ledger replacement" },
  { value: "ledger_receipts.print", label: "Receipt print" },
  { value: "ledger_receipts.return", label: "Receipt return" },
  { value: "ledger_receipts.backfill_debit_entries", label: "Receipt debit-ledger backfill" },
  { value: "authentication.accounts.create", label: "Authentication Account created" },
  { value: "authz.actors.create", label: "Authorization actor created" },
  { value: "authz.role_grants.create", label: "Authorization role granted" },
  { value: "authz.role_grants.revoke", label: "Authorization role revoked" },
  { value: "authentication.accounts.security_suspend", label: "Authentication Account suspended" },
  { value: "authentication.accounts.security_suspension_clear", label: "Authentication Account suspension cleared" },
  { value: "authz.actors.activate", label: "Authorization Actor activated" },
  { value: "authz.actors.deactivate", label: "Authorization Actor deactivated" },
  { value: "authz.tenant_actors.activate", label: "Tenant Actor activated" },
  { value: "authz.tenant_actors.deactivate", label: "Tenant Actor deactivated" },
  { value: "authz.tenant_role_grants.create", label: "Tenant Role Grant created" },
  { value: "authz.tenant_role_grants.revoke", label: "Tenant Role Grant revoked" },
  { value: "people.memberships.create", label: "Person–Tenant Membership created" },
  { value: "people.memberships.status_change", label: "Person–Tenant Membership status changed" },
  { value: "people.memberships.reactivate", label: "Person–Tenant Membership reactivated" },
  { value: "collaborators.journey.create", label: "Collaborator Journey created" },
  { value: "collaborators.journey.close", label: "Collaborator Journey closed" },
  { value: "support_access_leases.request", label: "Support lease requested" },
  { value: "support_access_leases.approve", label: "Support lease approved" },
  { value: "support_access_leases.terminate", label: "Support lease terminated" },
  { value: "support_access.use", label: "Support-authorized request" },
];

const operationLabels = new Map(sensitiveOperationOptions.map((option) => [option.value, option.label]));

export function AuditLogViewerPage() {
  const { t } = useI18n();
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
        <ApiErrorPanel error={auditQuery.error} />

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
                    {option.label}
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
                {auditQuery.isLoading ? "Loading audit events..." : `${logs.length} event${logs.length === 1 ? "" : "s"} shown`}
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
                        <td className="whitespace-nowrap px-3 py-3 text-gray-700">{formatDateTime(log.occurredAt)}</td>
                        <td className="px-3 py-3">
                          <DecisionBadge decision={log.decision} />
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-semibold text-gray-950">{operationLabel(log.operation)}</p>
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
  const { t } = useI18n();
  const metadata = parseMetadata(log.metadataJson);
  const items = auditEvidenceItems(log, metadata);

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

function auditEvidenceItems(log: AuthzAuditLog, metadata: Metadata): Array<{ label: string; value: string }> {
  const items: Array<{ label: string; value: string }> = [];

  if (log.accountId) items.push({ label: "Authentication Account", value: log.accountId });
  if (log.actorScope) items.push({ label: "Actor scope", value: log.actorScope });
  if (log.personId) items.push({ label: "Acting Person", value: log.personId });
  if (log.membershipId) items.push({ label: "Acting Membership", value: log.membershipId });
  if (log.sessionId) items.push({ label: "Session", value: log.sessionId });
  if (log.correlationId) items.push({ label: "Correlation", value: log.correlationId });
  if (log.authorizationSource) {
    items.push({
      label: "Authorization source",
      value: [log.authorizationSource, log.authorizationRoleCode, log.authorizationSourceId]
        .filter(Boolean)
        .join(" · "),
    });
  }

  if (log.reason) {
    items.push({ label: "Decision reason", value: log.reason });
  }

  const reasonCode = stringValue(metadata.reasonCode);
  const reasonText = stringValue(metadata.reasonText);
  if (reasonCode) items.push({ label: "Reason code", value: reasonCode });
  if (reasonText) items.push({ label: "Reason text", value: reasonText });

  const recentReauthentication = recordValue(metadata.recentReauthentication);
  if (recentReauthentication) {
    const method = stringValue(recentReauthentication.method);
    const authenticatedAt = stringValue(recentReauthentication.authenticatedAt);
    items.push({
      label: "Recent reauthentication",
      value: [method, formatDateTime(authenticatedAt)].filter(Boolean).join(" · ") || "Recorded",
    });
  }

  const secondApproval = recordValue(metadata.secondApproval);
  if (secondApproval) {
    const approvedBy = stringValue(secondApproval.approvedBy);
    const notes = stringValue(secondApproval.notes);
    items.push({
      label: "Second approval",
      value: [approvedBy, notes].filter(Boolean).join(" · ") || "Recorded",
    });
  }

  if (log.requestMethod || log.requestPath) {
    items.push({
      label: "Request",
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

function operationLabel(operation: string): string {
  return operationLabels.get(operation) || operation || "Unknown operation";
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

function formatDateTime(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
