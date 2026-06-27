import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import type { AuthzAdminRequestActor } from "../../types/authz";
import {
  useSecondPersonApprovalPolicy,
  useUpdateSecondPersonApprovalPolicy,
} from "./useSecondPersonApprovalPolicy";

const SESSION_STORAGE_KEY = "ers.authzAdmin.requestActor";

const defaultRequestActor: AuthzAdminRequestActor = {
  actorId: "bootstrap-admin",
  tenantId: "default",
};

export function SecondPersonApprovalSettingsPage() {
  const [requestActor, setRequestActor] = useState<AuthzAdminRequestActor>(() =>
    loadRequestActor(),
  );
  const [required, setRequired] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    saveRequestActor(requestActor);
  }, [requestActor]);

  const policyQuery = useSecondPersonApprovalPolicy(requestActor);
  const updatePolicy = useUpdateSecondPersonApprovalPolicy(requestActor);

  useEffect(() => {
    if (policyQuery.data) {
      setRequired(policyQuery.data.required);
    }
  }, [policyQuery.data]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage("");
    updatePolicy.reset();

    try {
      const updated = await updatePolicy.mutateAsync({ required });
      setSuccessMessage(
        updated.required
          ? "Second-person approval is now required for sensitive current-account operations."
          : "Second-person approval is now optional for sensitive current-account operations.",
      );
    } catch {
      // Mutation error is rendered by ApiErrorPanel.
    }
  }

  const queryError = policyQuery.error;
  const actionError = updatePolicy.error;
  const hasChanges = Boolean(policyQuery.data && policyQuery.data.required !== required);

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Administration
            </p>
            <h1 className="text-xl font-bold text-gray-950">Current Account Settings</h1>
            <p className="text-sm text-gray-500">
              Configure tenant-level approval rules for sensitive current-account workflows.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/authorization">
              Authorization
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/audit-logs">
              Audit Logs
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/reference-data">
              Reference Data
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

      <section className="mx-auto max-w-5xl space-y-4 p-4">
        {successMessage && (
          <div role="status" className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800">
            {successMessage}
          </div>
        )}

        <ApiErrorPanel error={queryError ?? actionError} />

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">Admin request actor</h2>
          <p className="mt-1 text-sm text-gray-500">
            These headers are sent to the settings endpoints. Use an actor with current_accounts.settings.read and current_accounts.settings.update.
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
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">Second-person approval</h2>
              <p className="mt-1 text-sm text-gray-500">
                Controls whether sensitive current-account operations must include a different approver in addition to the primary actor.
              </p>
            </div>
            <PolicyStatus required={policyQuery.data?.required} isLoading={policyQuery.isLoading} />
          </div>

          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Operational warning</p>
            <p className="mt-1">
              When this policy is enabled, sensitive workflows such as ledger corrections, journey settlements, gold zeroing, payout corrections, and receipt backfills must capture a valid second approver. The second approver cannot be the same actor performing the operation.
            </p>
          </div>

          {policyQuery.isLoading && <p className="mt-4 text-sm text-gray-500">Loading policy...</p>}

          <label className="mt-4 flex items-start gap-3 rounded-2xl border p-4 text-sm font-semibold text-gray-800">
            <input
              className="mt-1"
              checked={required}
              disabled={policyQuery.isLoading || updatePolicy.isPending}
              type="checkbox"
              onChange={(event) => setRequired(event.target.checked)}
            />
            <span>
              Require second-person approval for sensitive current-account operations
              <span className="mt-1 block font-normal text-gray-500">
                Leave disabled to make second approval optional but still accepted and audited when provided.
              </span>
            </span>
          </label>

          <dl className="mt-4 grid gap-3 rounded-2xl bg-gray-50 p-4 text-sm md:grid-cols-3">
            <div>
              <dt className="font-semibold text-gray-700">Tenant</dt>
              <dd className="mt-1 text-gray-600">{policyQuery.data?.tenantId ?? requestActor.tenantId}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-700">Last updated by</dt>
              <dd className="mt-1 text-gray-600">{policyQuery.data?.updatedBy || "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-700">Last updated at</dt>
              <dd className="mt-1 text-gray-600">{formatDateTime(policyQuery.data?.updatedAt)}</dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={policyQuery.isLoading || updatePolicy.isPending || !hasChanges}
              type="submit"
            >
              {updatePolicy.isPending ? "Saving..." : "Save Policy"}
            </button>
            <button
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 disabled:opacity-60"
              disabled={policyQuery.isLoading || updatePolicy.isPending || !hasChanges}
              type="button"
              onClick={() => setRequired(policyQuery.data?.required ?? false)}
            >
              Reset
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

function PolicyStatus({ required, isLoading }: { required?: boolean; isLoading: boolean }) {
  if (isLoading || typeof required !== "boolean") {
    return (
      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
        Loading
      </span>
    );
  }

  return (
    <span className={required ? "rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700" : "rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700"}>
      {required ? "Required" : "Optional"}
    </span>
  );
}

function saveRequestActor(requestActor: AuthzAdminRequestActor) {
  if (typeof window === "undefined") return;

  const storage = window.localStorage;
  if (typeof storage?.setItem !== "function") return;

  try {
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(requestActor));
  } catch {
    // Persisting this convenience preference is best-effort only.
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
      actorId: typeof parsed.actorId === "string" && parsed.actorId ? parsed.actorId : defaultRequestActor.actorId,
      tenantId: typeof parsed.tenantId === "string" && parsed.tenantId ? parsed.tenantId : defaultRequestActor.tenantId,
    };
  } catch {
    return defaultRequestActor;
  }
}

function formatDateTime(value: string | undefined) {
  if (!value) return "—";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString();
}
