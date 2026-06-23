import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import type {
  AuthzActor,
  AuthzActorRoleGrant,
  AuthzAdminRequestActor,
  AuthzRole,
  CreateAuthzActorInput,
} from "../../types/authz";
import {
  useAuthzActors,
  useAuthzPermissions,
  useAuthzRoles,
  useCreateAuthzActor,
  useGrantAuthzActorRole,
  useRevokeAuthzActorRoleGrant,
} from "./useAuthzAdmin";

const SESSION_STORAGE_KEY = "ers.authzAdmin.requestActor";

const defaultRequestActor: AuthzAdminRequestActor = {
  actorId: "bootstrap-admin",
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
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    saveRequestActor(requestActor);
  }, [requestActor]);

  const rolesQuery = useAuthzRoles(requestActor);
  const permissionsQuery = useAuthzPermissions(requestActor);
  const actorsQuery = useAuthzActors(requestActor);
  const createActorMutation = useCreateAuthzActor(requestActor);
  const grantRoleMutation = useGrantAuthzActorRole(requestActor);
  const revokeGrantMutation = useRevokeAuthzActorRoleGrant(requestActor);

  const roles = useMemo(() => [...(rolesQuery.data ?? [])].sort(byCode), [rolesQuery.data]);
  const permissions = useMemo(
    () => [...(permissionsQuery.data ?? [])].sort(byCode),
    [permissionsQuery.data],
  );
  const actors = useMemo(
    () => [...(actorsQuery.data ?? [])].sort((a, b) => a.actorKey.localeCompare(b.actorKey)),
    [actorsQuery.data],
  );

  const actionError = createActorMutation.error ?? grantRoleMutation.error ?? revokeGrantMutation.error;
  const queryError = rolesQuery.error ?? permissionsQuery.error ?? actorsQuery.error;

  async function handleCreateActor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage("");
    createActorMutation.reset();

    try {
      const created = await createActorMutation.mutateAsync({
        actorKey: actorForm.actorKey.trim(),
        displayName: actorForm.displayName.trim(),
        personId: normalizeOptional(actorForm.personId),
        collaboratorId: normalizeOptional(actorForm.collaboratorId),
        active: actorForm.active,
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
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/reference-data">
              Reference Data
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

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">Admin request actor</h2>
          <p className="mt-1 text-sm text-gray-500">
            These headers are sent to the backend authz admin endpoints. Use a persisted actor with authz.read/authz.manage.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="block text-sm font-semibold text-gray-700">
              Actor ID / key
              <input
                className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                value={requestActor.actorId}
                onChange={(event) =>
                  setRequestActor((current) => ({ ...current, actorId: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm font-semibold text-gray-700">
              Tenant ID
              <input
                className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                value={requestActor.tenantId}
                onChange={(event) =>
                  setRequestActor((current) => ({ ...current, tenantId: event.target.value }))
                }
              />
            </label>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <form className="rounded-2xl border bg-white p-4 shadow-sm" onSubmit={handleCreateActor}>
            <h2 className="text-lg font-semibold text-gray-950">Create actor</h2>
            <p className="mt-1 text-sm text-gray-500">
              Create a security actor, then grant one or more roles below.
            </p>

            <ActorFields value={actorForm} onChange={setActorForm} />

            <button
              className="mt-4 w-full rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={createActorMutation.isPending}
              type="submit"
            >
              {createActorMutation.isPending ? "Creating..." : "Create Actor"}
            </button>
          </form>

          <section className="space-y-4">
            <section className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-950">Actors</h2>
                  <p className="text-sm text-gray-500">
                    Grant tenant-scoped roles with a tenant ID, or global roles with *.
                  </p>
                </div>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                  {actors.length} actors
                </span>
              </div>

              {actorsQuery.isLoading && <p className="mt-4 text-sm text-gray-500">Loading actors...</p>}
              {!actorsQuery.isLoading && actors.length === 0 && (
                <p className="mt-4 rounded-xl border border-dashed p-4 text-center text-sm text-gray-500">
                  No authorization actors found.
                </p>
              )}
              <div className="mt-4 space-y-3">
                {actors.map((actor) => (
                  <ActorCard
                    key={actor.id}
                    actor={actor}
                    roles={roles}
                    isMutating={grantRoleMutation.isPending || revokeGrantMutation.isPending}
                    onGrantRole={handleGrantRole}
                    onRevokeGrant={handleRevokeGrant}
                  />
                ))}
              </div>
            </section>
          </section>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <section data-testid="authz-roles-section" className="rounded-2xl border bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-950">Roles</h2>
            <p className="mt-1 text-sm text-gray-500">
              Role bundles available for actor grants.
            </p>
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
          </section>

          <section data-testid="authz-permissions-section" className="rounded-2xl border bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-950">Permissions</h2>
            <p className="mt-1 text-sm text-gray-500">
              Fine-grained operations that roles can grant.
            </p>
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
          </section>
        </section>
      </section>
    </main>
  );
}

function ActorFields({
  value,
  onChange,
}: {
  value: CreateAuthzActorInput;
  onChange: (value: CreateAuthzActorInput) => void;
}) {
  return (
    <div className="mt-4 space-y-3">
      <label className="block text-sm font-semibold text-gray-700">
        Actor key
        <input
          className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
          required
          value={value.actorKey}
          onChange={(event) => onChange({ ...value, actorKey: event.target.value })}
        />
      </label>
      <label className="block text-sm font-semibold text-gray-700">
        Display name
        <input
          className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
          value={value.displayName}
          onChange={(event) => onChange({ ...value, displayName: event.target.value })}
        />
      </label>
      <label className="block text-sm font-semibold text-gray-700">
        Person ID
        <input
          className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
          value={value.personId ?? ""}
          onChange={(event) => onChange({ ...value, personId: event.target.value })}
        />
      </label>
      <label className="block text-sm font-semibold text-gray-700">
        Collaborator ID
        <input
          className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
          value={value.collaboratorId ?? ""}
          onChange={(event) => onChange({ ...value, collaboratorId: event.target.value })}
        />
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
        <input
          checked={value.active}
          type="checkbox"
          onChange={(event) => onChange({ ...value, active: event.target.checked })}
        />
        Active
      </label>
    </div>
  );
}

function ActorCard({
  actor,
  roles,
  isMutating,
  onGrantRole,
  onRevokeGrant,
}: {
  actor: AuthzActor;
  roles: AuthzRole[];
  isMutating: boolean;
  onGrantRole: (targetActorId: string, roleCode: string, tenantId: string) => Promise<void>;
  onRevokeGrant: (targetActorId: string, grant: AuthzActorRoleGrant) => Promise<void>;
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
              disabled={isMutating}
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
          disabled={isMutating || !roleCode}
          type="submit"
        >
          Grant Role
        </button>
      </form>
    </article>
  );
}

function saveRequestActor(requestActor: AuthzAdminRequestActor) {
  if (typeof window === "undefined") return;

  const storage = window.localStorage;
  if (typeof storage?.setItem !== "function") return;

  try {
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(requestActor));
  } catch {
    // Persisting this convenience preference is best-effort only.
  }
}

function loadRequestActor(): AuthzAdminRequestActor {
  if (typeof window === "undefined") return defaultRequestActor;

  const storage = window.localStorage;
  if (typeof storage?.getItem !== "function") return defaultRequestActor;

  try {
    const stored = storage.getItem(SESSION_STORAGE_KEY);
    if (!stored) return defaultRequestActor;
    const parsed = JSON.parse(stored) as Partial<AuthzAdminRequestActor>;
    return {
      actorId: typeof parsed.actorId === "string" && parsed.actorId ? parsed.actorId : defaultRequestActor.actorId,
      tenantId: typeof parsed.tenantId === "string" && parsed.tenantId ? parsed.tenantId : defaultRequestActor.tenantId,
    };
  } catch {
    return defaultRequestActor;
  }
}

function normalizeOptional(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function byCode<T extends { code: string }>(a: T, b: T) {
  return a.code.localeCompare(b.code);
}
