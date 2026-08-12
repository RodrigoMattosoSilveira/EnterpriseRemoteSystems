import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, useNavigate } from "react-router-dom";
import { loadAuthTenantOptions, normalizeAuthTenantOptions } from "../../api/auth.api";
import { getCurrentAuthzActor } from "../../api/authz.api";
import { authorizationRequestContext, readSelectedTenantId, setSelectedTenantId } from "../../api/tenantSelection";
import { endAuthSession } from "../../app/authStore";
import { subscribeForbidden } from "../../app/authEvents";
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
    typeof window === "undefined" ? "default" : readSelectedTenantId(window.localStorage),
  );
  const selectedTenantId = useMemo(() => {
    return tenantOptions.some((item) => item.id === requestedTenantId)
      ? requestedTenantId
      : tenantOptions[0]?.id ?? "";
  }, [requestedTenantId, tenantOptions]);

  useEffect(() => {
    if (!selectedTenantId || typeof window === "undefined") return;
    setSelectedTenantId(window.localStorage, selectedTenantId);
    if (requestedTenantId !== selectedTenantId) setRequestedTenantId(selectedTenantId);
  }, [requestedTenantId, selectedTenantId]);

  useEffect(() => subscribeForbidden(() => navigate("/forbidden", { replace: true })), [navigate]);

  const actorQuery = useQuery({
    queryKey: ["authz", accountId, "current-actor", selectedTenantId],
    queryFn: () => getCurrentAuthzActor(authorizationRequestContext(selectedTenantId)),
    enabled: Boolean(accountId && selectedTenantId),
  });

  async function logout() {
    await endAuthSession();
    queryClient.clear();
    navigate("/login", { replace: true });
  }

  if (auth.status !== "authenticated") return null;
  if (tenantQuery.isLoading || actorQuery.isLoading) return <main className="grid min-h-screen place-items-center text-slate-600">Loading your workspace…</main>;
  if (tenantQuery.error || actorQuery.error) {
    const error = tenantQuery.error ?? actorQuery.error;
    const message = error instanceof Error ? error.message : "Unexpected error";
    return <main className="grid min-h-screen place-items-center p-6"><section className="max-w-lg rounded-2xl border bg-white p-6"><h1 className="text-xl font-bold">Unable to open your workspace</h1><p className="mt-2 text-sm text-slate-600">{message}</p><div className="mt-4 flex gap-3"><button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white" onClick={() => { void Promise.all([tenantQuery.refetch(), actorQuery.refetch()]); }}>Try again</button><button className="rounded-lg border px-4 py-2 text-sm font-semibold" onClick={() => void logout()}>Sign out</button></div></section></main>;
  }
  if (!selectedTenantId || !actorQuery.data) return <main className="grid min-h-screen place-items-center p-6"><section className="max-w-lg rounded-2xl border bg-white p-6"><h1 className="text-xl font-bold">No tenant access</h1><p className="mt-2 text-sm text-slate-600">Your account has no active tenant grants. Contact an Application Administrator.</p><button className="mt-4 rounded-lg border px-4 py-2 text-sm font-semibold" onClick={() => void logout()}>Sign out</button></section></main>;

  function changeTenant(tenantId: string) {
    setSelectedTenantId(window.localStorage, tenantId);
    setRequestedTenantId(tenantId);
    queryClient.clear();
    navigate("/", { replace: true });
  }
  return <AuthorizationProvider value={actorQuery.data}><div className="min-h-screen bg-slate-50"><TopBar session={auth.session} tenants={tenantOptions} selectedTenantId={selectedTenantId} onTenantChange={changeTenant} onLogout={() => void logout()} /><div className="lg:flex"><SideNav permissions={actorQuery.data.permissions} scope={actorQuery.data.scope} identity={{ personId: actorQuery.data.personId, collaboratorId: actorQuery.data.collaboratorId }} /><main className="min-w-0 flex-1"><Outlet /></main></div></div></AuthorizationProvider>;
}
