import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  useCollaboratorCatalog,
  useCollaboratorSearch,
} from "../collaborators/useCollaborators";
import { ApiError } from "../../api/client";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { readSelectedTenantId, setSelectedTenantId } from "../../api/tenantSelection";
import type { Collaborator } from "../../types/collaborators";
import type {
  AuthzActor,
  AuthzActorRoleGrant,
  AuthzAdminRequestActor,
  AuthzRole,
  CreateAuthzActorInput,
} from "../../types/authz";
import {
  useAuthzActors,
  useCurrentAuthzActor,
  useAuthzPermissions,
  useAuthzRoles,
  useCreateAuthzActor,
  useGrantAuthzActorRole,
  useRevokeAuthzActorRoleGrant,
  useSetAuthzActorActive,
} from "./useAuthzAdmin";

const defaultRequestActor: AuthzAdminRequestActor = {
  actorId: "authenticated-session",
  tenantId: "default",
};

const emptyActorForm: CreateAuthzActorInput = {
  actorKey: "",
  displayName: "",
  personId: "",
  collaboratorId: "",
  active: true,
};

export function AuthzAdminPage() {
  const [requestActor, setRequestActor] = useState<AuthzAdminRequestActor>(() =>
    loadRequestActor(),
  );
  const [actorForm, setActorForm] = useState<CreateAuthzActorInput>(emptyActorForm);
  const [actorNicknameFilter, setActorNicknameFilter] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    saveRequestActor(requestActor);
  }, [requestActor]);

  const currentActorQuery = useCurrentAuthzActor(requestActor);
  const rolesQuery = useAuthzRoles(requestActor);
  const permissionsQuery = useAuthzPermissions(requestActor);
  const actorsQuery = useAuthzActors(requestActor);
  const collaboratorsQuery = useCollaboratorCatalog();
  const createActorMutation = useCreateAuthzActor(requestActor);
  const grantRoleMutation = useGrantAuthzActorRole(requestActor);
  const revokeGrantMutation = useRevokeAuthzActorRoleGrant(requestActor);
  const setActorActiveMutation = useSetAuthzActorActive(requestActor);

  const roles = useMemo(() => [...(rolesQuery.data ?? [])].sort(byCode), [rolesQuery.data]);
  const grantableRoles = useMemo(
    () => roles.filter((role) => role.active && role.code !== "PERSON"),
    [roles],
  );
  const permissions = useMemo(
    () => [...(permissionsQuery.data ?? [])].sort(byCode),
    [permissionsQuery.data],
  );
  const actors = useMemo(
    () => [...(actorsQuery.data ?? [])].sort((a, b) => a.actorKey.localeCompare(b.actorKey)),
    [actorsQuery.data],
  );
  const collaborators = useMemo(
    () => [...(collaboratorsQuery.data ?? [])].sort(byCollaboratorName),
    [collaboratorsQuery.data],
  );
  const filteredActors = useMemo(
    () => filterActorsByPersonNickname(actors, collaborators, actorNicknameFilter),
    [actors, collaborators, actorNicknameFilter],
  );
  const hasActorNicknameFilter = actorNicknameFilter.trim().length > 0;

  const actionError =
    createActorMutation.error ??
    grantRoleMutation.error ??
    revokeGrantMutation.error ??
    setActorActiveMutation.error;
  const rolesForbidden = isForbiddenApiError(rolesQuery.error);
  const permissionsForbidden = isForbiddenApiError(permissionsQuery.error);
  const actorsForbidden = isForbiddenApiError(actorsQuery.error);
  const collaboratorsForbidden = isForbiddenApiError(collaboratorsQuery.error);
  const hasLimitedAuthorization =
    rolesForbidden || permissionsForbidden || actorsForbidden || collaboratorsForbidden;
  const queryError = firstNonForbiddenError([
    currentActorQuery.error,
    rolesQuery.error,
    permissionsQuery.error,
    actorsQuery.error,
    collaboratorsQuery.error,
  ]);

  async function handleCreateActor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage("");
    createActorMutation.reset();

    if (!actorForm.collaboratorId || !actorForm.personId || !actorForm.actorKey) return;

    try {
      const created = await createActorMutation.mutateAsync({
        actorKey: actorForm.actorKey.trim(),
        displayName: actorForm.displayName.trim(),
        personId: normalizeOptional(actorForm.personId),
        collaboratorId: normalizeOptional(actorForm.collaboratorId),
        active: true,
      });
      setActorForm(emptyActorForm);
      setSuccessMessage(`${created.actorKey} created.`);
    } catch {
      // Mutation error is rendered by ApiErrorPanel.
    }
  }

  async function handleGrantRole(targetActorId: string, roleCode: string, tenantId: string) {
    setSuccessMessage("");
    grantRoleMutation.reset();

    try {
      const grant = await grantRoleMutation.mutateAsync({
        targetActorId,
        input: { roleCode, tenantId },
      });
      setSuccessMessage(`${grant.roleCode} granted.`);
    } catch {
      // Mutation error is rendered by ApiErrorPanel.
    }
  }

  async function handleRevokeGrant(targetActorId: string, grant: AuthzActorRoleGrant) {
    setSuccessMessage("");
    revokeGrantMutation.reset();

    try {
      await revokeGrantMutation.mutateAsync({ targetActorId, grantId: grant.id });
      setSuccessMessage(`${grant.roleCode} revoked.`);
    } catch {
      // Mutation error is rendered by ApiErrorPanel.
    }
  }

  async function handleSetActorActive(targetActorId: string, actorKey: string, active: boolean) {
    setSuccessMessage("");
    setActorActiveMutation.reset();

    try {
      await setActorActiveMutation.mutateAsync({ targetActorId, active });
      setSuccessMessage(`${actorKey} ${active ? "activated" : "deactivated"}.`);
    } catch {
      // Mutation error is rendered by ApiErrorPanel.
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Administration
            </p>
            <h1 className="text-xl font-bold text-gray-950">Authorization</h1>
            <p className="text-sm text-gray-500">
              Manage authorization actors, role grants, and available permissions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/current-account-settings">
              Current Account Settings
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/audit-logs">
              Audit Logs
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/tenants">
              Tenants
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/reference-data">
              Reference Data
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/gold-prices">
              Gold Prices
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/price-list-items">
              Price List
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/people">
              Back to People
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl space-y-4 p-4">
        {successMessage && (
          <div role="status" className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800">
            {successMessage}
          </div>
        )}

        <ApiErrorPanel error={queryError ?? actionError} />

        {hasLimitedAuthorization && <LimitedAuthorizationNotice />}

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">
            Authenticated authorization context
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            The session cookie identifies the actor. The tenant value is only a selection hint and is validated against that actor&apos;s persisted grants.
          </p>
          <div className="mt-4 max-w-md">
            <label className="block text-sm font-semibold text-gray-700">
              Selected Tenant ID
              <input
                className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                value={requestActor.tenantId}
                onChange={(event) =>
                  setRequestActor((current) => ({
                    ...current,
                    tenantId: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          {currentActorQuery.data && (
            <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
              <p className="font-semibold">Authenticated actor verified</p>
              <p className="mt-1">
                {currentActorQuery.data.actorKey} · {currentActorQuery.data.tenantId} · {currentActorQuery.data.scope}
              </p>
              <p className="mt-1 text-xs">
                Roles: {currentActorQuery.data.roleCodes.join(", ") || "No active roles"}
              </p>
              <p className="mt-1 text-xs">
                Intrinsic permissions: {currentActorQuery.data.intrinsicPermissions?.join(", ") || "None"}
              </p>
              <p className="mt-1 text-xs">
                Delegated permissions: {currentActorQuery.data.delegatedPermissions?.join(", ") || "None"}
              </p>
              <p className="mt-1 text-xs">
                Effective permissions: {currentActorQuery.data.permissions.join(", ") || "None"}
              </p>
            </div>
          )}

          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-950 p-4 text-sm text-gray-100">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <p className="font-semibold">Current actor curl</p>
              <p className="text-xs text-gray-300">Uses an authenticated session cookie.</p>
            </div>
            <pre
              aria-label="Current actor curl command"
              className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs leading-5"
            >
              {currentActorCurlCommand(requestActor)}
            </pre>
            <p className="mt-2 text-xs text-gray-300">
              Actor headers are ignored during normal application traffic. The server derives identity from the session and validates the selected tenant.
            </p>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <form className="rounded-2xl border bg-white p-4 shadow-sm" onSubmit={handleCreateActor}>
            <h2 className="text-lg font-semibold text-gray-950">Create actor</h2>
            <p className="mt-1 text-sm text-gray-500">
              Create a global/control-plane security actor here. Tenant delegated roles can be granted only to Actors already bound to that tenant through an Authentication Account and active Membership.
            </p>

            {collaboratorsForbidden ? (
              <CardPermissionNotice cardName="Create actor" />
            ) : (
              <ActorFields
                value={actorForm}
                onChange={setActorForm}
              />
            )}

            <button
              className="mt-4 w-full rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={createActorMutation.isPending || collaboratorsForbidden || !actorForm.collaboratorId}
              type="submit"
            >
              {createActorMutation.isPending ? "Creating..." : "Create Actor"}
            </button>
          </form>

          <section className="space-y-4">
            <section className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-950">Actors</h2>
                  <p className="text-sm text-gray-500">
                    Grant tenant-scoped roles with a tenant ID, or global roles with *.
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Showing {filteredActors.length} of {actors.length} actor records.
                  </p>
                </div>

                {!actorsForbidden && (
                  <div className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-xl">
                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor="authz-actor-nickname-filter"
                        className="text-xs font-semibold uppercase tracking-wide text-gray-500"
                      >
                        Filter actors by person nickname
                      </label>
                      <input
                        id="authz-actor-nickname-filter"
                        type="search"
                        value={actorNicknameFilter}
                        onChange={(event) => setActorNicknameFilter(event.target.value)}
                        placeholder="Type any part of a person nickname"
                        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-950 focus:outline-none focus:ring-1 focus:ring-gray-950"
                      />
                    </div>
                    {hasActorNicknameFilter && (
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => setActorNicknameFilter("")}
                          className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {actorsForbidden ? (
                <CardPermissionNotice cardName="Actors" />
              ) : (
                <>
                  {actorsQuery.isLoading && <p className="mt-4 text-sm text-gray-500">Loading actors...</p>}
                  {!actorsQuery.isLoading && actors.length === 0 && (
                    <p className="mt-4 rounded-xl border border-dashed p-4 text-center text-sm text-gray-500">
                      No authorization actors found.
                    </p>
                  )}
                  {!actorsQuery.isLoading && actors.length > 0 && filteredActors.length === 0 && (
                    <p className="mt-4 rounded-xl border border-dashed p-4 text-center text-sm text-gray-500">
                      No actors match this person nickname.
                    </p>
                  )}
                  <div className="mt-4 space-y-3">
                    {filteredActors.map((actor) => (
                      <ActorCard
                        key={actor.id}
                        actor={actor}
                        roles={grantableRoles}
                        currentActorKey={currentActorQuery.data?.actorKey ?? ""}
                        isMutating={
                          grantRoleMutation.isPending ||
                          revokeGrantMutation.isPending ||
                          setActorActiveMutation.isPending
                        }
                        onGrantRole={handleGrantRole}
                        onRevokeGrant={handleRevokeGrant}
                        onSetActive={handleSetActorActive}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>
          </section>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <section data-testid="authz-roles-section" className="rounded-2xl border bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-950">Roles</h2>
            <p className="mt-1 text-sm text-gray-500">
              Role bundles available for actor grants.
            </p>
            {rolesForbidden ? (
              <CardPermissionNotice cardName="Roles" />
            ) : (
              <>
                {rolesQuery.isLoading && <p className="mt-4 text-sm text-gray-500">Loading roles...</p>}
                <div className="mt-4 space-y-3">
                  {roles.map((role) => (
                    <article key={role.id} className="rounded-xl border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-gray-950">{role.code}</h3>
                          <p className="text-sm text-gray-600">{role.label}</p>
                          {role.description && <p className="mt-1 text-xs text-gray-500">{role.description}</p>}
                        </div>
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                          {role.scopeType}
                        </span>
                      </div>
                      {role.permissions && role.permissions.length > 0 && (
                        <p className="mt-2 text-xs text-gray-500">
                          {role.permissions.map((permission) => permission.code).join(", ")}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>

          <section data-testid="authz-permissions-section" className="rounded-2xl border bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-950">Permissions</h2>
            <p className="mt-1 text-sm text-gray-500">
              Fine-grained operations that roles can grant.
            </p>
            {permissionsForbidden ? (
              <CardPermissionNotice cardName="Permissions" />
            ) : (
              <>
                {permissionsQuery.isLoading && <p className="mt-4 text-sm text-gray-500">Loading permissions...</p>}
                <div className="mt-4 max-h-[34rem] space-y-2 overflow-auto pr-2">
                  {permissions.map((permission) => (
                    <article key={permission.code} className="rounded-xl border p-3">
                      <h3 className="font-semibold text-gray-950">{permission.code}</h3>
                      <p className="text-sm text-gray-600">{permission.label}</p>
                      {permission.description && <p className="mt-1 text-xs text-gray-500">{permission.description}</p>}
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        </section>
      </section>
    </main>
  );
}

function LimitedAuthorizationNotice() {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">Selected actor has limited authorization</p>
      <p className="mt-1">
        This actor is valid, but it does not have permission to read or manage authorization administration data.
        Cards that require authorization administration permissions are shown with limited-access guidance instead of a raw API error.
      </p>
      <p className="mt-1 text-xs">
        Switch to an actor with authz.read or authz.manage to create actors, grant roles, or inspect role and permission catalogs.
      </p>
    </div>
  );
}

function CardPermissionNotice({ cardName }: { cardName: string }) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">{cardName} unavailable for this actor</p>
      <p className="mt-1">
        The selected operating actor does not have permission to use this card.
      </p>
    </div>
  );
}

function ActorFields({
  value,
  onChange,
}: {
  value: CreateAuthzActorInput;
  onChange: (value: CreateAuthzActorInput) => void;
}) {
  const [collaboratorSearch, setCollaboratorSearch] = useState("");
  const [selectedCollaborator, setSelectedCollaborator] =
    useState<Collaborator | null>(null);
  const collaboratorSearchQuery = useCollaboratorSearch(collaboratorSearch);
  const matchingCollaborators = collaboratorSearchQuery.data?.items ?? [];
  const showCollaboratorSuggestions = collaboratorSearch.trim().length > 0;

  useEffect(() => {
    if (!value.collaboratorId) {
      setSelectedCollaborator(null);
    }
  }, [value.collaboratorId]);

  function selectCollaborator(collaborator: Collaborator) {
    setSelectedCollaborator(collaborator);
    onChange({
      ...value,
      collaboratorId: collaborator.id,
      personId: collaborator.personId,
      actorKey: defaultActorKey(collaborator),
      displayName: collaboratorDisplayName(collaborator),
    });
    setCollaboratorSearch("");
  }

  function clearCollaboratorSelection() {
    setSelectedCollaborator(null);
    onChange({
      ...value,
      collaboratorId: "",
      personId: "",
      actorKey: "",
      displayName: "",
    });
    setCollaboratorSearch("");
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="relative">
        <label
          htmlFor="authz-create-actor-collaborator-search"
          className="block text-sm font-semibold text-gray-700"
        >
          Find collaborator by person nickname
        </label>
        <input
          id="authz-create-actor-collaborator-search"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={
            showCollaboratorSuggestions
              ? "authz-create-actor-collaborator-suggestions"
              : undefined
          }
          aria-expanded={showCollaboratorSuggestions}
          value={collaboratorSearch}
          onChange={(event) => setCollaboratorSearch(event.target.value)}
          placeholder="Type any part of a person nickname"
          className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base leading-6 text-gray-950"
        />

        {showCollaboratorSuggestions && (
          <div
            id="authz-create-actor-collaborator-suggestions"
            role="listbox"
            aria-label="Matching collaborators for actor creation"
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg"
          >
            {collaboratorSearchQuery.isLoading ||
            collaboratorSearchQuery.isFetching ? (
              <p className="px-3 py-2 text-sm text-gray-500">
                Loading matching collaborators…
              </p>
            ) : collaboratorSearchQuery.error ? (
              <p className="px-3 py-2 text-sm text-red-700">
                Could not load matching collaborators.
              </p>
            ) : matchingCollaborators.length === 0 ? (
              <p className="px-3 py-2 text-sm text-gray-500">
                No matching collaborators
              </p>
            ) : (
              matchingCollaborators.map((collaborator) => (
                <button
                  key={collaborator.id}
                  type="button"
                  role="option"
                  aria-selected={collaborator.id === value.collaboratorId}
                  onClick={() => selectCollaborator(collaborator)}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-800 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                >
                  {collaboratorOptionLabel(collaborator)}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {selectedCollaborator && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">Derived actor identity</p>
              <p className="mt-1">Actor key: {value.actorKey}</p>
              <p>
                Display name:{" "}
                {value.displayName || collaboratorDisplayName(selectedCollaborator)}
              </p>
              <p>Person ID and Collaborator ID will be derived from the selected collaborator.</p>
            </div>
            <button
              type="button"
              onClick={clearCollaboratorSelection}
              className="shrink-0 rounded-lg border border-blue-200 bg-white px-2 py-1 font-semibold text-blue-800"
            >
              Change
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActorCard({
  actor,
  roles,
  currentActorKey,
  isMutating,
  onGrantRole,
  onRevokeGrant,
  onSetActive,
}: {
  actor: AuthzActor;
  roles: AuthzRole[];
  currentActorKey: string;
  isMutating: boolean;
  onGrantRole: (targetActorId: string, roleCode: string, tenantId: string) => Promise<void>;
  onRevokeGrant: (targetActorId: string, grant: AuthzActorRoleGrant) => Promise<void>;
  onSetActive: (targetActorId: string, actorKey: string, active: boolean) => Promise<void>;
}) {
  const [roleCode, setRoleCode] = useState(roles[0]?.code ?? "");
  const [tenantId, setTenantId] = useState("default");

  useEffect(() => {
    if (!roleCode && roles[0]?.code) {
      setRoleCode(roles[0].code);
    }
  }, [roleCode, roles]);

  async function submitGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!roleCode) return;
    await onGrantRole(actor.id, roleCode, tenantId.trim() || "*");
  }

  return (
    <article data-testid="authz-actor-card" className="rounded-xl border p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="font-semibold text-gray-950">{actor.actorKey}</h3>
          <p className="text-sm text-gray-600">{actor.displayName || "—"}</p>
          <p className="mt-1 text-xs text-gray-500">
            {actor.active ? "Active" : "Inactive"}
            {actor.personId ? ` · Person ${actor.personId}` : ""}
            {actor.collaboratorId ? ` · Collaborator ${actor.collaboratorId}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-lg border bg-white px-3 py-1 text-xs font-semibold text-gray-700 disabled:opacity-60"
            disabled={isMutating || actor.actorKey === currentActorKey}
            type="button"
            onClick={() => onSetActive(actor.id, actor.actorKey, !actor.active)}
          >
            {actor.active ? "Deactivate" : "Activate"}
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {(actor.roleGrants ?? []).length === 0 && (
          <p className="rounded-xl border border-dashed p-3 text-sm text-gray-500">No role grants.</p>
        )}
        {(actor.roleGrants ?? []).map((grant) => (
          <div key={grant.id} className="flex flex-col gap-2 rounded-xl bg-gray-50 p-3 text-sm md:flex-row md:items-center md:justify-between">
            <div>
              <span className="font-semibold text-gray-950">{grant.roleCode}</span>
              <span className="text-gray-500"> · {grant.tenantId} · {grant.scopeType}</span>
            </div>
            <button
              className="rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-700 disabled:opacity-60"
              disabled={isMutating || actor.actorKey === currentActorKey}
              type="button"
              onClick={() => onRevokeGrant(actor.id, grant)}
            >
              Revoke
            </button>
          </div>
        ))}
      </div>

      <form className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]" onSubmit={submitGrant}>
        <label className="block text-sm font-semibold text-gray-700">
          Role
          <select
            className="mt-1 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
            value={roleCode}
            onChange={(event) => setRoleCode(event.target.value)}
          >
            {roles.map((role) => (
              <option key={role.code} value={role.code}>
                {role.code}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold text-gray-700">
          Grant tenant
          <input
            className="mt-1 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
            value={tenantId}
            onChange={(event) => setTenantId(event.target.value)}
          />
        </label>
        <button
          className="self-end rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          disabled={isMutating || !actor.active || !roleCode}
          type="submit"
        >
          Grant Role
        </button>
      </form>
    </article>
  );
}

function filterActorsByPersonNickname(
  actors: AuthzActor[],
  collaborators: Collaborator[],
  filter: string,
) {
  const normalizedFilter = normalizeActorNickname(filter);
  if (!normalizedFilter) return actors;

  const collaboratorsById = new Map(
    collaborators.map((collaborator) => [collaborator.id, collaborator]),
  );

  return actors.filter((actor) => {
    const collaborator = actor.collaboratorId
      ? collaboratorsById.get(actor.collaboratorId)
      : undefined;
    const nickname =
      collaborator?.personNickname?.trim() || actor.displayName.trim();

    return normalizeActorNickname(nickname).includes(normalizedFilter);
  });
}

function normalizeActorNickname(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase();
}

function firstNonForbiddenError(errors: unknown[]) {
  return errors.find((error) => error && !isForbiddenApiError(error));
}

function isForbiddenApiError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 403 || error.code === "forbidden");
}

function currentActorCurlCommand(requestActor: AuthzAdminRequestActor) {
  const tenantId = requestActor.tenantId.trim() || defaultRequestActor.tenantId;

  return [
    "curl -sS \\",
    "  -b /tmp/ers-session.cookies \\",
    `  -H "X-Tenant-ID: ${tenantId}" \\`,
    "  http://localhost:8080/api/v1/authz/current-actor | python3 -m json.tool",
  ].join("\n");
}

function saveRequestActor(requestActor: AuthzAdminRequestActor) {
  if (typeof window === "undefined") return;
  setSelectedTenantId(window.localStorage, requestActor.tenantId);
}

function loadRequestActor(): AuthzAdminRequestActor {
  if (typeof window === "undefined") return defaultRequestActor;

  return {
    actorId: defaultRequestActor.actorId,
    tenantId:
      readSelectedTenantId(window.localStorage) || defaultRequestActor.tenantId,
  };
}

function normalizeOptional(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function byCode<T extends { code: string }>(a: T, b: T) {
  return a.code.localeCompare(b.code);
}

function byCollaboratorName(a: Collaborator, b: Collaborator) {
  return collaboratorDisplayName(a).localeCompare(collaboratorDisplayName(b));
}

function collaboratorDisplayName(collaborator: Collaborator | undefined) {
  if (!collaborator) return "";
  return (
    collaborator.personNickname?.trim() ||
    collaborator.personName?.trim() ||
    collaborator.id
  );
}

function collaboratorOptionLabel(collaborator: Collaborator) {
  const name = collaboratorDisplayName(collaborator);
  const status = collaborator.statusLabel ? ` · ${collaborator.statusLabel}` : "";
  const location = collaborator.locationLabel ? ` · ${collaborator.locationLabel}` : "";
  return `${name}${status}${location}`;
}

function defaultActorKey(collaborator: Collaborator | undefined) {
  if (!collaborator) return "";

  const collaboratorId = collaborator.id.trim();
  if (!collaboratorId) return "";

  return collaboratorId.startsWith("collaborator-")
    ? collaboratorId
    : `collaborator-${collaboratorId}`;
}
