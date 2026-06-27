import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import type { AuthzAdminRequestActor, AuthzAuditLog, AuthzAuditLogFilters } from "../../types/authz";
import { useAuthzAuditLogs } from "./useAuthzAdmin";

const SESSION_STORAGE_KEY = "ers.authzAdmin.requestActor";

const defaultRequestActor: AuthzAdminRequestActor = {
  actorId: "bootstrap-admin",
  tenantId: "default",
};

const defaultFilters: Required<Pick<AuthzAuditLogFilters, "operation" | "decision" | "actorId" | "targetType" | "targetId">> & { limit: number } = {
  operation: "",
  decision: "",
  actorId: "",
  targetType: "",
  targetId: "",
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
  { value: "authz.actors.create", label: "Authorization actor created" },
  { value: "authz.role_grants.create", label: "Authorization role granted" },
  { value: "authz.role_grants.revoke", label: "Authorization role revoked" },
];

const operationLabels = new Map(sensitiveOperationOptions.map((option) => [option.value, option.label]));

export function AuditLogViewerPage() {
  const [requestActor, setRequestActor] = useState<AuthzAdminRequestActor>(() => loadRequestActor());
  const [draftFilters, setDraftFilters] = useState(defaultFilters);
  const [filters, setFilters] = useState<AuthzAuditLogFilters>({ limit: defaultFilters.limit });

  useEffect(() => {
    saveRequestActor(requestActor);
  }, [requestActor]);

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
              Administration
            </p>
            <h1 className="text-xl font-bold text-gray-950">Audit Log Viewer</h1>
            <p className="text-sm text-gray-500">
              Review append-only authorization audit events for sensitive current-account, receipt, and authorization workflows.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/authorization">
              Authorization
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/current-account-settings">
              Current Account Settings
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/gold-prices">
              Gold Prices
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/price-list-items">
              Price List
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/people">
              Back to People
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-4 p-4">
        <ApiErrorPanel error={auditQuery.error} />

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">Admin request actor</h2>
          <p className="mt-1 text-sm text-gray-500">
            These headers are sent to the audit-log endpoint. Use an actor with authorization read permission.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="block text-sm font-semibold text-gray-700">
              Actor ID / key
              <input
                className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                value={requestActor.actorId}
                onChange={(event) =>
                  setRequestActor((current) => ({ ...current, actorId: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm font-semibold text-gray-700">
              Tenant ID
              <input
                className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                value={requestActor.tenantId}
                onChange={(event) =>
                  setRequestActor((current) => ({ ...current, tenantId: event.target.value }))
                }
              />
            </label>
          </div>
        </section>

        <form className="rounded-2xl border bg-white p-4 shadow-sm" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">Sensitive event filters</h2>
              <p className="mt-1 text-sm text-gray-500">
                Filter by operation, decision, actor, or target. Results are newest first and read-only.
              </p>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
              Append-only audit trail
            </span>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <label className="block text-sm font-semibold text-gray-700">
              Operation
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
              Decision
              <select
                className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                value={draftFilters.decision}
                onChange={(event) => setDraftFilters((current) => ({ ...current, decision: event.target.value }))}
              >
                <option value="">All decisions</option>
                <option value="AUTHORIZED">Authorized</option>
                <option value="DENIED">Denied</option>
              </select>
            </label>

            <label className="block text-sm font-semibold text-gray-700">
              Limit
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
              Actor ID / key
              <input
                className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                placeholder="bootstrap-admin"
                value={draftFilters.actorId}
                onChange={(event) => setDraftFilters((current) => ({ ...current, actorId: event.target.value }))}
              />
            </label>

            <label className="block text-sm font-semibold text-gray-700">
              Target type
              <input
                className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                placeholder="collaborator, ledger_entry, ledger_receipt"
                value={draftFilters.targetType}
                onChange={(event) => setDraftFilters((current) => ({ ...current, targetType: event.target.value }))}
              />
            </label>

            <label className="block text-sm font-semibold text-gray-700">
              Target ID
              <input
                className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                placeholder="collaborator or ledger entry id"
                value={draftFilters.targetId}
                onChange={(event) => setDraftFilters((current) => ({ ...current, targetId: event.target.value }))}
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white" type="submit">
              Apply Filters
            </button>
            <button
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800"
              type="button"
              onClick={handleReset}
            >
              Reset
            </button>
            <button
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 disabled:opacity-60"
              disabled={auditQuery.isFetching}
              type="button"
              onClick={() => void auditQuery.refetch()}
            >
              Refresh
            </button>
          </div>
        </form>

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">Audit events</h2>
              <p className="text-sm text-gray-500">
                {auditQuery.isLoading ? "Loading audit events..." : `${logs.length} event${logs.length === 1 ? "" : "s"} shown`}
              </p>
            </div>
            {auditQuery.isFetching && !auditQuery.isLoading && (
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                Refreshing
              </span>
            )}
          </div>

          {!auditQuery.isLoading && logs.length === 0 && (
            <div className="mt-4 rounded-2xl border border-dashed p-6 text-center text-sm text-gray-500">
              No audit logs match the current filters.
            </div>
          )}

          {logs.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2">When</th>
                    <th className="px-3 py-2">Decision</th>
                    <th className="px-3 py-2">Operation</th>
                    <th className="px-3 py-2">Actor</th>
                    <th className="px-3 py-2">Target</th>
                    <th className="px-3 py-2">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => (
                    <tr key={log.id} data-testid="audit-log-row" className="align-top">
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
                        {log.tenantId && <p className="mt-1 text-xs text-gray-500">Tenant: {log.tenantId}</p>}
                        {log.actorRecordId && <p className="mt-1 text-xs text-gray-500">Record: {log.actorRecordId}</p>}
                      </td>
                      <td className="px-3 py-3 text-gray-700">
                        <p>{log.targetType || "—"}</p>
                        {log.targetId && <p className="mt-1 break-all text-xs text-gray-500">{log.targetId}</p>}
                      </td>
                      <td className="min-w-72 px-3 py-3 text-gray-700">
                        <AuditEvidence log={log} />
                      </td>
                    </tr>
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
  const metadata = parseMetadata(log.metadataJson);
  const items = auditEvidenceItems(log, metadata);

  if (items.length === 0 && !log.metadataJson) {
    return <span className="text-gray-500">No extra evidence recorded.</span>;
  }

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <dl className="space-y-1">
          {items.map((item) => (
            <div key={item.label}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{item.label}</dt>
              <dd className="break-words text-sm text-gray-800">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {log.metadataJson && (
        <details className="rounded-xl bg-gray-50 p-2 text-xs text-gray-600">
          <summary className="cursor-pointer font-semibold">Raw metadata</summary>
          <pre className="mt-2 max-w-md overflow-x-auto whitespace-pre-wrap break-words">{prettyMetadata(log.metadataJson)}</pre>
        </details>
      )}
    </div>
  );
}

function DecisionBadge({ decision }: { decision: string }) {
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

function saveRequestActor(requestActor: AuthzAdminRequestActor) {
  if (typeof window === "undefined") return;

  const storage = window.localStorage;
  if (typeof storage?.setItem !== "function") return;

  try {
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(requestActor));
  } catch {
    // localStorage may be unavailable in some test/runtime contexts.
  }
}

function loadRequestActor(): AuthzAdminRequestActor {
  if (typeof window === "undefined") return defaultRequestActor;

  const storage = window.localStorage;
  if (typeof storage?.getItem !== "function") return defaultRequestActor;

  try {
    const stored = storage.getItem(SESSION_STORAGE_KEY);
    if (!stored) return defaultRequestActor;
    const parsed = JSON.parse(stored) as Partial<AuthzAdminRequestActor>;
    return {
      actorId: typeof parsed.actorId === "string" && parsed.actorId.trim() ? parsed.actorId : defaultRequestActor.actorId,
      tenantId: typeof parsed.tenantId === "string" && parsed.tenantId.trim() ? parsed.tenantId : defaultRequestActor.tenantId,
    };
  } catch {
    return defaultRequestActor;
  }
}
