import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, useNavigate } from "react-router-dom";
import { ApiError } from "../../api/client";
import {
  loadAuthSelfServiceHome,
  loadAuthTenantOptions,
  normalizeAuthTenantOptions,
} from "../../api/auth.api";
import { getCurrentAuthzActor } from "../../api/authz.api";
import {
  authorizationRequestContext,
  readSelectedTenantId,
  setSelectedTenantForAccount,
} from "../../api/tenantSelection";
import { endAuthSession } from "../../app/authStore";
import {
  subscribeForbidden,
  subscribeTenantActorUnavailable,
} from "../../app/authEvents";
import { useAuthState } from "../../app/useAuth";
import { AuthorizationProvider } from "./AuthorizationContext";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";
import { LanguageSelector } from "./LanguageSelector";
import { PageTitle } from "./PageHeading";
import { useI18n, type Translate } from "../../i18n";

export function AppShell() {
  const { t } = useI18n();
  const auth = useAuthState();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const authenticatedSession =
    auth.status === "authenticated" ? auth.session : null;
  const accountId = authenticatedSession?.accountId ?? "";
  const authSessionVersion = authenticatedSession?.expiresAt ?? "";

  const tenantQuery = useQuery({
    // Tenant/context options are authorization state for one authenticated
    // session, not durable Account profile data. Including the session expiry
    // prevents a prior login's support-lease catalog from being reused when the
    // same Account signs in again.
    queryKey: ["auth", accountId, "tenant-options", authSessionVersion],
    queryFn: loadAuthTenantOptions,
    enabled: Boolean(accountId && authSessionVersion),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    // Tenant Actor/Membership and Support Access Lease lifecycle changes can be
    // made by an administrator in another authenticated browser session.
    refetchOnWindowFocus: "always",
  });
  const tenantOptions = useMemo(
    () => normalizeAuthTenantOptions(tenantQuery.data),
    [tenantQuery.data],
  );
  const [requestedTenantId, setRequestedTenantId] = useState(() =>
    typeof window === "undefined"
      ? "default"
      : readSelectedTenantId(window.localStorage),
  );
  const selectedTenantId = useMemo(
    () =>
      tenantOptions.some((item) => item.id === requestedTenantId)
        ? requestedTenantId
        : "",
    [requestedTenantId, tenantOptions],
  );
  const selectedTenant = useMemo(
    () => tenantOptions.find((item) => item.id === selectedTenantId),
    [selectedTenantId, tenantOptions],
  );
  const fallbackTenantId = tenantOptions[0]?.id ?? "";

  const changeTenant = useCallback(
    async (tenantId: string) => {
      const normalized = tenantId.trim();
      if (!normalized || normalized === selectedTenantId) return;

      // Queries below the shell frequently use tenant-neutral keys while their
      // HTTP requests are scoped by X-Tenant-ID. Cancel and remove them before
      // changing the selection so Tenant A data can never be rendered from a
      // cache entry after Tenant B's Actor becomes effective. Keep only the
      // Account-owned tenant-option catalog used to perform the switch itself.
      await queryClient.cancelQueries();
      queryClient.removeQueries({
        predicate: (query) =>
          !isAccountTenantOptionsQuery(query.queryKey, accountId),
      });

      setSelectedTenantForAccount(window.localStorage, normalized, accountId);
      setRequestedTenantId(normalized);
      navigate("/", { replace: true });
    },
    [accountId, navigate, queryClient, selectedTenantId],
  );

  useEffect(() => {
    if (!selectedTenantId || typeof window === "undefined") return;
    setSelectedTenantForAccount(window.localStorage, selectedTenantId, accountId);
  }, [accountId, selectedTenantId]);

  // A stale persisted selection (or a tenant Actor that was just deactivated)
  // must transition through the same cache-clearing boundary as an explicit
  // user switch. Do not silently substitute the first option during render.
  useEffect(() => {
    if (
      tenantQuery.isLoading ||
      tenantQuery.error ||
      selectedTenantId ||
      !fallbackTenantId
    ) {
      return;
    }
    void changeTenant(fallbackTenantId);
  }, [
    changeTenant,
    fallbackTenantId,
    selectedTenantId,
    tenantQuery.error,
    tenantQuery.isLoading,
  ]);

  useEffect(
    () => subscribeForbidden(() => navigate("/forbidden", { replace: true })),
    [navigate],
  );

  useEffect(
    () =>
      subscribeTenantActorUnavailable(() => {
        if (!accountId) return;
        void queryClient.invalidateQueries({
          queryKey: ["auth", accountId, "tenant-options"],
        });
      }),
    [accountId, queryClient],
  );

  const actorQuery = useQuery({
    queryKey: ["authz", accountId, "current-actor", selectedTenantId],
    queryFn: () =>
      getCurrentAuthzActor(authorizationRequestContext(selectedTenantId)),
    enabled: Boolean(accountId && selectedTenantId),
    retry: (failureCount, error) =>
      !isTenantActorUnavailable(error) && failureCount < 2,
  });

  async function logout() {
    await endAuthSession();
    queryClient.clear();
    navigate("/login", { replace: true });
  }

  if (auth.status !== "authenticated") return null;
  const selectingFallback =
    !tenantQuery.isLoading &&
    !tenantQuery.error &&
    !selectedTenantId &&
    Boolean(fallbackTenantId);

  if (tenantQuery.isLoading || actorQuery.isLoading || selectingFallback) {
    return (
      <main className="grid min-h-screen place-items-center text-slate-600">
        {t("shell.loadingWorkspace")}
      </main>
    );
  }

  if (tenantQuery.error) {
    return (
      <WorkspaceError
        message={errorMessage(tenantQuery.error, t)}
        onRetry={() => void tenantQuery.refetch()}
        onLogout={() => void logout()}
      />
    );
  }

  if (!selectedTenantId || !selectedTenant) {
    return (
      <AccountSelfServiceWorkspace
        accountId={auth.session.accountId}
        displayName={auth.session.displayName}
        login={auth.session.login}
        onChangePassword={() => navigate("/password/change")}
        onLogout={() => void logout()}
      />
    );
  }

  if (actorQuery.error) {
    if (isTenantActorUnavailable(actorQuery.error)) {
      return (
        <WorkspaceError
          title={t("shell.tenantAccessChanged.title")}
          message={t("shell.tenantAccessChanged.message")}
          onRetry={() => void tenantQuery.refetch()}
          onLogout={() => void logout()}
        />
      );
    }
    return (
      <WorkspaceError
        message={errorMessage(actorQuery.error, t)}
        onRetry={() => void actorQuery.refetch()}
        onLogout={() => void logout()}
      />
    );
  }

  if (!actorQuery.data) {
    return (
      <AccountSelfServiceWorkspace
        accountId={auth.session.accountId}
        displayName={auth.session.displayName}
        login={auth.session.login}
        onChangePassword={() => navigate("/password/change")}
        onLogout={() => void logout()}
      />
    );
  }

  // A Support Access Lease preserves the canonical APPLICATION Actor and its
  // standing control-plane grants for identity/audit provenance, but those
  // grants are not usable while operating inside the leased Tenant context.
  // Present only the immutable lease allowlist to the workspace so navigation,
  // route guards, and page-level controls cannot advertise standing GLOBAL
  // authority that the backend correctly rejects in a leased context.
  const workspaceActor = actorQuery.data.supportLeaseId
    ? {
        ...actorQuery.data,
        permissions: [...(actorQuery.data.supportLeasePermissions ?? [])],
      }
    : actorQuery.data;

  const contextMismatch =
    selectedTenant.actorRecordId &&
    selectedTenant.actorScope === "TENANT" &&
    actorQuery.data.actorRecordId !== selectedTenant.actorRecordId;
  if (contextMismatch) {
    return (
      <WorkspaceError
        title={t("shell.authorizationMismatch.title")}
        message={t("shell.authorizationMismatch.message")}
        onRetry={() => {
          void Promise.all([tenantQuery.refetch(), actorQuery.refetch()]);
        }}
        onLogout={() => void logout()}
      />
    );
  }

  return (
    <AuthorizationProvider
      value={{
        ...workspaceActor,
        selectedTenantName: selectedTenant.name,
        selectedTenantCode: selectedTenant.code,
      }}
    >
      <div className="min-h-screen bg-slate-50">
        <TopBar
          session={auth.session}
          tenants={tenantOptions}
          selectedTenantId={selectedTenantId}
          effectiveActor={workspaceActor}
          onTenantChange={(tenantId) => void changeTenant(tenantId)}
          onTenantOptionsRefresh={async () => {
            await tenantQuery.refetch();
          }}
          onLogout={() => void logout()}
        />
        <div className="lg:flex">
          <SideNav
            permissions={workspaceActor.permissions}
            scope={workspaceActor.scope}
            identity={{
              personId: workspaceActor.personId,
              collaboratorId: workspaceActor.collaboratorId,
              supportLeaseId: workspaceActor.supportLeaseId,
            }}
          />
          <main className="min-w-0 flex-1">
            <Outlet />
          </main>
        </div>
      </div>
    </AuthorizationProvider>
  );
}

