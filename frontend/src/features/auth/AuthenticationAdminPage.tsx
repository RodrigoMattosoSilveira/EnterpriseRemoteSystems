import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAuthAccount,
  issuePasswordResetToken,
  listAuthAccounts,
  setAuthAccountActive,
} from "../../api/auth.api";
import { listTenants } from "../../api/tenants.api";
import { useAuthState } from "../../app/useAuth";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import type { AuthAccount, AuthAccountActor } from "../../types/auth";
import type { AuthzActor, AuthzActorRoleGrant } from "../../types/authz";
import type { Collaborator } from "../../types/collaborators";
import type { Person } from "../../types/people";
import { ReactivationRequestsPanel } from "./ReactivationRequestsPanel";
import { PageTitle } from "../../components/layout/PageHeading";

export function activeAuthenticationGrants(
  actor: AuthzActor,
): AuthzActorRoleGrant[] {
  return (actor.roleGrants ?? []).filter(
    (grant) => grant.active && !grant.lifecycleSuspended,
  );
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
  // Password recovery remains Account-global, but an operationally inactive
  // Person or security-suspended Account cannot reset credentials until the
  // appropriate lifecycle authority restores access.
  return (
    account.active &&
    !account.securitySuspended &&
    (!account.globalPersonId || account.operationalActive !== false)
  );
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
      actor.personId === (collaborator.legacyPersonId ?? collaborator.personId) &&
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

export function authenticationActorIdentityRows(
  actor: Pick<AuthAccountActor, "actorId" | "actorKey">,
): Array<{ label: "Actor ID" | "Actor Key"; value: string }> {
  return [
    { label: "Actor ID", value: actor.actorId },
    { label: "Actor Key", value: actor.actorKey },
  ];
}

export type AuthenticationAccountIdentityBoundary = {
  personBinding: string;
  tenantActorBindings: string;
  globalActorBindings: string;
};

export function authenticationAccountIdentityBoundary(
  account: AuthAccount,
): AuthenticationAccountIdentityBoundary {
  const actors = account.actors ?? [];
  const tenantActors = actors.filter((actor) => actor.scope === "TENANT");
  const globalActors = actors.filter((actor) => actor.scope === "GLOBAL");
  const actorProjectionAvailable = Array.isArray(account.actors);

  const personBinding = account.globalPersonId
    ? `Bound — ${account.globalPersonName?.trim() || account.globalPersonId} · ${account.globalPersonId}`
    : "None — no Person linked";

  const tenantActorBindings = !actorProjectionAvailable
    ? "Not available — linked Actor scopes were not loaded"
    : tenantActors.length === 0
      ? "None — no Tenant Actors linked"
      : `${tenantActors.length} — ${tenantActors
          .map((actor) => authenticationActorTenantLabel(actor))
          .join("; ")}`;

  const globalActorBindings = !actorProjectionAvailable
    ? "Not available — linked Actor scopes were not loaded"
    : globalActors.length === 0
      ? "None — no Global Actors linked"
      : `${globalActors.length}`;

  return {
    personBinding,
    tenantActorBindings,
    globalActorBindings,
  };
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
  const location = useLocation();
  const queryClient = useQueryClient();
  const accounts = useQuery({
    queryKey: ["auth", "accounts"],
    queryFn: listAuthAccounts,
    refetchOnWindowFocus: false,
  });
  const tenants = useQuery({
    queryKey: ["tenants", "authentication-targets"],
    queryFn: listTenants,
    refetchOnWindowFocus: false,
  });
  const activeTenants = useMemo(
    () => (tenants.data ?? []).filter((tenant) => tenant.active),
    [tenants.data],
  );
  const [targetTenantId, setTargetTenantId] = useState("");
  const [login, setLogin] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [actorLookupSearch, setActorLookupSearch] = useState("");
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
      setLogin("");
      setTemporaryPassword("");
      void queryClient.invalidateQueries({ queryKey: ["auth", "accounts"] });
    },
  });
  const showActorLookup = actorLookupSearch.trim().length > 0;
  const filteredAccounts = useMemo(() => {
    const search = actorLookupSearch.trim();
    if (!search) return accounts.data ?? [];
    return (accounts.data ?? []).filter((account) =>
      authenticationAccountMatchesSearch(account, search),
    );
  }, [accounts.data, actorLookupSearch]);

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
      <PageTitle>Authentication Accounts</PageTitle>
      <p className="mt-1 text-sm text-slate-600">
        Manage Authentication Accounts separately from the Person who owns the
        account and the tenant-specific Actors through which that account operates.
      </p>
      <ApiErrorPanel
        error={accounts.error ?? tenants.error ?? mutation.error ?? actionError}
      />

      <ReactivationRequestsPanel
        defaultOpen={location.hash === "#account-reactivation-requests"}
      />

      <section className="mt-6 rounded-2xl border bg-white p-5">
        <h2 className="text-lg font-semibold">Create account</h2>
        <form
          className="mt-4 grid gap-4 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({
              actorId: "",
              tenantId: targetTenantId,
              login,
              temporaryPassword,
              mustChangePassword: true,
            });
          }}
        >
          <label className="text-sm font-medium">
            Target Tenant *
            <select
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={targetTenantId}
              onChange={(event) => setTargetTenantId(event.target.value)}
              required
            >
              <option value="">Select a Tenant</option>
              {activeTenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Person login email *
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2"
              type="email"
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              required
            />
          </label>
          <label className="text-sm font-medium">
            Temporary password *
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2"
              type="password"
              minLength={12}
              value={temporaryPassword}
              onChange={(event) => setTemporaryPassword(event.target.value)}
              required
            />
          </label>
          <p className="text-sm text-slate-600 md:col-span-3">
            Application Administrators remain in the global control plane. Choose the
            target Tenant and enter the Person&apos;s exact login email; ERS resolves the
            Person, ACTIVE Membership, and canonical Tenant Actor without granting
            standing access to Tenant People data.
          </p>
          <button
            className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white md:col-span-3 disabled:opacity-50"
            disabled={
              mutation.isPending ||
              !targetTenantId ||
              !login.trim() ||
              !temporaryPassword
            }
          >
            {mutation.isPending ? "Creating…" : "Create account"}
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-2xl border bg-white p-5">
        <h2 className="text-lg font-semibold">Actor/account filter</h2>
        <p className="mt-1 text-sm text-slate-600">
          Filter the Authentication Account records already available to the global control plane by
          Person identity, Tenant display name, Actor identity, or login.
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
          const personName =
            account.globalPersonName?.trim() ||
            account.actors?.find((actor) => actor.personName?.trim())?.personName ||
            "Linked Person";
          const anyActorActive =
            account.actors?.some((actor) => actor.active) ?? account.actorActive;
          const identityBoundary = authenticationAccountIdentityBoundary(account);

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
                      account.securitySuspended
                        ? "bg-red-100 text-red-800"
                        : account.globalPersonId && account.operationalActive === false
                          ? "bg-amber-100 text-amber-800"
                          : account.active
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {account.securitySuspended
                      ? "Security suspended"
                      : account.globalPersonId && account.operationalActive === false
                        ? "Operationally inactive"
                        : account.active
                          ? "Account active"
                          : "Account inactive"}
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
                <section
                  aria-label={`Account identity boundary for ${account.login}`}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4 lg:col-span-2"
                >
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                    Account identity boundary
                  </h3>
                  <p className="mt-1 text-xs text-slate-600">
                    These are persistent Account identity bindings. A Tenant Support Access Lease
                    authorizes the existing Application Actor temporarily; it does not create a
                    Person or Tenant Actor binding.
                  </p>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="font-semibold text-slate-700">Person binding</dt>
                      <dd className="mt-1 text-slate-900">{identityBoundary.personBinding}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-700">Tenant Actor bindings</dt>
                      <dd className="mt-1 text-slate-900">
                        {identityBoundary.tenantActorBindings}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-700">Global Actor bindings</dt>
                      <dd className="mt-1 text-slate-900">
                        {identityBoundary.globalActorBindings}
                      </dd>
                    </div>
                  </dl>
                </section>

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
                      <p className="mt-2 text-xs text-slate-500">
                        Tenant Person projections are shown through the linked Actors below.
                        Open Tenant business data only from an authorized Tenant workspace.
                      </p>
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
                              <dl className="mt-2 space-y-1 text-xs text-slate-500">
                                {authenticationActorIdentityRows(actor).map((identity) => (
                                  <div key={identity.label} className="flex flex-wrap gap-x-1">
                                    <dt className="font-semibold text-slate-600">
                                      {identity.label}:
                                    </dt>
                                    <dd className="break-all font-mono">{identity.value}</dd>
                                  </div>
                                ))}
                              </dl>
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
                      <dl className="mt-2 space-y-1 text-xs text-slate-500">
                        {authenticationActorIdentityRows({
                          actorId: account.actorId,
                          actorKey: account.actorKey,
                        }).map((identity) => (
                          <div key={identity.label} className="flex flex-wrap gap-x-1">
                            <dt className="font-semibold text-slate-600">
                              {identity.label}:
                            </dt>
                            <dd className="break-all font-mono">{identity.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}
                </section>
              </div>

              <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4">
                <p className="text-xs text-slate-500">
                  Security suspension is application-global. Operational Person reactivation belongs to a Tenant Administrator.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded border px-2 py-1 text-sm disabled:opacity-50"
                    disabled={isCurrentAccount || activePending || pendingAction !== null}
                    title={isCurrentAccount ? "You cannot security-suspend your own account" : undefined}
                    onClick={() => void toggle(account.id, Boolean(account.securitySuspended))}
                  >
                    {activePending
                      ? "Saving…"
                      : account.securitySuspended
                        ? "Clear security suspension"
                        : "Security suspend"}
                  </button>
                  <button
                    className="rounded border px-2 py-1 text-sm disabled:opacity-50"
                    disabled={!resetEligible || resetPending || pendingAction !== null}
                    title={
                      resetEligible
                        ? undefined
                        : "Account must be active, operationally available, and not security-suspended before issuing a reset token"
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
