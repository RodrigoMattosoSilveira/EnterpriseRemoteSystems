import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import type { CreateTenantInput, Tenant, TenantOperationalStatus } from "../../types/tenants";
import { useCreateTenant, useTenants } from "./useTenants";
import { PageContextHeading, PageTitle } from "../../components/layout/PageHeading";
import { useOptionalAuthorizationContext } from "../../components/layout/AuthorizationContext";
import { ReactivationRequestsAlert } from "../auth/ReactivationRequestsAlert";
import { useI18n } from "../../i18n";

const emptyForm: CreateTenantInput = {
  code: "",
  name: "",
  description: "",
  active: true,
};

export function TenantsAdminPage() {
  const { t } = useI18n();
  const actor = useOptionalAuthorizationContext();
  const isApplicationAdministrator =
    actor?.scope === "APPLICATION" && actor.roleCodes.includes("APPLICATION_ADMIN");
  const [form, setForm] = useState<CreateTenantInput>(emptyForm);
  const [tenantFilter, setTenantFilter] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const tenantsQuery = useTenants();
  const createMutation = useCreateTenant();
  const createError = createMutation.error;
  const tenantCodeError =
    createError instanceof ApiError ? createError.fields?.code : undefined;
  const createFormError = tenantCodeError ? null : createError;

  const allTenants = useMemo(
    () => [...(tenantsQuery.data ?? [])].sort((a, b) => a.code.localeCompare(b.code)),
    [tenantsQuery.data],
  );
  const tenants = useMemo(() => {
    const normalizedFilter = tenantFilter.trim().toLocaleLowerCase();
    if (!normalizedFilter) return allTenants;

    return allTenants.filter((tenant) =>
      [tenant.name, tenant.code, tenant.id, tenant.description ?? ""].some((value) =>
        value.toLocaleLowerCase().includes(normalizedFilter),
      ),
    );
  }, [allTenants, tenantFilter]);
  const hasTenantFilter = tenantFilter.trim().length > 0;

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage("");
    createMutation.reset();
    try {
      const created = await createMutation.mutateAsync({
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description?.trim(),
        active: form.active ?? true,
      });
      setForm(emptyForm);
      setSuccessMessage(t("admin.tenants.created", { name: created.name }));
    } catch {
      // Mutation error is rendered in the Create Tenant card.
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <PageTitle>{t("common.administration")}</PageTitle>
            <PageContextHeading>{t("common.tenants")}</PageContextHeading>
            <p className="mt-1 text-sm text-gray-500">
              {t("admin.tenants.description")}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 text-sm font-semibold text-gray-700">
            {isApplicationAdministrator ? (
              <>
                <Link className="underline" to="/admin/authentication">{t("common.authentication")}</Link>
                <Link className="underline" to="/admin/authorization">{t("common.authorization")}</Link>
                <Link className="underline" to="/admin/audit-logs">{t("common.auditLogs")}</Link>
              </>
            ) : (
              <>
                <Link className="underline" to="/admin/authorization">{t("common.authorization")}</Link>
                <Link className="underline" to="/admin/reference-data">{t("common.referenceData")}</Link>
                <Link className="underline" to="/people">{t("common.backToPeople")}</Link>
              </>
            )}
          </div>
        </div>
      </header>

      {isApplicationAdministrator && (
        <section className="mx-auto max-w-6xl px-4 pt-4">
          <ReactivationRequestsAlert />
        </section>
      )}

      <section className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[22rem_1fr]">
        <form className="h-fit rounded-2xl border bg-white p-5 shadow-sm" onSubmit={handleCreate}>
          <h2 className="text-lg font-semibold text-gray-950">{t("admin.tenants.create.title")}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {t("admin.tenants.create.description")}
          </p>

          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm font-medium text-gray-700">
              {t("common.code")}
              <input
                className="rounded-xl border border-gray-300 px-3 py-2"
                maxLength={32}
                aria-describedby={tenantCodeError ? "tenant-code-error" : undefined}
                aria-invalid={Boolean(tenantCodeError)}
                onChange={(event) => {
                  createMutation.reset();
                  setForm({ ...form, code: event.target.value });
                }}
                placeholder="NORTH_SITE"
                required
                value={form.code}
              />
              {tenantCodeError && (
                <span
                  className="text-sm font-medium text-red-700"
                  id="tenant-code-error"
                  role="alert"
                >
                  {tenantCodeError}
                </span>
              )}
            </label>
            <label className="grid gap-1 text-sm font-medium text-gray-700">
              {t("common.name")}
              <input
                className="rounded-xl border border-gray-300 px-3 py-2"
                maxLength={120}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
                value={form.name}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-gray-700">
              {t("common.description")}
              <textarea
                className="min-h-24 rounded-xl border border-gray-300 px-3 py-2"
                maxLength={500}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                value={form.description ?? ""}
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                checked={form.active ?? true}
                onChange={(event) => setForm({ ...form, active: event.target.checked })}
                type="checkbox"
              />
              {t("admin.tenants.activateImmediately")}
            </label>
          </div>

          <div className="mt-4">
            <ApiErrorPanel error={createFormError} translate={t} />
          </div>

          <button
            className="w-full rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={createMutation.isPending}
            type="submit"
          >
            {createMutation.isPending ? t("common.creatingDots") : t("admin.tenants.create.button")}
          </button>
        </form>

        <section className="space-y-4">
          {successMessage && (
            <div role="status" className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800">
              {successMessage}
            </div>
          )}
          <ApiErrorPanel error={tenantsQuery.error} translate={t} />

          <section
            aria-label={t("admin.tenants.catalog.aria")}
            className="rounded-2xl border bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-950">{t("admin.tenants.catalog.title")}</h2>
                <p className="text-sm text-gray-500">
                  {t("admin.tenants.catalog.description")}
                </p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                {hasTenantFilter ? t("admin.tenants.catalog.filteredCount", { visible: tenants.length, total: allTenants.length }) : t("admin.tenants.catalog.count", { count: allTenants.length })}
              </span>
            </div>

            <div
              role="note"
              aria-label={t("admin.tenants.boundary.aria")}
              className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950"
            >
              <p>{t("admin.tenants.boundary.primary")}</p>
              <p className="mt-2">{t("admin.tenants.boundary.secondary")}</p>
              <button
                className="mt-3 rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-semibold text-blue-950 shadow-sm hover:bg-blue-100"
                type="button"
                onClick={openAdministrationContextSelector}
              >
                {t("admin.tenants.boundary.openSelector")}
              </button>
            </div>

            <div className="mt-4 flex items-end gap-3">
              <label className="min-w-0 flex-1 text-sm font-semibold text-gray-700">
                {t("admin.tenants.filter.label")}
                <input
                  className="mt-1 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                  onChange={(event) => setTenantFilter(event.target.value)}
                  placeholder={t("admin.tenants.filter.placeholder")}
                  type="search"
                  value={tenantFilter}
                />
              </label>
              {hasTenantFilter && (
                <button
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700"
                  onClick={() => setTenantFilter("")}
                  type="button"
                >
                  {t("admin.tenants.filter.clear")}
                </button>
              )}
            </div>

            {tenantsQuery.isLoading && <p className="mt-4 text-sm text-gray-500">{t("admin.tenants.loading")}</p>}
            {!tenantsQuery.isLoading && allTenants.length === 0 && (
              <p className="mt-4 rounded-xl border border-dashed p-4 text-center text-sm text-gray-500">
                {t("admin.tenants.empty")}
              </p>
            )}
            {!tenantsQuery.isLoading && allTenants.length > 0 && tenants.length === 0 && (
              <p className="mt-4 rounded-xl border border-dashed p-4 text-center text-sm text-gray-500">
                {t("admin.tenants.noMatch")}
              </p>
            )}
            {tenants.length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[42rem] text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="p-3">{t("admin.tenants.column.record")}</th>
                      <th className="p-3">{t("admin.tenants.column.status")}</th>
                      <th className="p-3">{t("admin.tenants.column.admins")}</th>
                      <th className="p-3 text-right">{t("admin.tenants.column.action")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {tenants.map((tenant) => (
                      <TenantRow key={tenant.id} tenant={tenant} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
      </section>
    </main>
  );
}


function openAdministrationContextSelector() {
  const selector = document.getElementById("administration-context-selector");
  if (!(selector instanceof HTMLButtonElement)) return;

  selector.focus();
  if (selector.getAttribute("aria-expanded") !== "true") selector.click();
}

function TenantRow({ tenant }: { tenant: Tenant }) {
  const { t } = useI18n();
  return (
    <tr>
      <td className="p-3">
        <div className="font-semibold text-gray-950">{tenant.name}</div>
        <div className="font-mono text-xs text-gray-500">{tenant.code} · {tenant.id}</div>
        {tenant.description && <div className="mt-1 text-xs text-gray-500">{tenant.description}</div>}
      </td>
      <td className="p-3"><OperationalStatusBadge status={tenant.operationalStatus} /></td>
      <td className="p-3">{tenant.tenantAdminCount}</td>
      <td className="p-3 text-right">
        <Link
          className="rounded-lg border px-3 py-1 text-xs font-semibold text-gray-700"
          to={`/admin/tenants/${tenant.id}`}
        >
          {t("admin.tenants.manageRecord")}
        </Link>
      </td>
    </tr>
  );
}

export function OperationalStatusBadge({ status }: { status: TenantOperationalStatus }) {
  const { t } = useI18n();
  const styles: Record<TenantOperationalStatus, string> = {
    ACTIVE_READY: "border-green-200 bg-green-50 text-green-800",
    ACTIVE_NO_TENANT_ADMIN: "border-amber-200 bg-amber-50 text-amber-800",
    INACTIVE: "border-gray-200 bg-gray-100 text-gray-700",
  };
  const labels: Record<TenantOperationalStatus, string> = {
    ACTIVE_READY: t("admin.tenants.status.ready"),
    ACTIVE_NO_TENANT_ADMIN: t("admin.tenants.status.needsAdmin"),
    INACTIVE: t("admin.tenants.status.inactive"),
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