function isAccountTenantOptionsQuery(
  key: readonly unknown[],
  accountId: string,
): boolean {
  return (
    key[0] === "auth" &&
    key[1] === accountId &&
    key[2] === "tenant-options"
  );
}

function isTenantActorUnavailable(error: unknown): boolean {
  return error instanceof ApiError && error.code === "tenant_actor_unavailable";
}

function errorMessage(error: unknown, t: Translate): string {
  return error instanceof Error ? error.message : t("common.unexpectedError");
}

function WorkspaceError({
  title,
  message,
  onRetry,
  onLogout,
}: {
  title?: string;
  message: string;
  onRetry: () => void;
  onLogout: () => void;
}) {
  const { t } = useI18n();
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <section className="max-w-lg rounded-2xl border bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <PageTitle>{title ?? t("shell.unableOpen.title")}</PageTitle>
            <p className="mt-2 text-sm text-slate-600">{message}</p>
          </div>
          <LanguageSelector compact />
        </div>
        <div className="mt-4 flex gap-3">
          <button
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            onClick={onRetry}
          >
            {t("common.tryAgain")}
          </button>
          <button
            className="rounded-lg border px-4 py-2 text-sm font-semibold"
            onClick={onLogout}
          >
            {t("common.signOut")}
          </button>
        </div>
      </section>
    </main>
  );
}

