import { FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import {
  authorizationRequestContext,
  readSelectedTenantId,
  setSelectedTenantId,
} from "../../api/tenantSelection";
import {
  useSecondPersonApprovalPolicy,
  useUpdateSecondPersonApprovalPolicy,
} from "./useSecondPersonApprovalPolicy";

export function SecondPersonApprovalSettingsPage() {
  const { t } = useTranslation("currentAccounts");
  const [tenantId, setTenantId] = useState(() =>
    typeof window === "undefined" ? "default" : readSelectedTenantId(window.localStorage),
  );
  const requestActor = useMemo(() => authorizationRequestContext(tenantId), [tenantId]);
  const [required, setRequired] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSelectedTenantId(window.localStorage, tenantId);
    }
  }, [tenantId]);

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
          ? t("settings.flash.required")
          : t("settings.flash.optional"),
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
              {t("settings.header.badge")}
            </p>
            <h1 className="text-xl font-bold text-gray-950">{t("settings.header.title")}</h1>
            <p className="text-sm text-gray-500">
              {t("settings.header.subtitle")}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/authorization">
              {t("settings.nav.authorization")}
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/audit-logs">
              {t("settings.nav.auditLogs")}
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/reference-data">
              {t("settings.nav.referenceData")}
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/gold-prices">
              {t("settings.nav.goldPrices")}
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/price-list-items">
              {t("settings.nav.priceList")}
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/people">
              {t("settings.nav.backToPeople")}
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
          <h2 className="text-lg font-semibold text-gray-950">{t("settings.context.title")}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {t("settings.context.description")}
          </p>
          <label className="mt-4 block max-w-md text-sm font-semibold text-gray-700">
            {t("settings.context.selectedTenant")}
            <input
              className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
            />
          </label>
        </section>

        <form className="rounded-2xl border bg-white p-4 shadow-sm" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">{t("settings.policy.title")}</h2>
              <p className="mt-1 text-sm text-gray-500">
                {t("settings.policy.description")}
              </p>
            </div>
            <PolicyStatus required={policyQuery.data?.required} isLoading={policyQuery.isLoading} />
          </div>

          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">{t("settings.warning.title")}</p>
            <p className="mt-1">
              {t("settings.warning.description")}
            </p>
          </div>

          {policyQuery.isLoading && <p className="mt-4 text-sm text-gray-500">{t("settings.policy.loading")}</p>}

          <label className="mt-4 flex items-start gap-3 rounded-2xl border p-4 text-sm font-semibold text-gray-800">
            <input
              className="mt-1"
              checked={required}
              disabled={policyQuery.isLoading || updatePolicy.isPending}
              type="checkbox"
              onChange={(event) => setRequired(event.target.checked)}
            />
            <span>
              {t("settings.policy.toggleLabel")}
              <span className="mt-1 block font-normal text-gray-500">
                {t("settings.policy.toggleHelp")}
              </span>
            </span>
          </label>

          <dl className="mt-4 grid gap-3 rounded-2xl bg-gray-50 p-4 text-sm md:grid-cols-3">
            <div>
              <dt className="font-semibold text-gray-700">{t("settings.meta.tenant")}</dt>
              <dd className="mt-1 text-gray-600">{policyQuery.data?.tenantId ?? tenantId}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-700">{t("settings.meta.updatedBy")}</dt>
              <dd className="mt-1 text-gray-600">{policyQuery.data?.updatedBy || t("settings.meta.empty")}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-700">{t("settings.meta.updatedAt")}</dt>
              <dd className="mt-1 text-gray-600">{formatDateTime(policyQuery.data?.updatedAt)}</dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={policyQuery.isLoading || updatePolicy.isPending || !hasChanges}
              type="submit"
            >
              {updatePolicy.isPending ? t("settings.actions.saving") : t("settings.actions.save")}
            </button>
            <button
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 disabled:opacity-60"
              disabled={policyQuery.isLoading || updatePolicy.isPending || !hasChanges}
              type="button"
              onClick={() => setRequired(policyQuery.data?.required ?? false)}
            >
              {t("settings.actions.reset")}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

function PolicyStatus({ required, isLoading }: { required?: boolean; isLoading: boolean }) {
  const { t } = useTranslation("currentAccounts");
  if (isLoading || typeof required !== "boolean") {
    return (
      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
        {t("settings.policy.status.loading")}
      </span>
    );
  }

  return (
    <span className={required ? "rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700" : "rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700"}>
      {required ? t("settings.policy.status.required") : t("settings.policy.status.optional")}
    </span>
  );
}

function formatDateTime(value: string | undefined) {
  if (!value) return "—";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString();
}
