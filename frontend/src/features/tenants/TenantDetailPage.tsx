import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import type { UpdateTenantInput } from "../../types/tenants";
import { OperationalStatusBadge } from "./TenantsAdminPage";
import {
  useAssignTenantAdmin,
  useRevokeTenantAdmin,
  useSetTenantActive,
  useTenant,
  useTenantAdminCandidates,
  useUpdateTenant,
} from "./useTenants";

const emptyForm: UpdateTenantInput = { code: "", name: "", description: "" };

export function TenantDetailPage() {
  const { id = "" } = useParams();
  const tenantQuery = useTenant(id);
  const candidatesQuery = useTenantAdminCandidates(id);
  const updateMutation = useUpdateTenant(id);
  const activeMutation = useSetTenantActive(id);
  const assignMutation = useAssignTenantAdmin(id);
  const revokeMutation = useRevokeTenantAdmin(id);
  const [form, setForm] = useState<UpdateTenantInput>(emptyForm);
  const [selectedActorId, setSelectedActorId] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (!tenantQuery.data) return;
    setForm({
      code: tenantQuery.data.code,
      name: tenantQuery.data.name,
      description: tenantQuery.data.description ?? "",
    });
  }, [tenantQuery.data]);

  const candidates = useMemo(() => candidatesQuery.data ?? [], [candidatesQuery.data]);
  const assignedAdmins = candidates.filter((candidate) => candidate.assigned);
  const assignableActors = candidates.filter((candidate) => candidate.active && !candidate.assigned);
  const actionError =
    updateMutation.error ?? activeMutation.error ?? assignMutation.error ?? revokeMutation.error;

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage("");
    updateMutation.reset();
    try {
      const updated = await updateMutation.mutateAsync({
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description?.trim(),
      });
      setSuccessMessage(`${updated.name} updated.`);
    } catch {
      // Mutation error is rendered by ApiErrorPanel.
    }
  }

  async function handleSetActive(active: boolean) {
    setSuccessMessage("");
    activeMutation.reset();
    try {
      const updated = await activeMutation.mutateAsync(active);
      setSuccessMessage(`${updated.name} ${active ? "activated" : "deactivated"}.`);
    } catch {
      // Mutation error is rendered by ApiErrorPanel.
    }
  }

  async function handleAssign() {
    if (!selectedActorId) return;
    setSuccessMessage("");
    assignMutation.reset();
    try {
      await assignMutation.mutateAsync(selectedActorId);
      const actor = candidates.find((candidate) => candidate.actorId === selectedActorId);
      setSelectedActorId("");
      setSuccessMessage(`${actor?.displayName || actor?.actorKey || "Actor"} assigned as tenant administrator.`);
    } catch {
      // Mutation error is rendered by ApiErrorPanel.
    }
  }

  async function handleRevoke(actorId: string) {
    setSuccessMessage("");
    revokeMutation.reset();
    try {
      await revokeMutation.mutateAsync(actorId);
      setSuccessMessage("Tenant administrator assignment revoked.");
    } catch {
      // Mutation error is rendered by ApiErrorPanel.
    }
  }

  const tenant = tenantQuery.data;

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tenant administration</p>
            <h1 className="text-xl font-bold text-gray-950">{tenant?.name ?? "Tenant"}</h1>
            <p className="text-sm text-gray-500">Edit identity, lifecycle status, and tenant administrator assignments.</p>
          </div>
          <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/tenants">
            Back to Tenants
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl space-y-4 p-4">
        {successMessage && (
          <div role="status" className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800">
            {successMessage}
          </div>
        )}
        <ApiErrorPanel error={tenantQuery.error ?? candidatesQuery.error ?? actionError} />
        {tenantQuery.isLoading && <p className="text-sm text-gray-500">Loading tenant...</p>}

        {tenant && (
          <>
            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-950">Operational status</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    {tenant.active
                      ? "Tenant writes are enabled. Assign at least one active tenant administrator for operational readiness."
                      : "Tenant writes are blocked. Historical records remain readable for audit."}
                  </p>
                </div>
                <OperationalStatusBadge status={tenant.operationalStatus} />
              </div>
              <div className="mt-4 grid gap-3 rounded-xl bg-gray-50 p-4 md:grid-cols-[1fr_auto] md:items-center">
                <dl className="grid gap-2 text-sm text-gray-700 sm:grid-cols-3">
                  <div>
                    <dt className="font-semibold text-gray-950">Tenant ID</dt>
                    <dd className="break-all font-mono text-xs">{tenant.id}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-gray-950">Tenant code</dt>
                    <dd className="break-all font-mono text-xs">{tenant.code}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-gray-950">Tenant administrators</dt>
                    <dd>
                      <span className="font-semibold">{tenant.tenantAdminCount}</span> active
                    </dd>
                  </div>
                </dl>
                <button
                  className={`rounded-xl px-4 py-2 text-sm font-semibold ${tenant.active ? "border border-amber-200 bg-amber-50 text-amber-800" : "bg-gray-950 text-white"}`}
                  disabled={activeMutation.isPending}
                  onClick={() => handleSetActive(!tenant.active)}
                  type="button"
                >
                  {activeMutation.isPending ? "Saving..." : tenant.active ? "Deactivate Tenant" : "Activate Tenant"}
                </button>
              </div>
            </section>

            <form className="rounded-2xl border bg-white p-5 shadow-sm" onSubmit={handleUpdate}>
              <h2 className="text-lg font-semibold text-gray-950">Tenant identity</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Code
                  <input className="rounded-xl border border-gray-300 px-3 py-2" maxLength={32} onChange={(event) => setForm({ ...form, code: event.target.value })} required value={form.code} />
                </label>
                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Name
                  <input className="rounded-xl border border-gray-300 px-3 py-2" maxLength={120} onChange={(event) => setForm({ ...form, name: event.target.value })} required value={form.name} />
                </label>
                <label className="grid gap-1 text-sm font-medium text-gray-700 md:col-span-2">
                  Description
                  <textarea className="min-h-24 rounded-xl border border-gray-300 px-3 py-2" maxLength={500} onChange={(event) => setForm({ ...form, description: event.target.value })} value={form.description ?? ""} />
                </label>
              </div>
              <button className="mt-4 rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={updateMutation.isPending} type="submit">
                {updateMutation.isPending ? "Saving..." : "Save Tenant"}
              </button>
            </form>

            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-950">Tenant administrators</h2>
              <p className="mt-1 text-sm text-gray-500">
                Assignment grants the persisted TENANT_ADMIN role for this tenant. Inactive actors cannot be assigned.
              </p>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <select className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm" onChange={(event) => setSelectedActorId(event.target.value)} value={selectedActorId}>
                  <option value="">Select an active actor</option>
                  {assignableActors.map((candidate) => (
                    <option key={candidate.actorId} value={candidate.actorId}>
                      {candidate.displayName || candidate.actorKey} ({candidate.actorKey})
                    </option>
                  ))}
                </select>
                <button className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={!selectedActorId || assignMutation.isPending} onClick={handleAssign} type="button">
                  {assignMutation.isPending ? "Assigning..." : "Assign Admin"}
                </button>
              </div>

              {candidatesQuery.isLoading && <p className="mt-4 text-sm text-gray-500">Loading actors...</p>}
              {!candidatesQuery.isLoading && tenant.tenantAdminCount === 0 && (
                <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  No active tenant administrator is assigned.
                </p>
              )}
              <div className="mt-4 space-y-2">
                {assignedAdmins.map((candidate) => (
                  <article className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3" key={candidate.actorId}>
                    <div>
                      <p className="font-semibold text-gray-950">{candidate.displayName || candidate.actorKey}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        Actor key: <code className="break-all font-mono text-gray-700">{candidate.actorKey}</code>
                      </p>
                      <p className="text-xs text-gray-500">
                        Actor record ID: <code className="break-all font-mono text-gray-700">{candidate.actorId}</code>
                      </p>
                      {!candidate.active && <p className="mt-1 text-xs font-semibold text-amber-700">Inactive actor</p>}
                    </div>
                    <button className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 disabled:opacity-60" disabled={revokeMutation.isPending} onClick={() => handleRevoke(candidate.actorId)} type="button">
                      Revoke
                    </button>
                  </article>
                ))}
              </div>

              {assignedAdmins.length > 0 && (
                <section
                  aria-label="Tenant access verification"
                  className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4"
                >
                  <h3 className="font-semibold text-blue-950">Tenant access verification</h3>
                  <p className="mt-1 text-sm text-blue-900">
                    Use the exact persisted actor key and immutable Tenant ID shown below. Do not
                    prepend another <code className="font-mono">collaborator-</code> segment, use
                    the actor record ID, or substitute the tenant code.
                  </p>
                  <div className="mt-3 space-y-3">
                    {assignedAdmins.map((candidate) => (
                      <div className="rounded-lg border border-blue-200 bg-white p-3" key={candidate.actorId}>
                        <p className="text-sm font-semibold text-gray-950">
                          {candidate.displayName || candidate.actorKey}
                        </p>
                        <pre
                          aria-label={`Tenant access curl command for ${candidate.actorKey}`}
                          className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-gray-950 p-3 text-xs text-white"
                        >
                          {tenantAccessCurlCommand(candidate.actorKey, tenant.id)}
                        </pre>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}

function tenantAccessCurlCommand(actorKey: string, tenantId: string) {
  return [
    "curl -i \\",
    `  -H "X-Actor-ID: ${actorKey}" \\`,
    `  -H "X-Tenant-ID: ${tenantId}" \\`,
    `  "http://localhost:8080/api/v1/tenants/${tenantId}"`,
  ].join("\n");
}
