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
import { useCollaboratorSearch } from "../collaborators/useCollaborators";
import type { AuthAccount } from "../../types/auth";
import type { AuthzActor, AuthzActorRoleGrant } from "../../types/authz";
import type { Collaborator } from "../../types/collaborators";

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

export function authenticationActorForCollaborator(
  collaborator: Collaborator,
  actors: AuthzActor[],
): AuthzActor | undefined {
  return actors.find((actor) => actor.collaboratorId === collaborator.id);
}

export function authenticationAccountForActor(
  actor: AuthzActor | undefined,
  accounts: AuthAccount[],
): AuthAccount | undefined {
  if (!actor) return undefined;
  return accounts.find((account) => account.actorId === actor.id);
}

export function authenticationCollaboratorStatusLabel(
  actor: AuthzActor | undefined,
  account: AuthAccount | undefined,
): string {
  if (!actor) return "No authorization actor";
  if (account) {
    return `Already has authentication account ${account.login} (${
      account.active && account.actorActive ? "active" : "inactive"
    })`;
  }
  if (!actor.active) return "Authorization actor is inactive";
  if (activeAuthenticationGrants(actor).length === 0) {
    return "Authorization actor has no active role grant";
  }
  return "Eligible for account creation";
}

export function canCreateAuthenticationAccountForCollaborator(
  actor: AuthzActor | undefined,
  account: AuthAccount | undefined,
): actor is AuthzActor {
  return Boolean(actor && !account && isAuthenticationActorEligible(actor));
}

export function authenticationCollaboratorOptionLabel(
  collaborator: Collaborator,
  actor: AuthzActor,
): string {
  const name = collaborator.personName?.trim() || actor.displayName;
  const nickname = collaborator.personNickname?.trim();
  const identity = nickname && nickname !== name ? `${name} (${nickname})` : name;
  return `${identity} — ${authenticationActorOptionLabel(actor)}`;
}

