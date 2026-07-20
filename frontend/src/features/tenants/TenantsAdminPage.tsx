import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import type { CreateTenantInput, Tenant, TenantOperationalStatus } from "../../types/tenants";
import { useCreateTenant, useTenants } from "./useTenants";

const emptyForm: CreateTenantInput = {
  code: "",
  name: "",
  description: "",
  active: true,
};

export function TenantsAdminPage() {
  const [form, setForm] = useState<CreateTenantInput>(emptyForm);
  const [successMessage, setSuccessMessage] = useState("");
  const tenantsQuery = useTenants();
  const createMutation = useCreateTenant();
  const createError = createMutation.error;
  const tenantCodeError =
    createError instanceof ApiError ? createError.fields?.code : undefined;
  const createFormError = tenantCodeError ? null : createError;

  const tenants = useMemo(
    () => [...(tenantsQuery.data ?? [])].sort((a, b) => a.code.localeCompare(b.code)),
    [tenantsQuery.data],
  );

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
      setSuccessMessage(`${created.name} created.`);
    } catch {
      // Mutation error is rendered in the Create Tenant card.
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Administration</p>
            <h1 className="text-xl font-bold text-gray-950">Tenants</h1>
            <p className="text-sm text-gray-500">
              Create tenant boundaries, monitor operational readiness, and assign tenant administrators.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 text-sm font-semibold text-gray-700">
            <Link className="underline" to="/admin/authorization">Authorization</Link>
            <Link className="underline" to="/admin/reference-data">Reference Data</Link>
            <Link className="underline" to="/people">Back to People</Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[22rem_1fr]">
        <form className="h-fit rounded-2xl border bg-white p-5 shadow-sm" onSubmit={handleCreate}>
          <h2 className="text-lg font-semibold text-gray-950">Create tenant</h2>
          <p className="mt-1 text-sm text-gray-500">
            Tenant codes are normalized to uppercase and cannot be reused.
          </p>

          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm font-medium text-gray-700">
              Code
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
              Name
              <input
                className="rounded-xl border border-gray-300 px-3 py-2"
                maxLength={120}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
                value={form.name}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-gray-700">
              Description
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
              Activate immediately
            </label>
          </div>

          <div className="mt-4">
            <ApiErrorPanel error={createFormError} />
          </div>

          <button
            className="w-full rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={createMutation.isPending}
            type="submit"
          >
            {createMutation.isPending ? "Creating..." : "Create Tenant"}
          </button>
        </form>

        <section className="space-y-4">
          {successMessage && (
            <div role="status" className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800">
              {successMessage}
            </div>
          )}
          <ApiErrorPanel error={tenantsQuery.error} />

          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-950">Tenant catalog</h2>
                <p className="text-sm text-gray-500">
                  Inactive tenants remain readable for audit, but normal tenant writes are blocked.
                </p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                {tenants.length} tenants
              </span>
            </div>

            {tenantsQuery.isLoading && <p className="mt-4 text-sm text-gray-500">Loading tenants...</p>}
            {!tenantsQuery.isLoading && tenants.length === 0 && (
              <p className="mt-4 rounded-xl border border-dashed p-4 text-center text-sm text-gray-500">
                No tenants found.
              </p>
            )}
            {tenants.length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[42rem] text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="p-3">Tenant</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Tenant admins</th>
                      <th className="p-3 text-right">Action</th>
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

function TenantRow({ tenant }: { tenant: Tenant }) {
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
          Manage
        </Link>
      </td>
    </tr>
  );
}

export function OperationalStatusBadge({ status }: { status: TenantOperationalStatus }) {
  const styles: Record<TenantOperationalStatus, string> = {
    ACTIVE_READY: "border-green-200 bg-green-50 text-green-800",
    ACTIVE_NO_TENANT_ADMIN: "border-amber-200 bg-amber-50 text-amber-800",
    INACTIVE: "border-gray-200 bg-gray-100 text-gray-700",
  };
  const labels: Record<TenantOperationalStatus, string> = {
    ACTIVE_READY: "Active · Ready",
    ACTIVE_NO_TENANT_ADMIN: "Active · Needs admin",
    INACTIVE: "Inactive",
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
