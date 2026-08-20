import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, useNavigate } from "react-router-dom";
import { ApiError } from "../../api/client";
import { loadAuthTenantOptions, normalizeAuthTenantOptions } from "../../api/auth.api";
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
      <NoTenantAccess
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
      <NoTenantAccess
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

function NoTenantAccess({
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
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <section
        className="max-w-lg rounded-2xl border bg-white p-6"
        data-authenticated-account-id={accountId}
      >
        <h1 className="text-xl font-bold">Signed in</h1>
        <p role="status" className="mt-2 text-sm text-slate-700">
          Authentication succeeded for{" "}
          <span className="font-semibold">{displayName || login}</span>.
        </p>
        {displayName && displayName !== login ? (
          <p className="mt-1 text-sm text-slate-600">
            Login: <span className="font-medium">{login}</span>
          </p>
        ) : null}

        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-950">No tenant access</h2>
          <p className="mt-2 text-sm text-amber-900">
            Your Authentication Account is active and remains signed in, but it
            currently has no active tenant Actor backed by an ACTIVE
            same-tenant Person–Tenant Membership. No tenant workspace is
            available until tenant access is restored.
          </p>
        </div>

        <p className="mt-4 text-sm text-slate-600">
          Contact a Tenant Administrator or Application Administrator to restore
          tenant access. You can still change your Authentication Account
          password or sign out.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            onClick={onChangePassword}
          >
            Change password
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
