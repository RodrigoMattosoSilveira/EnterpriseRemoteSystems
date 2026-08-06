import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAuthAccount,
  issuePasswordResetToken,
  listAuthAccounts,
  setAuthAccountActive,
} from "../../api/auth.api";
import { listAuthzActors } from "../../api/authz.api";
import {
  authorizationRequestContext,
  readSelectedTenantId,
} from "../../api/tenantSelection";
import { useAuthState } from "../../app/useAuth";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import type { AuthAccount } from "../../types/auth";
import type { AuthzActor, AuthzActorRoleGrant } from "../../types/authz";

export function activeAuthenticationGrants(
  actor: AuthzActor,
): AuthzActorRoleGrant[] {
  return (actor.roleGrants ?? []).filter((grant) => grant.active);
}

export function isAuthenticationActorEligible(actor: AuthzActor): boolean {
  return actor.active && activeAuthenticationGrants(actor).length > 0;
}

export function authenticationActorOptionLabel(actor: AuthzActor): string {
  const access = activeAuthenticationGrants(actor)
    .map((grant) => `${grant.roleCode} @ ${grant.tenantId}`)
    .join(", ");
  return `${actor.displayName} (${actor.actorKey}) — ${access}`;
}

export function canIssuePasswordResetToken(account: AuthAccount): boolean {
  return account.active && account.actorActive;
}

export function AuthenticationAdminPage() {
  const auth = useAuthState();
  const queryClient = useQueryClient();
  const tenantId = readSelectedTenantId(window.localStorage);
  const actorContext = authorizationRequestContext(tenantId);
  const accounts = useQuery({
    queryKey: ["auth", "accounts"],
    queryFn: listAuthAccounts,
  });
  const actors = useQuery({
    queryKey: ["authz", "actors", tenantId],
    queryFn: () => listAuthzActors(actorContext),
  });
  const [actorId, setActorId] = useState("");
  const [login, setLogin] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [actionError, setActionError] = useState<unknown>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<{
    accountId: string;
    login: string;
    token: string;
    expiresAt: string;
  } | null>(null);
  const mutation = useMutation({
    mutationFn: createAuthAccount,
    onMutate: () => setActionError(null),
    onSuccess: () => {
      setActorId("");
      setLogin("");
      setTemporaryPassword("");
      void queryClient.invalidateQueries({ queryKey: ["auth", "accounts"] });
    },
  });
  const availableActors = useMemo(() => {
    const linked = new Set((accounts.data ?? []).map((account) => account.actorId));
    return (actors.data ?? []).filter(
      (actor) => isAuthenticationActorEligible(actor) && !linked.has(actor.id),
    );
  }, [accounts.data, actors.data]);

  async function toggle(accountId: string, active: boolean) {
    setActionError(null);
    setPendingAction(`active:${accountId}`);
    try {
      await setAuthAccountActive(accountId, active);
      await queryClient.invalidateQueries({ queryKey: ["auth", "accounts"] });
    } catch (error) {
      setActionError(error);
    } finally {
      setPendingAction(null);
    }
  }

  async function issue(accountId: string) {
    setActionError(null);
    setResetToken(null);
    setPendingAction(`reset:${accountId}`);
    try {
      const token = await issuePasswordResetToken(accountId);
      if (token.accountId !== accountId) {
        throw new Error("Password reset token was issued for a different authentication account");
      }
      setResetToken({
        accountId: token.accountId,
        login: token.login,
        token: token.token,
        expiresAt: token.expiresAt,
      });
    } catch (error) {
      setActionError(error);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Authentication Accounts</h1>
      <p className="mt-1 text-sm text-slate-600">
        Create login accounts, suspend access, and issue one-time password-reset
        tokens.
      </p>
      <ApiErrorPanel
        error={accounts.error ?? actors.error ?? mutation.error ?? actionError}
      />

      <section className="mt-6 rounded-2xl border bg-white p-5">
        <h2 className="text-lg font-semibold">Create account</h2>
        <form
          className="mt-4 grid gap-4 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({
              actorId,
              login,
              temporaryPassword,
              mustChangePassword: true,
            });
          }}
        >
          <label className="text-sm font-medium">
            Authorization actor
            <select
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={actorId}
              onChange={(event) => setActorId(event.target.value)}
              required
            >
              <option value="">Select actor</option>
              {availableActors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {authenticationActorOptionLabel(actor)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Login
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2"
              type="email"
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              required
            />
          </label>
          <label className="text-sm font-medium">
            Temporary password
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2"
              type="password"
              minLength={12}
              value={temporaryPassword}
              onChange={(event) => setTemporaryPassword(event.target.value)}
              required
            />
          </label>
          {availableActors.length === 0 && !actors.isLoading && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 md:col-span-3">
              No eligible authorization actors are available. Assign an active
              role grant for an active tenant in{" "}
              <a className="font-semibold underline" href="/admin/authorization">
                Authorization
              </a>{" "}
              before creating a login account.
            </p>
          )}
          <button
            className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white md:col-span-3"
            disabled={mutation.isPending || availableActors.length === 0}
          >
            {mutation.isPending ? "Creating…" : "Create account"}
          </button>
        </form>
      </section>

      {resetToken && (
        <section
          role="status"
          className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5"
        >
          <h2 className="font-semibold">
            One-time reset token for {resetToken.login}
          </h2>
          <p
            aria-label="Password reset token"
            className="mt-2 break-all rounded bg-white p-3 font-mono text-sm"
          >
            {resetToken.token}
          </p>
          <p className="mt-2 text-xs">
            Expires {new Date(resetToken.expiresAt).toLocaleString()}. Copy it
            now; ERS will not show it again.
          </p>
          <a
            className="mt-3 inline-block underline"
            href={`/password/reset?token=${encodeURIComponent(resetToken.token)}`}
          >
            Open reset page
          </a>
        </section>
      )}

      <section className="mt-6 overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-3">User</th>
              <th className="p-3">Actor</th>
              <th className="p-3">Status</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(accounts.data ?? []).map((account) => {
              const activePending = pendingAction === `active:${account.id}`;
              const resetPending = pendingAction === `reset:${account.id}`;
              const resetEligible = canIssuePasswordResetToken(account);
              const isCurrentAccount =
                account.actorId ===
                (auth.status === "authenticated" ? auth.session.actorId : "");
              return (
                <tr key={account.id} className="border-t">
                  <td className="p-3">
                    <strong>{account.displayName}</strong>
                    <br />
                    <span className="text-slate-500">{account.login}</span>
                  </td>
                  <td className="p-3">{account.actorKey}</td>
                  <td className="p-3">
                    {account.active && account.actorActive ? "Active" : "Inactive"}
                    {account.mustChangePassword
                      ? " · Password change required"
                      : ""}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded border px-2 py-1 disabled:opacity-50"
                        disabled={isCurrentAccount || activePending || pendingAction !== null}
                        title={isCurrentAccount ? "You cannot deactivate your own account" : undefined}
                        onClick={() => void toggle(account.id, !account.active)}
                      >
                        {activePending
                          ? "Saving…"
                          : account.active
                            ? "Deactivate"
                            : "Activate"}
                      </button>
                      <button
                        className="rounded border px-2 py-1 disabled:opacity-50"
                        disabled={
                          !resetEligible || resetPending || pendingAction !== null
                        }
                        title={
                          resetEligible
                            ? undefined
                            : "Activate the authentication account and authorization actor before issuing a reset token"
                        }
                        onClick={() => void issue(account.id)}
                      >
                        {resetPending ? "Issuing…" : "Issue reset token"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
