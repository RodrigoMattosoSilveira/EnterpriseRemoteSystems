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
  setSelectedTenantId,
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

export function AppShell() {
  const auth = useAuthState();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const authenticatedSession =
    auth.status === "authenticated" ? auth.session : null;
  const accountId = authenticatedSession?.accountId ?? "";

  const tenantQuery = useQuery({
    queryKey: ["auth", accountId, "tenant-options"],
    queryFn: loadAuthTenantOptions,
    enabled: Boolean(accountId),
    staleTime: 60_000,
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

      setSelectedTenantId(window.localStorage, normalized);
      setRequestedTenantId(normalized);
      navigate("/", { replace: true });
    },
    [accountId, navigate, queryClient, selectedTenantId],
  );

  useEffect(() => {
    if (!selectedTenantId || typeof window === "undefined") return;
    setSelectedTenantId(window.localStorage, selectedTenantId);
  }, [selectedTenantId]);

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
        Loading your workspace…
      </main>
    );
  }

  if (tenantQuery.error) {
    return (
      <WorkspaceError
        message={errorMessage(tenantQuery.error)}
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
          title="Tenant access changed"
          message="Your Authentication Account is still signed in, but its Actor for this tenant is no longer active or no longer has an ACTIVE Membership. Refresh access to select another available tenant."
          onRetry={() => void tenantQuery.refetch()}
          onLogout={() => void logout()}
        />
      );
    }
    return (
      <WorkspaceError
        message={errorMessage(actorQuery.error)}
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

  const contextMismatch =
    selectedTenant.actorRecordId &&
    selectedTenant.actorScope === "TENANT" &&
    actorQuery.data.actorRecordId !== selectedTenant.actorRecordId;
  if (contextMismatch) {
    return (
      <WorkspaceError
        title="Authorization context mismatch"
        message="The effective Actor does not match the Actor advertised for the selected tenant. ERS stopped before rendering tenant data."
        onRetry={() => {
          void Promise.all([tenantQuery.refetch(), actorQuery.refetch()]);
        }}
        onLogout={() => void logout()}
      />
    );
  }

  return (
    <AuthorizationProvider value={actorQuery.data}>
      <div className="min-h-screen bg-slate-50">
        <TopBar
          session={auth.session}
          tenants={tenantOptions}
          selectedTenantId={selectedTenantId}
          effectiveActor={actorQuery.data}
          onTenantChange={(tenantId) => void changeTenant(tenantId)}
          onLogout={() => void logout()}
        />
        <div className="lg:flex">
          <SideNav
            permissions={actorQuery.data.permissions}
            scope={actorQuery.data.scope}
            identity={{
              personId: actorQuery.data.personId,
              collaboratorId: actorQuery.data.collaboratorId,
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

function WorkspaceError({
  title = "Unable to open your workspace",
  message,
  onRetry,
  onLogout,
}: {
  title?: string;
  message: string;
  onRetry: () => void;
  onLogout: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <section className="max-w-lg rounded-2xl border bg-white p-6">
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <div className="mt-4 flex gap-3">
          <button
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            onClick={onRetry}
          >
            Try again
          </button>
          <button
            className="rounded-lg border px-4 py-2 text-sm font-semibold"
            onClick={onLogout}
          >
            Sign out
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
              <h1 className="text-2xl font-bold text-slate-950">Signed in</h1>
              <p role="status" className="mt-1 text-sm text-slate-700">
                Authentication succeeded for{" "}
                <span className="font-semibold">{displayName || login}</span>.
              </p>
              {displayName && displayName !== login ? (
                <p className="mt-1 text-sm text-slate-600">
                  Login: <span className="font-medium">{login}</span>
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                onClick={onChangePassword}
              >
                Change password
              </button>
              <button
                className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold"
                onClick={onLogout}
              >
                Sign out
              </button>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h2 className="font-semibold text-amber-950">
              Your personal information is still available
            </h2>
            <p className="mt-2 text-sm text-amber-900">
              You currently do not have access to work or administrative features.
              You can still view your personal information and read-only Current Account history below.
            </p>
          </div>
        </header>

        {selfServiceQuery.isLoading ? (
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            Loading your personal information…
          </section>
        ) : selfServiceQuery.error ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900">
            <h2 className="font-semibold">Unable to load personal information</h2>
            <p className="mt-2 text-sm">{errorMessage(selfServiceQuery.error)}</p>
            <button
              className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold"
              onClick={() => void selfServiceQuery.refetch()}
            >
              Try again
            </button>
          </section>
        ) : selfServiceQuery.data ? (
          <>
            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Personal self-service
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-950">
                    My Person
                  </h2>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  Person ID: {selfServiceQuery.data.person.id}
                </span>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <SelfServicePersonSection title="Personal">
                  <SelfField
                    label="Name"
                    value={`${selfServiceQuery.data.person.firstName} ${selfServiceQuery.data.person.lastName}`.trim()}
                  />
                  <SelfField
                    label="Nickname"
                    value={selfServiceQuery.data.person.nickname}
                  />
                  <SelfField label="Email" value={selfServiceQuery.data.person.email} />
                  <SelfField
                    label="Cellular"
                    value={selfServiceQuery.data.person.cellular}
                  />
                  <SelfField label="CPF" value={selfServiceQuery.data.person.cpf} />
                  <SelfField label="RG" value={selfServiceQuery.data.person.rg} />
                  <SelfField
                    label="Profile completion"
                    value={selfServiceQuery.data.person.profileCompletionStatus}
                  />
                  <SelfField
                    label="Collaborator profile eligible"
                    value={selfServiceQuery.data.person.canCreateCollaborator ? "Yes" : "No"}
                  />
                </SelfServicePersonSection>

                <SelfServicePersonSection title="Address">
                  <SelfField label="Street 1" value={selfServiceQuery.data.person.street1} />
                  <SelfField label="Street 2" value={selfServiceQuery.data.person.street2} />
                  <SelfField label="City" value={selfServiceQuery.data.person.city} />
                  <SelfField label="State" value={selfServiceQuery.data.person.state} />
                  <SelfField label="CEP" value={selfServiceQuery.data.person.cep} />
                  <SelfField label="Country" value={selfServiceQuery.data.person.country} />
                </SelfServicePersonSection>

                <SelfServicePersonSection title="Bank">
                  <SelfField label="Bank Name" value={selfServiceQuery.data.person.bankName} />
                  <SelfField label="Bank Number" value={selfServiceQuery.data.person.bankNumber} />
                  <SelfField
                    label="Checking Account"
                    value={selfServiceQuery.data.person.checkingAccount}
                  />
                  <SelfField label="PIX" value={selfServiceQuery.data.person.pixKey} />
                </SelfServicePersonSection>

                <SelfServicePersonSection title="Emergency Contact">
                  <SelfField
                    label="Name"
                    value={selfServiceQuery.data.person.emergencyName}
                  />
                  <SelfField
                    label="Cellular"
                    value={selfServiceQuery.data.person.emergencyCellular}
                  />
                  <SelfField
                    label="Email"
                    value={selfServiceQuery.data.person.emergencyEmail}
                  />
                </SelfServicePersonSection>
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Personal self-service
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">
                  My Current Account
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Read-only balances and ledger entries belonging to your Person.
                  Tenant provenance is preserved even when the corresponding
                  Tenant Actor or Membership is inactive.
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
                        {formatSelfServiceAmount(
                          balance.balance,
                          balance.valueUnitCode || balance.valueUnitLabel,
                        )}
                      </p>
                      <p className="text-xs text-slate-500">{balance.tenantId}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                  No Current Account activity is recorded for this Person.
                </p>
              )}

              {selfServiceQuery.data.entries.length > 0 ? (
                <div className="mt-5 overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead>
                      <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Tenant</th>
                        <th className="px-3 py-2">Description</th>
                        <th className="px-3 py-2">Direction</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selfServiceQuery.data.entries.map((entry) => (
                        <tr key={entry.id}>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                            {formatSelfServiceDate(entry.effectiveDate)}
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
                            {formatSelfServiceAmount(
                              entry.signedAmount,
                              entry.valueUnitCode || entry.valueUnitLabel,
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-5 text-sm text-slate-600">
                  No Current Account ledger entries are recorded for this Person.
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

function formatSelfServiceDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function formatSelfServiceAmount(value: number, unit: string): string {
  const formatted = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 4,
  }).format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}
