import { useI18n } from "../../i18n";
import { FormEvent, useEffect, useMemo, useState } from "react";
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
import { PageTitle } from "../../components/layout/PageHeading";

export function SecondPersonApprovalSettingsPage() {
  const { t, formatDateTime } = useI18n();
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
          ? t("byte352.approval.requiredConfirmation")
          : t("byte352.approval.optionalConfirmation"),
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
              {t("approval.settings.administration_b8be3d")}
            </p>
            <PageTitle>{t("approval.settings.current.account.settings_ba8f33")}</PageTitle>
            <p className="text-sm text-gray-500">
              {t("approval.settings.configure.tenant.level.approval.rules.for.sensitive.current.accou_47a065")}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/authorization">
              {t("approval.settings.authorization_5e25ce")}
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/audit-logs">
              {t("approval.settings.audit.logs_344c7f")}
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/reference-data">
              {t("approval.settings.reference.data_3d3f15")}
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/gold-prices">
              {t("approval.settings.gold.prices_d529be")}
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/price-list-items">
              {t("approval.settings.price.list_760d09")}
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/people">
              {t("approval.settings.back.to.people_59f4cb")}
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

        <ApiErrorPanel error={queryError ?? actionError} translate={t} />

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">{t("approval.settings.authenticated.authorization.context_baa0e6")}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {t("approval.settings.the.session.identifies.the.actor.the.selected.tenant.is.sent.as.a_c6473d")}
          </p>
          <label className="mt-4 block max-w-md text-sm font-semibold text-gray-700">
            {t("approval.settings.selected.tenant.id_f0aa67")}
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
              <h2 className="text-lg font-semibold text-gray-950">{t("approval.settings.second.person.approval_82c45d")}</h2>
              <p className="mt-1 text-sm text-gray-500">
                {t("approval.settings.controls.whether.sensitive.current.account.operations.must.includ_cfe6fe")}
              </p>
            </div>
            <PolicyStatus required={policyQuery.data?.required} isLoading={policyQuery.isLoading} />
          </div>

          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">{t("approval.settings.operational.warning_50d77c")}</p>
            <p className="mt-1">
              {t("approval.settings.when.this.policy.is.enabled.sensitive.workflows.such.as.ledger.co_624f31")}
            </p>
          </div>

          {policyQuery.isLoading && <p className="mt-4 text-sm text-gray-500">{t("approval.settings.loading.policy_d746e7")}</p>}

          <label className="mt-4 flex items-start gap-3 rounded-2xl border p-4 text-sm font-semibold text-gray-800">
            <input
              className="mt-1"
              checked={required}
              disabled={policyQuery.isLoading || updatePolicy.isPending}
              type="checkbox"
              onChange={(event) => setRequired(event.target.checked)}
            />
            <span>
              {t("approval.settings.require.second.person.approval.for.sensitive.current.account.oper_acef44")}
              <span className="mt-1 block font-normal text-gray-500">
                {t("approval.settings.leave.disabled.to.make.second.approval.optional.but.still.accepte_e67657")}
              </span>
            </span>
          </label>

          <dl className="mt-4 grid gap-3 rounded-2xl bg-gray-50 p-4 text-sm md:grid-cols-3">
            <div>
              <dt className="font-semibold text-gray-700">{t("approval.settings.tenant_3ca93c")}</dt>
              <dd className="mt-1 text-gray-600">{policyQuery.data?.tenantId ?? tenantId}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-700">{t("approval.settings.last.updated.by_ae6fff")}</dt>
              <dd className="mt-1 text-gray-600">{policyQuery.data?.updatedBy || "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-700">{t("approval.settings.last.updated.at_4cfb2f")}</dt>
              <dd className="mt-1 text-gray-600">{formatOptionalDateTime(policyQuery.data?.updatedAt, formatDateTime)}</dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={policyQuery.isLoading || updatePolicy.isPending || !hasChanges}
              type="submit"
            >
              {updatePolicy.isPending ? t("byte352.approval.saving") : t("byte352.approval.save")}
            </button>
            <button
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 disabled:opacity-60"
              disabled={policyQuery.isLoading || updatePolicy.isPending || !hasChanges}
              type="button"
              onClick={() => setRequired(policyQuery.data?.required ?? false)}
            >
              {t("approval.settings.reset_44c57a")}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

function PolicyStatus({ required, isLoading }: { required?: boolean; isLoading: boolean }) {
  const { t } = useI18n();
  if (isLoading || typeof required !== "boolean") {
    return (
      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
        {t("approval.settings.loading_8f26c6")}
      </span>
    );
  }

  return (
    <span className={required ? "rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700" : "rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700"}>
      {required ? t("byte352.approval.required") : t("byte352.approval.optional")}
    </span>
  );
}

function formatOptionalDateTime(value: string | undefined, formatDateTime: (date: Date) => string) {
  if (!value) return "—";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return formatDateTime(parsed);
}
