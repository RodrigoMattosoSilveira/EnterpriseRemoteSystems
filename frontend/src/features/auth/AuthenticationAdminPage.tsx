import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAuthAccount,
  issuePasswordResetToken,
  listAuthAccounts,
  loadAuthTenantOptions,
  setAuthAccountActive,
} from "../../api/auth.api";
import { listAuthzActors } from "../../api/authz.api";
import { listPeoplePage } from "../../api/people.api";
import {
  authorizationRequestContext,
  readSelectedTenantId,
  setSelectedTenantId,
} from "../../api/tenantSelection";
import { useAuthState } from "../../app/useAuth";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { useCollaboratorSearch } from "../collaborators/useCollaborators";
import type { AuthAccount, AuthAccountActor } from "../../types/auth";
import type { AuthzActor, AuthzActorRoleGrant } from "../../types/authz";
import type { Collaborator } from "../../types/collaborators";
import type { Person } from "../../types/people";

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
  const anyActorActive = account.actors?.some((actor) => actor.active) ?? account.actorActive;
  return account.active && anyActorActive;
}

export function authenticationActorForCollaborator(
  collaborator: Collaborator,
  actors: AuthzActor[],
): AuthzActor | undefined {
  const collaboratorActor = actors.find(
    (actor) => actor.collaboratorId === collaborator.id,
  );
  if (collaboratorActor) return collaboratorActor;

  // Bite 30C makes the tenant Actor represent the Person/Membership. During
  // the transition an Actor does not have to retain a Collaborator Journey ID,
  // so bridge collaborator search results through the tenant Person identity.
  return actors.find(
    (actor) =>
      actor.personId === collaborator.personId &&
      activeAuthenticationGrants(actor).some(
        (grant) => grant.tenantId === collaborator.tenantId,
      ),
  );
}

export function authenticationAccountForActor(
  actor: AuthzActor | undefined,
  accounts: AuthAccount[],
): AuthAccount | undefined {
  if (!actor) return undefined;
  return accounts.find(
    (account) =>
      account.actorId === actor.id ||
      account.actors?.some((linkedActor) => linkedActor.actorId === actor.id),
  );
}

export function authenticationActorForPerson(
  person: Person,
  actors: AuthzActor[],
): AuthzActor | undefined {
  const personIds = new Set(
    [person.id, person.globalPersonId]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value)),
  );
  return actors.find(
    (actor) => Boolean(actor.personId && personIds.has(actor.personId)),
  );
}

export function authenticationAccountForPerson(
  person: Person,
  accounts: AuthAccount[],
): AuthAccount | undefined {
  const globalPersonId = person.globalPersonId?.trim();
  if (globalPersonId) {
    const byGlobalPerson = accounts.find(
      (account) => account.globalPersonId === globalPersonId,
    );
    if (byGlobalPerson) return byGlobalPerson;
  }

  const personIds = new Set(
    [person.id, person.globalPersonId]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value)),
  );
  return accounts.find((account) =>
    account.actors?.some(
      (actor) => Boolean(actor.personId && personIds.has(actor.personId)),
    ),
  );
}

