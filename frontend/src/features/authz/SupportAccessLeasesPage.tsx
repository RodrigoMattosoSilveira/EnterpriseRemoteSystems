import { useI18n } from "../../i18n";
import { supportAccessPermissionText } from "./supportAccessPermissionText";
import { FormEvent, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { listTenants } from "../../api/tenants.api";
import { authorizationRequestContext } from "../../api/tenantSelection";
import { ActionSuccessDialog } from "../../components/ActionSuccessDialog";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { PageTitle } from "../../components/layout/PageHeading";
import { useAuthorizationContext } from "../../components/layout/AuthorizationContext";
import type {
  AuthzAuditLog,
  AuthzPermission,
  SupportAccessLease,
  SupportAccessLeaseStatus,
} from "../../types/authz";
import {
  useApproveSupportAccessLease,
  useEligibleSupportAccessLeasePermissions,
  useRequestSupportAccessLease,
  useSupportAccessLeaseAuditLogs,
  useSupportAccessLeases,
  useTerminateSupportAccessLease,
} from "./useSupportAccessLeases";

export function SupportAccessLeasesPage() {
  const { t } = useI18n();
  const statusOptions: Array<{ value: string; label: string }> = [
    { value: "", label: t("byte352.support.allStatuses") },
    { value: "PENDING", label: t("byte352.support.pending") },
    { value: "APPROVED", label: t("byte352.support.approved") },
    { value: "EXPIRED", label: t("byte352.support.expired") },
    { value: "TERMINATED", label: t("byte352.support.terminated") },
  ];
  const actor = useAuthorizationContext();
  const globalApplicationAdmin =
    actor.scope === "APPLICATION" && actor.tenantId === "*" && !actor.supportLeaseId;
  const tenantAdministrator =
    actor.scope === "TENANT" && actor.roleCodes.includes("TENANT_ADMIN");
  const canManageLeases = globalApplicationAdmin || tenantAdministrator;
  const requestActor = useMemo(
    () => canManageLeases
      ? authorizationRequestContext(actor.tenantId)
      : { actorId: "", tenantId: "" },
    [actor.tenantId, canManageLeases],
  );

  const tenantsQuery = useQuery({
    queryKey: ["support-access", "tenant-catalog"],
    queryFn: listTenants,
    enabled: globalApplicationAdmin,
    staleTime: 60_000,
  });
  const [tenantFilter, setTenantFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const filters = useMemo(
    () => ({
      tenantId: globalApplicationAdmin
        ? tenantFilter || undefined
        : tenantAdministrator
          ? actor.tenantId
          : undefined,
      status: (statusFilter || undefined) as SupportAccessLeaseStatus | undefined,
    }),
    [actor.tenantId, globalApplicationAdmin, statusFilter, tenantAdministrator, tenantFilter],
  );
  const leasesQuery = useSupportAccessLeases(requestActor, filters);
  const leases = Array.isArray(leasesQuery.data) ? leasesQuery.data : [];
  const permissionQuery = useEligibleSupportAccessLeasePermissions(requestActor);
  const requestMutation = useRequestSupportAccessLease(requestActor);
  const approveMutation = useApproveSupportAccessLease(requestActor);
  const terminateMutation = useTerminateSupportAccessLease(requestActor);
  const [auditLeaseId, setAuditLeaseId] = useState("");
  const auditQuery = useSupportAccessLeaseAuditLogs(requestActor, auditLeaseId);
  const [terminationReasons, setTerminationReasons] = useState<Record<string, string>>({});
  const [approvedLeaseId, setApprovedLeaseId] = useState("");
  const [openPanel, setOpenPanel] = useState<"request" | "history" | null>(null);

  function togglePanel(panel: "request" | "history") {
    setOpenPanel((current) => current === panel ? null : panel);
  }

  const tenants = useMemo(
    () => (tenantsQuery.data ?? []).filter((tenant) => tenant.active),
    [tenantsQuery.data],
  );
  const tenantNames = useMemo(
    () => new Map((tenantsQuery.data ?? []).map((tenant) => [tenant.id, tenant.name])),
    [tenantsQuery.data],
  );

  if (!globalApplicationAdmin && !tenantAdministrator) {
    return (
      <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
        <section className="mx-auto max-w-4xl rounded-2xl border bg-white p-6 shadow-sm">
          <PageTitle>{t("admin.support.support.access_eff1f5")}</PageTitle>
          <p className="mt-2 text-sm text-slate-600">
            {t("admin.support.tenant.support.access.lease.lifecycle.actions.are.avail_981f3a")}
          </p>
          {actor.supportLeaseId && (
            <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              <p className="font-semibold">{t("admin.support.support.access.is.currently.active_a83c7e")}</p>
              <p className="mt-1">
                {t("admin.support.lease_b24ef8")} <span className="font-mono">{actor.supportLeaseId}</span> {t("admin.support.authorizes.tenant.work.only.select_1a8d52")} <strong>{t("admin.support.global.administration_6c5f04")}</strong> {t("admin.support.in.administration.context.to.request.or.review.support._b18550")}
              </p>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <section className="mx-auto max-w-7xl space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("admin.support.administration_b8be3d")}</p>
          <PageTitle>{t("admin.support.support.access_eff1f5")}</PageTitle>
          <p className="mt-2 max-w-4xl text-sm text-slate-600">
            {t("admin.support.request.review.approve.terminate.and.audit.temporary.te_62f718")}
          </p>
          {tenantAdministrator && (
            <p className="mt-2 text-sm font-semibold text-slate-800">
              {t("support.fragments.tenant.boundary_23531c")} {actor.selectedTenantName || actor.tenantId} {t("support.fragments.tenant.id_2a6e7f")} {actor.tenantId}
            </p>
          )}
        </header>

        {globalApplicationAdmin && (
          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <h2>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-lg font-bold text-slate-950 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-500"
                aria-expanded={openPanel === "request"}
                aria-controls="support-access-request-panel"
                onClick={() => togglePanel("request")}
              >
                <span>{t("admin.support.request.tenant.support.access_1f0b47")}</span>
                <span aria-hidden="true" className="text-2xl font-normal text-slate-500">
                  {openPanel === "request" ? "−" : "+"}
                </span>
              </button>
            </h2>
            {openPanel === "request" && (
              <div id="support-access-request-panel" className="border-t border-slate-200">
                <RequestLeasePanel
                  tenants={tenants}
                  permissions={permissionQuery.data ?? []}
                  permissionsLoading={permissionQuery.isLoading}
                  disabled={requestMutation.isPending}
                  error={requestMutation.error || tenantsQuery.error || permissionQuery.error}
                  onResetError={() => requestMutation.reset()}
                  onSubmit={(input) => requestMutation.mutateAsync(input).then(() => undefined)}
                />
              </div>
            )}
          </section>
        )}

        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <h2>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-lg font-bold text-slate-950 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-500"
              aria-expanded={openPanel === "history"}
              aria-controls="support-access-history-panel"
              onClick={() => togglePanel("history")}
            >
              <span>{t("admin.support.lease.history_0e967a")}</span>
              <span aria-hidden="true" className="text-2xl font-normal text-slate-500">
                {openPanel === "history" ? "−" : "+"}
              </span>
            </button>
          </h2>

          {openPanel === "history" && (
            <div id="support-access-history-panel" className="border-t border-slate-200 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <p className="max-w-3xl text-sm text-slate-600">
                  {t("support.fragments.lease.records.are.retained.expiration.is.deriv_e78db0")}
                </p>
                <div className="flex flex-wrap gap-3">
                  {globalApplicationAdmin && (
                    <LeaseHistoryTenantFilter
                      tenants={tenants}
                      selectedTenantId={tenantFilter}
                      onChange={setTenantFilter}
                    />
                  )}
                  <label className="text-sm font-semibold text-slate-700">
                    {t("admin.support.status_bae7d5")}
                    <select
                      className="mt-1 block min-w-44 rounded-xl border border-slate-300 bg-white px-3 py-2"
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value)}
                    >
                      {statusOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
                    type="button"
                    disabled={leasesQuery.isFetching}
                    onClick={() => void leasesQuery.refetch()}
                  >
                    {t("admin.support.refresh_56e3ba")}
                  </button>
                </div>
              </div>

              <ApiErrorPanel error={leasesQuery.error || approveMutation.error || terminateMutation.error} />

              {leasesQuery.isLoading && <p className="mt-4 text-sm text-slate-500">{t("admin.support.loading.support.leases_4a0745")}</p>}
              {!leasesQuery.isLoading && leases.length === 0 && (
                <div className="mt-4 rounded-2xl border border-dashed p-6 text-center text-sm text-slate-500">
                  {t("admin.support.no.support.leases.match.the.current.filters_de1918")}
                </div>
              )}

              <div className="mt-4 space-y-4">
                {leases.map((lease) => (
                  <LeaseCard
                    key={lease.id}
                    lease={lease}
                    tenantName={tenantNames.get(lease.tenantId) || (lease.tenantId === actor.tenantId ? actor.selectedTenantName : undefined)}
                    permissions={permissionQuery.data ?? []}
                    tenantAdministrator={tenantAdministrator}
                    approvalPending={approveMutation.isPending}
                    terminationPending={terminateMutation.isPending}
                    terminationReason={terminationReasons[lease.id] ?? ""}
                    auditOpen={auditLeaseId === lease.id}
                    auditLogs={auditLeaseId === lease.id ? auditQuery.data ?? [] : []}
                    auditLoading={auditLeaseId === lease.id && auditQuery.isLoading}
                    auditError={auditLeaseId === lease.id ? auditQuery.error : null}
                    onApprove={() =>
                      approveMutation.mutate(lease.id, {
                        onSuccess: () => setApprovedLeaseId(lease.id),
                      })
                    }
                    onTerminationReasonChange={(reason) =>
                      setTerminationReasons((current) => ({ ...current, [lease.id]: reason }))
                    }
                    onTerminate={() =>
                      terminateMutation.mutate({
                        leaseId: lease.id,
                        reason: (terminationReasons[lease.id] ?? "").trim(),
                      })
                    }
                    onToggleAudit={() => setAuditLeaseId((current) => current === lease.id ? "" : lease.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      </section>

      {approvedLeaseId && (
        <ActionSuccessDialog
          title={t("support.extra.tenant.support.access.request.approved_6b8ee2")}
          message={t("byte354b.support.approvedMessage", { id: approvedLeaseId })}
          onDismiss={() => {
            setApprovedLeaseId("");
            approveMutation.reset();
          }}
        />
      )}
    </main>
  );
}

function LeaseHistoryTenantFilter({
  tenants,
  selectedTenantId,
  onChange,
}: {
  tenants: Array<{ id: string; code: string; name: string }>;
  selectedTenantId: string;
  onChange: (tenantId: string) => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleTenants = normalizedSearch
    ? tenants.filter((tenant) =>
        [tenant.name, tenant.code, tenant.id].some((value) =>
          value.toLocaleLowerCase().includes(normalizedSearch),
        ),
      )
    : tenants;
  const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId);
  const selectedLabel = selectedTenant
    ? `${selectedTenant.name} (${selectedTenant.code})`
    : t("byte354b.support.allTenants");
  const showAllTenantsOption =
    !normalizedSearch || [t("byte354b.support.allTenantsSearch"), "all tenants"].some((label) => label.includes(normalizedSearch));

  function chooseTenant(tenantId: string) {
    onChange(tenantId);
    setSearch("");
    setOpen(false);
  }

  return (
    <div
      className="relative min-w-72"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setSearch("");
          setOpen(false);
        }
      }}
    >
      <label className="block text-sm font-semibold text-slate-700">
        {t("admin.support.tenant_3ca93c")}
        <input
          type="search"
          role="combobox"
          aria-label={t("support.extra.lease.history.tenant.filter_e96a20")}
          aria-autocomplete="list"
          aria-controls={open ? "support-access-history-tenant-options" : undefined}
          aria-expanded={open}
          className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
          value={search}
          placeholder={selectedLabel}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            setSearch(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setSearch("");
              setOpen(false);
              event.currentTarget.blur();
            }
          }}
        />
      </label>

      {open && (
        <div
          id="support-access-history-tenant-options"
          role="listbox"
          aria-label={t("support.extra.lease.history.tenant.choices_24cebf")}
          className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-300 bg-white p-1 shadow-lg"
        >
          <p className="px-3 py-2 text-xs font-semibold text-slate-500">
            {normalizedSearch
              ? t("byte352.support.filteredActiveTenants", { shown: visibleTenants.length, total: tenants.length })
              : t(tenants.length === 1 ? "byte354b.support.activeTenants" : "byte354b.support.activeTenantsPlural", { count: tenants.length })}
          </p>

          {showAllTenantsOption && (
            <button
              type="button"
              role="option"
              aria-selected={!selectedTenantId}
              data-tenant-id=""
              className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50 focus:bg-slate-100 focus:outline-none"
              onClick={() => chooseTenant("")}
            >
              <span className="block text-sm font-semibold text-slate-900">{t("admin.support.all.tenants_1cf814")}</span>
              <span className="block text-xs text-slate-500">
                {t("admin.support.show.retained.support.leases.from.every.tenant_cfd19b")}
              </span>
            </button>
          )}

          {visibleTenants.map((tenant) => (
            <button
              key={tenant.id}
              type="button"
              role="option"
              aria-selected={selectedTenantId === tenant.id}
              data-tenant-id={tenant.id}
              className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50 focus:bg-slate-100 focus:outline-none"
              onClick={() => chooseTenant(tenant.id)}
            >
              <span className="block text-sm font-semibold text-slate-900">{tenant.name}</span>
              <span className="block text-xs text-slate-600">{tenant.code}</span>
              <span className="block font-mono text-xs text-slate-500">{t("support.fragments.tenant.id_3aeace")} {tenant.id}</span>
            </button>
          ))}

          {normalizedSearch && visibleTenants.length === 0 && !showAllTenantsOption && (
            <p className="px-3 py-5 text-center text-sm text-slate-500">
              {t("admin.support.no.active.tenants.match.the.current.history.filter_8dbfca")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function RequestLeasePanel({
  tenants,
  permissions,
  permissionsLoading,
  disabled,
  error,
  onResetError,
  onSubmit,
}: {
  tenants: Array<{ id: string; code: string; name: string }>;
  permissions: AuthzPermission[];
  permissionsLoading: boolean;
  disabled: boolean;
  error: unknown;
  onResetError: () => void;
  onSubmit: (input: { tenantId: string; expiresAt: string; reason: string; permissions: string[] }) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [tenantId, setTenantId] = useState("");
  const [tenantSearch, setTenantSearch] = useState("");
  const [expiresAt, setExpiresAt] = useState(defaultExpirationInput());
  const [reason, setReason] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const submissionLockRef = useRef(false);
  const [submissionLocked, setSubmissionLocked] = useState(false);
  const [conflictDialogMessage, setConflictDialogMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionLockRef.current) return;
    if (!tenantId || !expiresAt || !reason.trim() || selectedPermissions.length === 0) return;
    const parsed = new Date(expiresAt);
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) return;

    submissionLockRef.current = true;
    setSubmissionLocked(true);
    try {
      await onSubmit({
        tenantId,
        expiresAt: parsed.toISOString(),
        reason: reason.trim(),
        permissions: selectedPermissions,
      });
      setTenantId("");
      setTenantSearch("");
      setExpiresAt(nowInput());
      setReason("");
      setSelectedPermissions([]);
    } catch (submitError) {
      if (isSupportAccessLeaseConflict(submitError)) {
        setConflictDialogMessage(submitError.message);
      }
      // Preserve the completed form so the Administrator can correct/retry
      // without re-entering the request.
    } finally {
      submissionLockRef.current = false;
      setSubmissionLocked(false);
    }
  }

  function togglePermission(code: string) {
    setSelectedPermissions((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    );
  }

  const normalizedTenantSearch = tenantSearch.trim().toLocaleLowerCase();
  const visibleTenants = normalizedTenantSearch
    ? tenants.filter((tenant) =>
        [tenant.name, tenant.code, tenant.id].some((value) =>
          value.toLocaleLowerCase().includes(normalizedTenantSearch),
        ),
      )
    : tenants;
  const selectedTenant = tenants.find((tenant) => tenant.id === tenantId);
  const expirationTime = new Date(expiresAt).getTime();
  const expirationIsFuture = Number.isFinite(expirationTime) && expirationTime > Date.now();
  const submitting = disabled || submissionLocked;
  const requestReady = Boolean(
    tenantId
      && reason.trim()
      && selectedPermissions.length > 0
      && expirationIsFuture,
  );

  const inlineError = isSupportAccessLeaseConflict(error) ? null : error;

  function dismissConflictDialog() {
    setConflictDialogMessage("");
    onResetError();
  }

  return (
    <div className="p-5">
      <p className="text-sm text-slate-600">
        {t("admin.support.choose.exactly.one.tenant.an.immutable.expiration.a.sup_be792d")}
      </p>
      <ApiErrorPanel error={inlineError} />
      <form className="mt-4 space-y-5" onSubmit={handleSubmit}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.65fr)]">
          <fieldset>
            <legend className="text-sm font-semibold text-slate-700">{t("admin.support.tenant_3ca93c")}</legend>
            <p className="mt-1 text-xs text-slate-500">
              {t("admin.support.filter.by.tenant.name.code.or.id.then.choose.exactly.on_540dd0")}
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1 text-sm font-semibold text-slate-700">
                {t("admin.support.filter.tenants_709c84")}
                <input
                  className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  onChange={(event) => setTenantSearch(event.target.value)}
                  placeholder={t("support.extra.name.code.or.tenant.id_7f40de")}
                  type="search"
                  value={tenantSearch}
                />
              </label>
              {normalizedTenantSearch && (
                <button
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                  onClick={() => setTenantSearch("")}
                  type="button"
                >
                  {t("admin.support.clear.filter_b667d6")}
                </button>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
              <span>
                {normalizedTenantSearch
                  ? t("byte352.support.filteredActiveTenants", { shown: visibleTenants.length, total: tenants.length })
                  : t("byte352.support.activeTenants", { count: tenants.length })}
              </span>
              {selectedTenant && (
                <span>
                  {t("admin.support.selected_2e0844")} <strong className="text-slate-700">{selectedTenant.name}</strong>
                </span>
              )}
            </div>
            {tenants.length === 0 && (
              <p className="mt-3 rounded-xl border border-dashed p-4 text-center text-sm text-slate-500">
                {t("admin.support.no.active.tenants.are.available.for.support.access_b775e5")}
              </p>
            )}
            {tenants.length > 0 && visibleTenants.length === 0 && (
              <p className="mt-3 rounded-xl border border-dashed p-4 text-center text-sm text-slate-500">
                {t("admin.support.no.active.tenants.match.the.current.filter_733660")}
              </p>
            )}
            {visibleTenants.length > 0 && (
              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1" role="radiogroup" aria-label={t("support.extra.tenant.choices_8ad996")}>
                {visibleTenants.map((tenant) => (
                  <label
                    key={tenant.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                      tenantId === tenant.id
                        ? "border-slate-950 bg-slate-50"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <input
                      className="mt-1"
                      type="radio"
                      name="support-access-tenant"
                      value={tenant.id}
                      checked={tenantId === tenant.id}
                      onChange={() => setTenantId(tenant.id)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-900">{tenant.name}</span>
                      <span className="block text-xs text-slate-600">{tenant.code}</span>
                      <span className="block break-all font-mono text-xs text-slate-500">{t("support.fragments.tenant.id_3aeace")} {tenant.id}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <label className="text-sm font-semibold text-slate-700">
            {t("admin.support.fixed.expiration_8af1c2")}
            <input
              className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2"
              type="datetime-local"
              required
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
          </label>
        </div>
        <label className="block text-sm font-semibold text-slate-700">
          {t("admin.support.support.reason.case_d489bb")}
          <textarea
            className="mt-1 block min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2"
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("support.extra.describe.the.tenant.support.purpose.and.why.this.access_111183")}
          />
        </label>
        <fieldset>
          <legend className="text-sm font-semibold text-slate-700">{t("admin.support.requested.tenant.permissions_963009")}</legend>
          <p className="mt-1 text-xs text-slate-500">
            {t("admin.support.this.catalog.is.supplied.by.the.backend.allowlist.contr_c0f7d2")}
          </p>
          {permissionsLoading ? (
            <p className="mt-3 text-sm text-slate-500">{t("admin.support.loading.eligible.permissions_d417fe")}</p>
          ) : (
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {permissions.map((permission) => {
                const localized = supportAccessPermissionText(locale, permission);
                return (
                <label key={permission.code} className="flex gap-3 rounded-xl border border-slate-200 p-3">
                  <input
                    type="checkbox"
                    checked={selectedPermissions.includes(permission.code)}
                    onChange={() => togglePermission(permission.code)}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{localized.label}</span>
                    <span className="block font-mono text-xs text-slate-500">{permission.code}</span>
                    {localized.description && <span className="mt-1 block text-xs text-slate-600">{localized.description}</span>}
                  </span>
                </label>
                );
              })}
            </div>
          )}
        </fieldset>
        <button
          className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          type="submit"
          disabled={submitting || !requestReady}
        >
          {submitting ? t("byte352.support.requestBusy") : t("byte352.support.requestAccess")}
        </button>
      </form>
      {conflictDialogMessage && (
        <SupportAccessLeaseConflictDialog
          message={conflictDialogMessage}
          onDismiss={dismissConflictDialog}
        />
      )}
    </div>
  );
}

function isSupportAccessLeaseConflict(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === "support_access_lease_conflict";
}

function SupportAccessLeaseConflictDialog({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 p-4">
      <div
        aria-describedby="support-access-conflict-description"
        aria-labelledby="support-access-conflict-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-2xl"
        role="alertdialog"
      >
        <h2 id="support-access-conflict-title" className="text-xl font-bold text-amber-950">
          {t("admin.support.support.access.request.already.open_3e750d")}
        </h2>
        <p
          id="support-access-conflict-description"
          className="mt-3 text-base font-semibold text-slate-800"
        >
          {message}
        </p>
        <div className="mt-6 flex justify-end">
          <button
            autoFocus
            className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm"
            onClick={onDismiss}
            type="button"
          >
            {t("admin.support.close_bbfa77")}
          </button>
        </div>
      </div>
    </div>
  );
}

function LeaseCard({
  lease,
  tenantName,
  permissions,
  tenantAdministrator,
  approvalPending,
  terminationPending,
  terminationReason,
  auditOpen,
  auditLogs,
  auditLoading,
  auditError,
  onApprove,
  onTerminationReasonChange,
  onTerminate,
  onToggleAudit,
}: {
  lease: SupportAccessLease;
  tenantName?: string;
  permissions: AuthzPermission[];
  tenantAdministrator: boolean;
  approvalPending: boolean;
  terminationPending: boolean;
  terminationReason: string;
  auditOpen: boolean;
  auditLogs: AuthzAuditLog[];
  auditLoading: boolean;
  auditError: unknown;
  onApprove: () => void;
  onTerminationReasonChange: (reason: string) => void;
  onTerminate: () => void;
  onToggleAudit: () => void;
}) {
  const { t, locale } = useI18n();
  const permissionMap = useMemo(() => new Map(permissions.map((item) => [item.code, item])), [permissions]);
  const expiredPending = lease.status === "PENDING" && lease.effectiveStatus === "EXPIRED";
  const canApprove = tenantAdministrator && lease.effectiveStatus === "PENDING";
  const canTerminate = tenantAdministrator && lease.effectiveStatus === "APPROVED";

  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4" data-testid="support-access-lease-card">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={expiredPending ? "EXPIRED" : lease.effectiveStatus} />
            {expiredPending && <span className="text-xs font-bold uppercase tracking-wide text-amber-700">{t("admin.support.expired.request_cfeb79")}</span>}
          </div>
          <p className="mt-2 font-mono text-sm font-semibold text-slate-900">{lease.id}</p>
          <p className="mt-1 text-sm text-slate-700">
            {t("admin.support.tenant_be7b76")} <strong>{tenantName || lease.tenantId}</strong> {t("admin.support.id_381d7c")} <span className="font-mono">{lease.tenantId}</span>
          </p>
        </div>
        <button className="text-sm font-semibold text-slate-700 underline" type="button" onClick={onToggleAudit}>
          {auditOpen ? t("byte352.support.hideAudit") : t("byte352.support.reviewAudit")}
        </button>
      </div>

      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
        <Fact label={t("byte352.support.applicationActor")} value={lease.applicationActorId} mono />
        <Fact label={t("byte352.support.requested")} value={formatDateTime(lease.requestedAt)} />
        <Fact label={t("byte354b.support.fixedExpiration")} value={formatDateTime(lease.expiresAt)} />
        <Fact label={t("byte352.support.approvedBy")} value={lease.approvedByActorId || "—"} mono={Boolean(lease.approvedByActorId)} />
        <Fact label={t("byte352.support.terminatedBy")} value={lease.terminatedByActorId || "—"} mono={Boolean(lease.terminatedByActorId)} />
        <Fact label={t("byte352.support.terminationReason")} value={lease.terminationReason || "—"} />
      </dl>

      <div className="mt-4 rounded-xl bg-white p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("admin.support.support.reason_45f159")}</p>
        <p className="mt-1 text-sm text-slate-800">{lease.reason}</p>
      </div>

      <div className="mt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("admin.support.immutable.permission.scope_fd6d3d")}</p>
        <ul className="mt-2 grid gap-2 lg:grid-cols-2">
          {lease.permissions.map((code) => {
            const permission = permissionMap.get(code);
            const localized = permission ? supportAccessPermissionText(locale, permission) : null;
            return (
              <li key={code} className="rounded-xl border bg-white p-3 text-sm">
                <p className="font-semibold text-slate-900">{localized?.label || code}</p>
                <p className="font-mono text-xs text-slate-500">{code}</p>
                {localized?.description && <p className="mt-1 text-xs text-slate-600">{localized.description}</p>}
              </li>
            );
          })}
        </ul>
      </div>

      {canApprove && (
        <button
          className="mt-4 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          type="button"
          disabled={approvalPending}
          onClick={onApprove}
        >
          {approvalPending ? t("byte352.support.approveBusy") : t("byte352.support.approveAccess")}
        </button>
      )}

      {expiredPending && tenantAdministrator && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {t("admin.support.this.pending.request.passed.its.immutable.expiration.an_707af5")}
        </p>
      )}

      {canTerminate && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3">
          <label className="block text-sm font-semibold text-red-950">
            {t("admin.support.immediate.termination.reason_6d0083")}
            <input
              className="mt-1 block w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm"
              value={terminationReason}
              onChange={(event) => onTerminationReasonChange(event.target.value)}
              placeholder={t("support.extra.why.is.this.support.session.ending_948bc8")}
            />
          </label>
          <button
            className="mt-3 rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            type="button"
            disabled={terminationPending || !terminationReason.trim()}
            onClick={onTerminate}
          >
            {terminationPending ? t("byte352.support.terminateBusy") : t("byte352.support.terminateNow")}
          </button>
        </div>
      )}

      {auditOpen && (
        <div className="mt-4 rounded-xl border bg-white p-3">
          <h3 className="font-bold text-slate-950">{t("admin.support.lease.audit.trail_334688")}</h3>
          <ApiErrorPanel error={auditError} />
          {auditLoading ? (
            <p className="mt-2 text-sm text-slate-500">{t("admin.support.loading.audit.events_813d81")}</p>
          ) : auditLogs.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">{t("admin.support.no.audit.events.are.recorded.for.this.lease.yet_89cc21")}</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-2">{t("admin.support.when_769bb1")}</th>
                    <th className="px-2 py-2">{t("admin.support.decision_7f59a1")}</th>
                    <th className="px-2 py-2">{t("admin.support.operation_430d32")}</th>
                    <th className="px-2 py-2">{t("admin.support.actor_cbd19b")}</th>
                    <th className="px-2 py-2">{t("admin.support.request_4aed03")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="whitespace-nowrap px-2 py-2">{formatDateTime(log.occurredAt)}</td>
                      <td className="px-2 py-2">{log.decision}</td>
                      <td className="px-2 py-2">
                        <p className="font-semibold">{log.operation}</p>
                        {log.permissionCode && <p className="font-mono text-xs text-slate-500">{log.permissionCode}</p>}
                      </td>
                      <td className="px-2 py-2 font-mono text-xs">{log.actorRecordId || log.actorId || "—"}</td>
                      <td className="px-2 py-2 text-xs">{[log.requestMethod, log.requestPath].filter(Boolean).join(" ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  const { t } = useI18n();
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-1 break-all text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const normalized = status.toUpperCase();
  const className =
    normalized === "APPROVED"
      ? "bg-emerald-100 text-emerald-800"
      : normalized === "PENDING"
        ? "bg-blue-100 text-blue-800"
        : normalized === "TERMINATED"
          ? "bg-slate-200 text-slate-800"
          : "bg-amber-100 text-amber-800";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${className}`}>{({ PENDING: t("byte352.support.pending"), APPROVED: t("byte352.support.approved"), EXPIRED: t("byte352.support.expired"), TERMINATED: t("byte352.support.terminated") } as Record<string, string>)[normalized] || normalized}</span>;
}

function dateTimeLocalInput(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function nowInput(): string {
  return dateTimeLocalInput(new Date());
}

function defaultExpirationInput(): string {
  return dateTimeLocalInput(new Date(Date.now() + 60 * 60 * 1000));
}

function formatDateTime(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