export function AuthenticationAdminPage() {
  const auth = useAuthState();
  const queryClient = useQueryClient();
  const tenantId = readSelectedTenantId(window.localStorage);
  const actorContext = authorizationRequestContext(tenantId);
  const accounts = useQuery({
    queryKey: ["auth", "accounts"],
    queryFn: listAuthAccounts,
    refetchOnWindowFocus: false,
  });
  const actors = useQuery({
    queryKey: ["authz", "actors", tenantId],
    queryFn: () => listAuthzActors(actorContext),
    refetchOnWindowFocus: false,
  });
  const [selectedActor, setSelectedActor] = useState<AuthzActor | null>(null);
  const [selectedCollaborator, setSelectedCollaborator] =
    useState<Collaborator | null>(null);
  const [collaboratorSearch, setCollaboratorSearch] = useState("");
  const collaboratorSearchQuery = useCollaboratorSearch(
    collaboratorSearch,
    false,
  );
  const [actorLookupSearch, setActorLookupSearch] = useState("");
  const actorLookupCollaborators = useCollaboratorSearch(
    actorLookupSearch,
    false,
  );
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
      setSelectedActor(null);
      setSelectedCollaborator(null);
      setCollaboratorSearch("");
      setLogin("");
      setTemporaryPassword("");
      void queryClient.invalidateQueries({ queryKey: ["auth", "accounts"] });
    },
  });
  const availableActors = useMemo(() => {
    const linked = new Set((accounts.data ?? []).map((account) => account.actorId));
    return (actors.data ?? []).filter(
      (actor) =>
        isAuthenticationActorEligible(actor) &&
        !linked.has(actor.id) &&
        Boolean(actor.collaboratorId),
    );
  }, [accounts.data, actors.data]);
  const matchingCollaborators = useMemo(() => {
    const actorItems = actors.data ?? [];
    const accountItems = accounts.data ?? [];
    return (collaboratorSearchQuery.data?.items ?? []).map((collaborator) => {
      const actor = authenticationActorForCollaborator(collaborator, actorItems);
      const account = authenticationAccountForActor(actor, accountItems);
      return {
        collaborator,
        actor,
        account,
        canCreate: canCreateAuthenticationAccountForCollaborator(actor, account),
        statusLabel: authenticationCollaboratorStatusLabel(actor, account),
      };
    });
  }, [accounts.data, actors.data, collaboratorSearchQuery.data]);
  const actorLookupResults = useMemo(() => {
    const actorItems = actors.data ?? [];
    const accountItems = accounts.data ?? [];
    return (actorLookupCollaborators.data?.items ?? []).map((collaborator) => {
      const actor = authenticationActorForCollaborator(collaborator, actorItems);
      const account = authenticationAccountForActor(actor, accountItems);
      return { collaborator, actor, account };
    });
  }, [accounts.data, actorLookupCollaborators.data, actors.data]);
  const showCollaboratorSuggestions =
    collaboratorSearch.trim().length > 0 && selectedCollaborator === null;
  const showActorLookup = actorLookupSearch.trim().length > 0;
  const filteredAccounts = useMemo(() => {
    const search = actorLookupSearch.trim().toLowerCase();
    if (!search) return accounts.data ?? [];

    const matchedActorIds = new Set(
      actorLookupResults
        .map((result) => result.actor?.id)
        .filter((actorId): actorId is string => Boolean(actorId)),
    );
    return (accounts.data ?? []).filter(
      (account) =>
        matchedActorIds.has(account.actorId) ||
        account.login.toLowerCase().includes(search) ||
        account.actorKey.toLowerCase().includes(search) ||
        account.displayName.toLowerCase().includes(search),
    );
  }, [accounts.data, actorLookupResults, actorLookupSearch]);

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
              actorId: selectedActor?.id ?? "",
              login,
              temporaryPassword,
              mustChangePassword: true,
            });
          }}
        >
          <div className="relative text-sm font-medium md:col-span-3">
            <label htmlFor="authentication-collaborator-search">
              Find collaborator by name or nickname
            </label>
            <input
              id="authentication-collaborator-search"
              className="mt-1 w-full rounded-lg border px-3 py-2"
              type="search"
              role="combobox"
              aria-autocomplete="list"
              aria-controls={
                showCollaboratorSuggestions
                  ? "authentication-collaborator-suggestions"
                  : undefined
              }
              aria-expanded={showCollaboratorSuggestions}
              placeholder="Type any part of the collaborator name or nickname"
              value={collaboratorSearch}
              onChange={(event) => setCollaboratorSearch(event.target.value)}
              disabled={selectedCollaborator !== null}
            />

            {showCollaboratorSuggestions && (
              <div
                id="authentication-collaborator-suggestions"
                role="listbox"
                aria-label="Matching collaborators for authentication account"
                className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
              >
                {collaboratorSearchQuery.isLoading ||
                collaboratorSearchQuery.isFetching ? (
                  <p className="px-3 py-2 text-sm text-slate-500">
                    Loading matching collaborators…
                  </p>
                ) : collaboratorSearchQuery.error ? (
                  <p className="px-3 py-2 text-sm text-red-700">
                    Could not load matching collaborators.
                  </p>
                ) : matchingCollaborators.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-slate-500">
                    No matching collaborators
                  </p>
                ) : (
                  matchingCollaborators.map(
                    ({ collaborator, actor, canCreate, statusLabel }) => {
                      const collaboratorName =
                        collaborator.personName?.trim() || "Unnamed collaborator";
                      const nickname = collaborator.personNickname?.trim();
                      const identity =
                        nickname && nickname !== collaboratorName
                          ? `${collaboratorName} (${nickname})`
                          : collaboratorName;

                      if (!actor || !canCreate) {
                        return (
                          <div
                            key={collaborator.id}
                            role="option"
                            aria-disabled="true"
                            className="rounded-lg px-3 py-2 text-left text-sm text-slate-700"
                          >
                            <p className="font-medium">{identity}</p>
                            {actor && (
                              <p className="mt-0.5 text-xs text-slate-500">
                                Actor: {authenticationActorOptionLabel(actor)}
                              </p>
                            )}
                            <p className="mt-0.5 text-xs font-medium text-amber-700">
                              {statusLabel}
                            </p>
                          </div>
                        );
                      }

                      return (
                        <button
                          key={actor.id}
                          type="button"
                          role="option"
                          aria-selected={selectedActor?.id === actor.id}
                          onClick={() => {
                            setSelectedActor(actor);
                            setSelectedCollaborator(collaborator);
                            setCollaboratorSearch("");
                          }}
                          className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                        >
                          {authenticationCollaboratorOptionLabel(collaborator, actor)}
                          <span className="mt-0.5 block text-xs font-medium text-emerald-700">
                            {statusLabel}
                          </span>
                        </button>
                      );
                    },
                  )
                )}
              </div>
            )}

            {selectedCollaborator && selectedActor && (
              <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">Selected collaborator</p>
                    <p className="mt-1">
                      {authenticationCollaboratorOptionLabel(
                        selectedCollaborator,
                        selectedActor,
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-blue-200 bg-white px-2 py-1 font-semibold text-blue-800"
                    onClick={() => {
                      setSelectedActor(null);
                      setSelectedCollaborator(null);
                      setCollaboratorSearch("");
                    }}
                  >
                    Change
                  </button>
                </div>
              </div>
            )}
          </div>
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
              No eligible collaborator-linked authorization actors are available.
              Assign an active role grant for an active tenant in{" "}
              <a className="font-semibold underline" href="/admin/authorization">
                Authorization
              </a>{" "}
              before creating a login account.
            </p>
          )}
          <button
            className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white md:col-span-3"
            disabled={mutation.isPending || selectedActor === null}
          >
            {mutation.isPending ? "Creating…" : "Create account"}
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-2xl border bg-white p-5">
        <h2 className="text-lg font-semibold">Actor/account filter</h2>
        <p className="mt-1 text-sm text-slate-600">
          Search by collaborator name or nickname to see whether an Authorization
          Actor and Authentication Account already exist.
        </p>
        <label
          className="mt-4 block text-sm font-medium"
          htmlFor="authentication-actor-lookup"
        >
          Filter by collaborator name or nickname
        </label>
        <input
          id="authentication-actor-lookup"
          className="mt-1 w-full rounded-lg border px-3 py-2"
          type="search"
          placeholder="Type collaborator name, nickname, actor key, or login"
          value={actorLookupSearch}
          onChange={(event) => setActorLookupSearch(event.target.value)}
        />

        {showActorLookup && (
          <div
            role="list"
            aria-label="Actor lookup results"
            className="mt-3 divide-y rounded-xl border border-slate-200"
          >
            {actorLookupCollaborators.isLoading ||
            actorLookupCollaborators.isFetching ? (
              <p className="p-3 text-sm text-slate-500">Loading actor matches…</p>
            ) : actorLookupCollaborators.error ? (
              <p className="p-3 text-sm text-red-700">Could not load actor matches.</p>
            ) : actorLookupResults.length === 0 ? (
              <p className="p-3 text-sm text-slate-500">No matching collaborators.</p>
            ) : (
              actorLookupResults.map(({ collaborator, actor, account }) => {
                const collaboratorName =
                  collaborator.personName?.trim() || "Unnamed collaborator";
                const nickname = collaborator.personNickname?.trim();
                return (
                  <article key={collaborator.id} role="listitem" className="p-3 text-sm">
                    <p className="font-semibold text-slate-900">
                      {collaboratorName}
                      {nickname && nickname !== collaboratorName
                        ? ` (${nickname})`
                        : ""}
                    </p>
                    {!actor ? (
                      <p className="mt-1 text-amber-700">Authorization actor: none</p>
                    ) : (
                      <>
                        <p className="mt-1 text-slate-700">
                          Actor: {actor.displayName} ({actor.actorKey}) · {actor.active ? "Active" : "Inactive"}
                        </p>
                        <p className="mt-1 text-slate-500">
                          Grants: {activeAuthenticationGrants(actor).length > 0
                            ? activeAuthenticationGrants(actor)
                                .map((grant) => `${grant.roleCode} @ ${grant.tenantId}`)
                                .join(", ")
                            : "none active"}
                        </p>
                        <p className="mt-1 font-medium text-slate-700">
                          Authentication account: {account
                            ? `${account.login} · ${
                                account.active && account.actorActive
                                  ? "Active"
                                  : "Inactive"
                              }`
                            : "none"}
                        </p>
                      </>
                    )}
                  </article>
                );
              })
            )}
          </div>
        )}
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
            {filteredAccounts.length === 0 && (
              <tr className="border-t">
                <td className="p-3 text-slate-500" colSpan={4}>
                  {showActorLookup
                    ? "No authentication accounts match this actor/account filter."
                    : "No authentication accounts."}
                </td>
              </tr>
            )}
            {filteredAccounts.map((account) => {
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