function AccountSelfServiceWorkspace({
  accountId,
  displayName,
  login,
  onChangePassword,
  onLogout,
}: {
  accountId: string;
  displayName: string;
  login: string;
  onChangePassword: () => void;
  onLogout: () => void;
}) {
  const { t, formatDate, formatNumber } = useI18n();
  const selfServiceQuery = useQuery({
    queryKey: ["auth", accountId, "self-service"],
    queryFn: loadAuthSelfServiceHome,
    enabled: Boolean(accountId),
    staleTime: 30_000,
  });

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <section
        className="mx-auto max-w-5xl space-y-5"
        data-authenticated-account-id={accountId}
      >
        <header className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <PageTitle>{t("shell.signedIn.title")}</PageTitle>
              <p role="status" className="mt-1 text-sm text-slate-700">
                {t("shell.authenticationSucceededPrefix")} {" "}
                <span className="font-semibold">{displayName || login}</span>
                {t("shell.authenticationSucceededSuffix")}
              </p>
              {displayName && displayName !== login ? (
                <p className="mt-1 text-sm text-slate-600">
                  {t("shell.loginLabel")} {" "}
                  <span className="font-medium">{login}</span>
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <LanguageSelector compact />
              <button
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                onClick={onChangePassword}
              >
                {t("common.changePassword")}
              </button>
              <button
                className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold"
                onClick={onLogout}
              >
                {t("common.signOut")}
              </button>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h2 className="font-semibold text-amber-950">
              {t("shell.personalInfoAvailable.title")}
            </h2>
            <p className="mt-2 text-sm text-amber-900">
              {t("shell.personalInfoAvailable.message")}
            </p>
          </div>
        </header>

        {selfServiceQuery.isLoading ? (
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            {t("shell.loadingPersonal")}
          </section>
        ) : selfServiceQuery.error ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900">
            <h2 className="font-semibold">{t("shell.unableLoadPersonal")}</h2>
            <p className="mt-2 text-sm">{errorMessage(selfServiceQuery.error, t)}</p>
            <button
              className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold"
              onClick={() => void selfServiceQuery.refetch()}
            >
              {t("common.tryAgain")}
            </button>
          </section>
        ) : selfServiceQuery.data ? (
          <>
            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t("shell.personalSelfService")}
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-950">
                    {t("shell.myPerson")}
                  </h2>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {t("shell.personId", { id: selfServiceQuery.data.person.id })}
                </span>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <SelfServicePersonSection title={t("shell.section.personal")}>
                  <SelfField
                    label={t("shell.field.name")}
                    value={`${selfServiceQuery.data.person.firstName} ${selfServiceQuery.data.person.lastName}`.trim()}
                  />
                  <SelfField
                    label={t("shell.field.nickname")}
                    value={selfServiceQuery.data.person.nickname}
                  />
                  <SelfField label={t("shell.field.email")} value={selfServiceQuery.data.person.email} />
                  <SelfField
                    label={t("shell.field.cellular")}
                    value={selfServiceQuery.data.person.cellular}
                  />
                  <SelfField label={t("shell.field.cpf")} value={selfServiceQuery.data.person.cpf} />
                  <SelfField label={t("shell.field.rg")} value={selfServiceQuery.data.person.rg} />
                  <SelfField
                    label={t("shell.field.profileCompletion")}
                    value={selfServiceQuery.data.person.profileCompletionStatus}
                  />
                  <SelfField
                    label={t("shell.field.collaboratorEligible")}
                    value={selfServiceQuery.data.person.canCreateCollaborator ? t("common.yes") : t("common.no")}
                  />
                </SelfServicePersonSection>

                <SelfServicePersonSection title={t("shell.section.address")}>
                  <SelfField label={t("shell.field.street1")} value={selfServiceQuery.data.person.street1} />
                  <SelfField label={t("shell.field.street2")} value={selfServiceQuery.data.person.street2} />
                  <SelfField label={t("shell.field.city")} value={selfServiceQuery.data.person.city} />
                  <SelfField label={t("shell.field.state")} value={selfServiceQuery.data.person.state} />
                  <SelfField label={t("shell.field.cep")} value={selfServiceQuery.data.person.cep} />
                  <SelfField label={t("shell.field.country")} value={selfServiceQuery.data.person.country} />
                </SelfServicePersonSection>

                <SelfServicePersonSection title={t("shell.section.bank")}>
                  <SelfField label={t("shell.field.bankName")} value={selfServiceQuery.data.person.bankName} />
                  <SelfField label={t("shell.field.bankNumber")} value={selfServiceQuery.data.person.bankNumber} />
                  <SelfField
                    label={t("shell.field.checkingAccount")}
                    value={selfServiceQuery.data.person.checkingAccount}
                  />
                  <SelfField label={t("shell.field.pix")} value={selfServiceQuery.data.person.pixKey} />
                </SelfServicePersonSection>

                <SelfServicePersonSection title={t("shell.section.emergencyContact")}>
                  <SelfField
                    label={t("shell.field.name")}
                    value={selfServiceQuery.data.person.emergencyName}
                  />
                  <SelfField
                    label={t("shell.field.cellular")}
                    value={selfServiceQuery.data.person.emergencyCellular}
                  />
                  <SelfField
                    label={t("shell.field.email")}
                    value={selfServiceQuery.data.person.emergencyEmail}
                  />
                </SelfServicePersonSection>
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("shell.personalSelfService")}
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">
                  {t("shell.myCurrentAccount")}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {t("shell.currentAccountDescription")}
                </p>
              </div>

              {selfServiceQuery.data.balances.length > 0 ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {selfServiceQuery.data.balances.map((balance) => (
                    <div
                      key={`${balance.tenantId}:${balance.valueUnitId}`}
                      className="rounded-xl border bg-slate-50 p-4"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {balance.tenantName || balance.tenantId}
                      </p>
                      <p className="mt-1 text-lg font-bold text-slate-950">
                        {formatSelfServiceAmount(balance.balance, balance.valueUnitCode || balance.valueUnitLabel, formatNumber)}
                      </p>
                      <p className="text-xs text-slate-500">{balance.tenantId}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                  {t("shell.noCurrentAccountActivity")}
                </p>
              )}

              {selfServiceQuery.data.entries.length > 0 ? (
                <div className="mt-5 overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead>
                      <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2">{t("shell.table.date")}</th>
                        <th className="px-3 py-2">{t("shell.table.tenant")}</th>
                        <th className="px-3 py-2">{t("shell.table.description")}</th>
                        <th className="px-3 py-2">{t("shell.table.direction")}</th>
                        <th className="px-3 py-2 text-right">{t("shell.table.amount")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selfServiceQuery.data.entries.map((entry) => (
                        <tr key={entry.id}>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                            {formatDate(entry.effectiveDate, { dateStyle: "medium" })}
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-medium text-slate-900">
                              {entry.tenantName || entry.tenantId}
                            </p>
                            <p className="text-xs text-slate-500">
                              {entry.tenantId}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-slate-700">
                            {entry.description || entry.entryType || entry.sourceType}
                          </td>
                          <td className="px-3 py-3 text-slate-700">
                            {entry.direction}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-medium text-slate-900">
                            {formatSelfServiceAmount(entry.signedAmount, entry.valueUnitCode || entry.valueUnitLabel, formatNumber)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-5 text-sm text-slate-600">
                  {t("shell.noLedgerEntries")}
                </p>
              )}
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}


function SelfServicePersonSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-slate-50 p-4">
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      <dl className="mt-3 grid gap-x-5 gap-y-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function SelfField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-900">
        {value || "—"}
      </dd>
    </div>
  );
}

function formatSelfServiceAmount(
  value: number,
  unit: string,
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string,
): string {
  const formatted = formatNumber(value, { maximumFractionDigits: 4 });
  return unit ? `${formatted} ${unit}` : formatted;
}