export function authenticationCollaboratorStatusLabel(
  actor: AuthzActor | undefined,
  account: AuthAccount | undefined,
): string {
  if (!actor) return "No authorization actor";
  if (account) {
    return `Already has authentication account ${account.login} (${
      canIssuePasswordResetToken(account) ? "active" : "inactive"
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

export function authenticationAccountMatchesSearch(
  account: AuthAccount,
  searchValue: string,
  matchedActorIds: Set<string> = new Set(),
): boolean {
  const search = searchValue.trim().toLowerCase();
  if (!search) return true;

  return (
    matchedActorIds.has(account.actorId) ||
    account.actors?.some(
      (actor) =>
        matchedActorIds.has(actor.actorId) ||
        actor.actorKey.toLowerCase().includes(search) ||
        actor.displayName.toLowerCase().includes(search) ||
        actor.personName?.toLowerCase().includes(search) ||
        actor.personNickname?.toLowerCase().includes(search) ||
        actor.tenantId?.toLowerCase().includes(search) ||
        actor.tenantName?.toLowerCase().includes(search),
    ) ||
    account.login.toLowerCase().includes(search) ||
    account.globalPersonName?.toLowerCase().includes(search) ||
    account.globalPersonEmail?.toLowerCase().includes(search) ||
    account.actorKey.toLowerCase().includes(search) ||
    account.displayName.toLowerCase().includes(search)
  );
}

export function authenticationAccountPersonTarget(
  account: AuthAccount,
): AuthAccountActor | undefined {
  const actors = account.actors ?? [];
  return (
    actors.find(
      (actor) =>
        actor.primary &&
        actor.scope === "TENANT" &&
        Boolean(actor.tenantId && actor.personId),
    ) ??
    actors.find(
      (actor) =>
        actor.scope === "TENANT" && Boolean(actor.tenantId && actor.personId),
    )
  );
}

export function authenticationActorTenantLabel(actor: AuthAccountActor): string {
  if (actor.scope === "GLOBAL") return "Application-wide";
  const tenantName = actor.tenantName?.trim();
  const tenantId = actor.tenantId?.trim();
  if (tenantName && tenantId && tenantName !== tenantId) {
    return `${tenantName} (${tenantId})`;
  }
  return tenantName || tenantId || "Tenant";
}

export function authenticationTenantActorIdsMatchingDisplayName(
  accounts: AuthAccount[],
  tenantOptions: Array<{ id: string; name: string }>,
  searchValue: string,
): Set<string> {
  const normalizeTenantSearchText = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase();
  const search = normalizeTenantSearchText(searchValue);
  if (!search) return new Set();

  const matchingTenantIds = new Set(
    tenantOptions
      .filter((tenant) => normalizeTenantSearchText(tenant.name).includes(search))
      .map((tenant) => tenant.id),
  );

  return new Set(
    accounts.flatMap((account) =>
      (account.actors ?? [])
        .filter((actor) =>
          actor.tenantId ? matchingTenantIds.has(actor.tenantId) : false,
        )
        .map((actor) => actor.actorId),
    ),
  );
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
  // Reuse the exact Account tenant-options query that AppShell uses for the
  // visible Tenant selector. If a Tenant name can be selected in the header,
  // Authentication Administration must match that same displayed name.
  const authenticatedAccountId =
    auth.status === "authenticated" ? auth.session.accountId : "";
  const tenantOptions = useQuery({
    queryKey: ["auth", authenticatedAccountId, "tenant-options"],
    queryFn: loadAuthTenantOptions,
    enabled: Boolean(authenticatedAccountId),
    staleTime: 60_000,
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
  const actorLookupPeople = useQuery({
    queryKey: [
      "people",
      "authentication-lookup",
      tenantId,
      actorLookupSearch.trim(),
    ],
    queryFn: () =>
      listPeoplePage({
        search: actorLookupSearch.trim(),
        page: 1,
        pageSize: 25,
      }),
    enabled: actorLookupSearch.trim().length > 0,
    refetchOnWindowFocus: false,
  });
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
    const linked = new Set(
      (accounts.data ?? []).flatMap((account) => [
        account.actorId,
        ...(account.actors ?? []).map((actor) => actor.actorId),
      ]),
    );
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
    return (actorLookupPeople.data?.items ?? []).map((person) => {
      const actor = authenticationActorForPerson(person, actorItems);
      const account =
        authenticationAccountForPerson(person, accountItems) ??
        authenticationAccountForActor(actor, accountItems);
      return { person, actor, account };
    });
  }, [accounts.data, actorLookupPeople.data, actors.data]);
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
    for (const actorId of authenticationTenantActorIdsMatchingDisplayName(
      accounts.data ?? [],
      tenantOptions.data ?? [],
      search,
    )) {
      matchedActorIds.add(actorId);
    }
    return (accounts.data ?? []).filter((account) =>
      authenticationAccountMatchesSearch(account, search, matchedActorIds),
    );
  }, [
    accounts.data,
    actorLookupResults,
    actorLookupSearch,
    tenantOptions.data,
  ]);

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
        Manage Authentication Accounts separately from the Person who owns the
        account and the tenant-specific Actors through which that account operates.
      </p>
      <ApiErrorPanel
        error={accounts.error ?? tenantOptions.error ?? actors.error ?? mutation.error ?? actionError}
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
          Search by Person name, nickname, or email, Tenant display name, Actor identity, or login to see whether
          an Authorization Actor and Authentication Account already exist.
        </p>
        <label
          className="mt-4 block text-sm font-medium"
          htmlFor="authentication-actor-lookup"
        >
          Filter by Person name, nickname, or email, Tenant display name, Actor, or account
        </label>
        <input
          id="authentication-actor-lookup"
          className="mt-1 w-full rounded-lg border px-3 py-2"
          type="search"
          placeholder="Type Person name, nickname, email, Tenant display name, actor key, or login"
          value={actorLookupSearch}
          onChange={(event) => setActorLookupSearch(event.target.value)}
        />

        {showActorLookup && (
          <div
            role="list"
            aria-label="Actor lookup results"
            className="mt-3 divide-y rounded-xl border border-slate-200"
          >
            {actorLookupPeople.isLoading || actorLookupPeople.isFetching ? (
              <p className="p-3 text-sm text-slate-500">Loading Person matches…</p>
            ) : actorLookupPeople.error ? (
              <p className="p-3 text-sm text-red-700">Could not load Person matches.</p>
            ) : actorLookupResults.length === 0 ? (
              <p className="p-3 text-sm text-slate-500">No matching People.</p>
            ) : (
              actorLookupResults.map(({ person, actor, account }) => {
                const personName =
                  `${person.firstName} ${person.lastName}`.trim() || "Unnamed Person";
                const nickname = person.nickname?.trim();
                return (
                  <article
                    key={person.membershipId || person.id}
                    role="listitem"
                    className="p-3 text-sm"
                  >
                    <p className="font-semibold text-slate-900">
                      {personName}
                      {nickname && nickname !== personName ? ` (${nickname})` : ""}
                    </p>
                    <p className="mt-1 text-slate-500">Email: {person.email}</p>
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
                      </>
                    )}
                    <p className="mt-1 font-medium text-slate-700">
                      Authentication account: {account
                        ? `${account.login} · ${
                            canIssuePasswordResetToken(account)
                              ? "Active"
                              : "Inactive"
                          }`
                        : "none"}
                    </p>
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

      <section className="mt-6 space-y-4" aria-label="Authentication accounts">
        {filteredAccounts.length === 0 && (
          <div className="rounded-2xl border bg-white p-5 text-sm text-slate-500">
            {showActorLookup
              ? "No authentication accounts match this actor/account filter."
              : "No authentication accounts."}
          </div>
        )}

        {filteredAccounts.map((account) => {
          const activePending = pendingAction === `active:${account.id}`;
          const resetPending = pendingAction === `reset:${account.id}`;
          const resetEligible = canIssuePasswordResetToken(account);
          const isCurrentAccount =
            auth.status === "authenticated" && account.id === auth.session.accountId;
          const personTarget = authenticationAccountPersonTarget(account);
          const personName =
            account.globalPersonName?.trim() ||
            account.actors?.find((actor) => actor.personName?.trim())?.personName ||
            "Linked Person";
          const anyActorActive =
            account.actors?.some((actor) => actor.active) ?? account.actorActive;

          return (
            <article
              key={account.id}
              className="overflow-hidden rounded-2xl border bg-white"
              data-testid={`authentication-account-${account.id}`}
            >
              <header className="flex flex-wrap items-start justify-between gap-4 border-b bg-slate-50 p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Authentication Account
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">
                    {account.login}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span
                    className={`rounded-full px-2.5 py-1 ${
                      account.active
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {account.active ? "Account active" : "Account inactive"}
                  </span>
                  {!anyActorActive && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">
                      No active Actors
                    </span>
                  )}
                  {account.mustChangePassword && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">
                      Password change required
                    </span>
                  )}
                </div>
              </header>

              <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <section aria-label={`Person linked to ${account.login}`}>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Person
                  </h3>
                  {account.globalPersonId ? (
                    <div className="mt-2">
                      <p className="font-semibold text-slate-950">{personName}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        Email: {account.globalPersonEmail || "Not recorded"}
                      </p>
                      {personTarget ? (
                        <div className="mt-3">
                          <a
                            className="inline-flex rounded-lg border px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                            href={`/people/${encodeURIComponent(personTarget.personId ?? "")}`}
                            onClick={() => {
                              if (personTarget.tenantId) {
                                setSelectedTenantId(
                                  window.localStorage,
                                  personTarget.tenantId,
                                );
                              }
                            }}
                          >
                            Open Person
                          </a>
                          <p className="mt-1 text-xs text-slate-500">
                            Opens the Person in {authenticationActorTenantLabel(personTarget)}.
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-slate-500">
                          The global Person is linked, but no tenant Person projection is available to open.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 rounded-lg border border-dashed p-3 text-sm text-slate-600">
                      <p className="font-medium text-slate-800">No Person linked</p>
                      <p className="mt-1 text-xs">
                        Application-level Accounts may intentionally exist without a Person.
                      </p>
                    </div>
                  )}
                </section>

                <section aria-label={`Actors linked to ${account.login}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                      Actors
                    </h3>
                    <span className="text-xs text-slate-500">
                      {account.actors?.length ?? (account.actorKey ? 1 : 0)} linked
                    </span>
                  </div>
                  {(account.actors?.length ?? 0) > 0 ? (
                    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                      {account.actors?.map((actor) => (
                        <li
                          key={actor.actorId}
                          className="rounded-xl border border-slate-200 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-950">
                                {authenticationActorTenantLabel(actor)}
                              </p>
                              <p className="mt-1 text-sm text-slate-700">
                                {actor.displayName}
                              </p>
                              <p className="mt-1 break-all text-xs text-slate-500">
                                Actor: {actor.actorKey}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                                actor.active
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-slate-200 text-slate-700"
                              }`}
                            >
                              {actor.active ? "Active" : "Inactive"}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">
                            {actor.scope === "GLOBAL" ? "Global Actor" : "Tenant Actor"}
                            {actor.primary ? " · Primary" : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-2 rounded-xl border border-slate-200 p-3">
                      <p className="font-semibold text-slate-950">
                        {account.displayName}
                      </p>
                      <p className="mt-1 break-all text-xs text-slate-500">
                        Actor: {account.actorKey}
                      </p>
                    </div>
                  )}
                </section>
              </div>

              <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4">
                <p className="text-xs text-slate-500">
                  Password and activation controls apply to the Authentication Account as a whole.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded border px-2 py-1 text-sm disabled:opacity-50"
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
                    className="rounded border px-2 py-1 text-sm disabled:opacity-50"
                    disabled={!resetEligible || resetPending || pendingAction !== null}
                    title={
                      resetEligible
                        ? undefined
                        : "Activate the authentication account and at least one authorization actor before issuing a reset token"
                    }
                    onClick={() => void issue(account.id)}
                  >
                    {resetPending ? "Issuing…" : "Issue reset token"}
                  </button>
                </div>
              </footer>
            </article>
          );
        })}
      </section>
    </div>
  );
}
