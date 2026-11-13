import { useI18n, type TranslationParameters } from "../../i18n";
import type { TranslationKey } from "../../i18n/resources";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { readSelectedTenantId, setSelectedTenantId } from "../../api/tenantSelection";
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
import { PageTitle } from "../../components/layout/PageHeading";

const defaultRequestActor: AuthzAdminRequestActor = {
  actorId: "authenticated-session",
  tenantId: "default",
};

const emptyActorForm: CreateAuthzActorInput = {
  actorKey: "",
  displayName: "",
  active: true,
};

type TenantRoleEligibilityFilter = "ALL" | "ELIGIBLE" | "INELIGIBLE";

export function AuthzAdminPage() {
  const { t, locale } = useI18n();
  const [requestActor, setRequestActor] = useState<AuthzAdminRequestActor>(() =>
    loadRequestActor(),
  );
  const [actorForm, setActorForm] = useState<CreateAuthzActorInput>(emptyActorForm);
  const [actorFilter, setActorFilter] = useState("");
  const [tenantRoleEligibilityFilter, setTenantRoleEligibilityFilter] =
    useState<TenantRoleEligibilityFilter>("ALL");
  const [grantRoleCodeByActor, setGrantRoleCodeByActor] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    saveRequestActor(requestActor);
  }, [requestActor]);

  const currentActorQuery = useCurrentAuthzActor(requestActor);
  const rolesQuery = useAuthzRoles(requestActor);
  const permissionsQuery = useAuthzPermissions(requestActor);
  const actorsQuery = useAuthzActors(requestActor);
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
  const tenantRoleEligibleActorCount = useMemo(
    () => actors.filter((actor) => tenantRoleGrantEligibility(actor).eligible).length,
    [actors],
  );
  const filteredActors = useMemo(() => {
    const identityMatches = filterActorsByActorKeyOrDisplayName(
      actors,
      actorFilter,
    );
    return filterActorsByTenantRoleEligibility(
      identityMatches,
      tenantRoleEligibilityFilter,
    );
  }, [
    actors,
    actorFilter,
    tenantRoleEligibilityFilter,
  ]);
  const hasActorFilters =
    actorFilter.trim().length > 0 ||
    tenantRoleEligibilityFilter !== "ALL";

  const actionError =
    createActorMutation.error ??
    grantRoleMutation.error ??
    revokeGrantMutation.error ??
    setActorActiveMutation.error;
  const rolesForbidden = isForbiddenApiError(rolesQuery.error);
  const permissionsForbidden = isForbiddenApiError(permissionsQuery.error);
  const actorsForbidden = isForbiddenApiError(actorsQuery.error);
  const createActorForbidden = actorsForbidden;
  const hasLimitedAuthorization =
    rolesForbidden ||
    permissionsForbidden ||
    actorsForbidden;
  const queryError = firstNonForbiddenError([
    currentActorQuery.error,
    rolesQuery.error,
    permissionsQuery.error,
    actorsQuery.error,
  ]);

  async function handleCreateActor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage("");
    createActorMutation.reset();

    if (!actorForm.actorKey.trim()) return;

    try {
      const created = await createActorMutation.mutateAsync({
        actorKey: actorForm.actorKey.trim(),
        displayName: actorForm.displayName.trim(),
        active: true,
      });
      setActorForm(emptyActorForm);
      setSuccessMessage(t("byte354b.authz.feedback.created", { code: created.actorKey }));
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
      setSuccessMessage(t("byte354b.authz.feedback.granted", { code: grant.roleCode }));
    } catch {
      // Mutation error is rendered by ApiErrorPanel.
    }
  }

  async function handleRevokeGrant(targetActorId: string, grant: AuthzActorRoleGrant) {
    setSuccessMessage("");
    revokeGrantMutation.reset();

    try {
      await revokeGrantMutation.mutateAsync({ targetActorId, grantId: grant.id });
      setSuccessMessage(t("byte354b.authz.feedback.revoked", { code: grant.roleCode }));
    } catch {
      // Mutation error is rendered by ApiErrorPanel.
    }
  }

  async function handleSetActorActive(targetActorId: string, actorKey: string, active: boolean) {
    setSuccessMessage("");
    setActorActiveMutation.reset();

    try {
      await setActorActiveMutation.mutateAsync({ targetActorId, active });
      setSuccessMessage(t(active ? "byte354b.authz.feedback.activated" : "byte354b.authz.feedback.deactivated", { code: actorKey }));
    } catch {
      // Mutation error is rendered by ApiErrorPanel.
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <PageTitle>{t("admin.authz.application.authorization_9b7457")}</PageTitle>
            <p className="mt-1 text-sm text-gray-500">
              {t("admin.authz.manage.authorization.actors.role.grants.and.available.p_3b7aba")}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/tenants">
              {t("admin.authz.tenants_1f7ae7")}
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/authentication">
              {t("admin.authz.authentication_ee1acf")}
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/audit-logs">
              {t("admin.authz.audit.logs_344c7f")}
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

        <ApiErrorPanel error={queryError ?? actionError} translate={t} />

        {hasLimitedAuthorization && <LimitedAuthorizationNotice />}

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">
            {t("admin.authz.authenticated.authorization.context_baa0e6")}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {t("authz.fragments.the.session.cookie.identifies.the.actor.the.te_b60ba0")}
          </p>
          <div className="mt-4 max-w-md">
            <label className="block text-sm font-semibold text-gray-700">
              {t("admin.authz.selected.tenant.id_f0aa67")}
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
              <p className="font-semibold">{t("admin.authz.authenticated.actor.verified_4f2f42")}</p>
              <p className="mt-1">
                {currentActorQuery.data.actorKey} · {currentActorQuery.data.tenantId} · {currentActorQuery.data.scope}
              </p>
              <p className="mt-1 text-xs">
                {t("authz.fragments.roles_04feda")} {currentActorQuery.data.roleCodes.join(", ") || t("byte352.authz.noRoles")}
              </p>
              <p className="mt-1 text-xs">
                {t("authz.fragments.intrinsic.permissions_86e2f6")} {currentActorQuery.data.intrinsicPermissions?.join(", ") || t("byte352.authz.none")}
              </p>
              <p className="mt-1 text-xs">
                {t("authz.fragments.delegated.permissions_c4712f")} {currentActorQuery.data.delegatedPermissions?.join(", ") || t("byte352.authz.none")}
              </p>
              <p className="mt-1 text-xs">
                {t("authz.fragments.effective.permissions_7ee095")} {currentActorQuery.data.permissions.join(", ") || t("byte352.authz.none")}
              </p>
            </div>
          )}

          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-950 p-4 text-sm text-gray-100">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <p className="font-semibold">{t("admin.authz.current.actor.curl_b06cd0")}</p>
              <p className="text-xs text-gray-300">{t("admin.authz.uses.an.authenticated.session.cookie_74b634")}</p>
            </div>
            <pre
              aria-label={t("authz.extra.current.actor.curl.command_1f2cf8")}
              className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs leading-5"
            >
              {currentActorCurlCommand(requestActor)}
            </pre>
            <p className="mt-2 text-xs text-gray-300">
              {t("admin.authz.actor.headers.are.ignored.during.normal.application.tra_2da956")}
            </p>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <form className="rounded-2xl border bg-white p-4 shadow-sm" onSubmit={handleCreateActor}>
            <h2 className="text-lg font-semibold text-gray-950">{t("admin.authz.create.actor_877a90")}</h2>
            <p className="mt-1 text-sm text-gray-500">
              {t("admin.authz.create.a.global.control.plane.security.actor.here.tenan_e79629")}
            </p>

            {createActorForbidden ? (
              <CardPermissionNotice cardName={t("admin.authz.create.actor_877a90")} />
            ) : (
              <ActorFields
                value={actorForm}
                onChange={setActorForm}
              />
            )}

            <button
              className="mt-4 w-full rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={createActorMutation.isPending || createActorForbidden || !actorForm.actorKey.trim()}
              type="submit"
            >
              {createActorMutation.isPending ? t("common.creatingDots") : t("admin.authz.create.actor_877a90")}
            </button>
          </form>

          <section className="space-y-4">
            <section className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-950">{t("admin.authz.actors_a70d36")}</h2>
                  <p className="text-sm text-gray-500">
                    {t("authz.fragments.tenant.role.grants.require.an.account.bound.ac_5f1f57")}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {t("authz.fragments.showing_163d81")} {filteredActors.length} {t("authz.fragments.of_de04fa")} {actors.length} {t("authz.fragments.actor.records_c652e0")}{" "}
                    {tenantRoleEligibleActorCount} {t("authz.fragments.eligible.for.tenant.role.grants_7a006b")}
                  </p>
                </div>

                {!actorsForbidden && (
                  <div className="flex w-full flex-col gap-2 md:flex-row lg:max-w-4xl">
                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor="authz-actor-nickname-filter"
                        className="text-xs font-semibold uppercase tracking-wide text-gray-500"
                      >
                        {t("admin.authz.filter.actors.by.actor.key.or.display.name_3a6779")}
                      </label>
                      <input
                        id="authz-actor-nickname-filter"
                        type="search"
                        value={actorFilter}
                        onChange={(event) => setActorFilter(event.target.value)}
                        placeholder={t("authz.extra.type.any.part.of.an.actor.key.or.display.name_3e9cd8")}
                        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-950 focus:outline-none focus:ring-1 focus:ring-gray-950"
                      />
                    </div>
                    <div className="md:w-56 md:flex-none">
                      <label
                        htmlFor="authz-actor-tenant-role-eligibility-filter"
                        className="text-xs font-semibold uppercase tracking-wide text-gray-500"
                      >
                        {t("admin.authz.tenant.role.grant.eligibility_c7c2a9")}
                      </label>
                      <select
                        id="authz-actor-tenant-role-eligibility-filter"
                        value={tenantRoleEligibilityFilter}
                        onChange={(event) =>
                          setTenantRoleEligibilityFilter(
                            event.target.value as TenantRoleEligibilityFilter,
                          )
                        }
                        className="mt-1 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-gray-950 focus:outline-none focus:ring-1 focus:ring-gray-950"
                      >
                        <option value="ALL">{t("admin.authz.all.actors_f89ae5")}</option>
                        <option value="ELIGIBLE">{t("admin.authz.eligible.only_013dcd")}</option>
                        <option value="INELIGIBLE">{t("admin.authz.ineligible.only_c31d69")}</option>
                      </select>
                    </div>
                    {hasActorFilters && (
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => {
                            setActorFilter("");
                            setTenantRoleEligibilityFilter("ALL");
                          }}
                          className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
                        >
                          {t("admin.authz.clear_719ea3")}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {actorsForbidden ? (
                <CardPermissionNotice cardName={t("admin.authz.actors_a70d36")} />
              ) : (
                <>
                  {actorsQuery.isLoading && <p className="mt-4 text-sm text-gray-500">{t("admin.authz.loading.actors_ddec70")}</p>}
                  {!actorsQuery.isLoading && actors.length === 0 && (
                    <p className="mt-4 rounded-xl border border-dashed p-4 text-center text-sm text-gray-500">
                      {t("admin.authz.no.authorization.actors.found_6a89f9")}
                    </p>
                  )}
                  {!actorsQuery.isLoading && actors.length > 0 && filteredActors.length === 0 && (
                    <p className="mt-4 rounded-xl border border-dashed p-4 text-center text-sm text-gray-500">
                      {t("admin.authz.no.actors.match.these.filters_1604b6")}
                    </p>
                  )}
                  <div className="mt-4 space-y-3">
                    {filteredActors.map((actor) => (
                      <ActorCard
                        key={actor.id}
                        actor={actor}
                        allActors={actors}
                        roles={grantableRoles}
                        selectedRoleCode={grantRoleCodeByActor[actor.id]}
                        onSelectedRoleCodeChange={(roleCode) =>
                          setGrantRoleCodeByActor((current) => ({
                            ...current,
                            [actor.id]: roleCode,
                          }))
                        }
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
            <h2 className="text-lg font-semibold text-gray-950">{t("admin.authz.roles_47dcc2")}</h2>
            <p className="mt-1 text-sm text-gray-500">
              {t("admin.authz.role.bundles.available.for.actor.grants_cf0112")}
            </p>
            {rolesForbidden ? (
              <CardPermissionNotice cardName={t("admin.authz.roles_47dcc2")} />
            ) : (
              <>
                {rolesQuery.isLoading && <p className="mt-4 text-sm text-gray-500">{t("admin.authz.loading.roles_2ad48b")}</p>}
                <div className="mt-4 space-y-3">
                  {roles.map((role) => (
                    <article key={role.id} className="rounded-xl border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-gray-950">{role.code}</h3>
                          <p className="text-sm text-gray-600">{localizedAdminRoleLabel(role, t, locale)}</p>
                          {role.description && <p className="mt-1 text-xs text-gray-500">{localizedAdminRoleDescription(role, t, locale)}</p>}
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
            <h2 className="text-lg font-semibold text-gray-950">{t("admin.authz.permissions_d06d55")}</h2>
            <p className="mt-1 text-sm text-gray-500">
              {t("admin.authz.fine.grained.operations.that.roles.can.grant_70f972")}
            </p>
            {permissionsForbidden ? (
              <CardPermissionNotice cardName={t("admin.authz.permissions_d06d55")} />
            ) : (
              <>
                {permissionsQuery.isLoading && <p className="mt-4 text-sm text-gray-500">{t("admin.authz.loading.permissions_0e89e7")}</p>}
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
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">{t("admin.authz.selected.actor.has.limited.authorization_3cc29a")}</p>
      <p className="mt-1">
        {t("admin.authz.this.actor.is.valid.but.it.does.not.have.permission.to._59e777")}
      </p>
      <p className="mt-1 text-xs">
        {t("admin.authz.switch.to.an.actor.with.authz.read.or.authz.manage.to.c_29d32f")}
      </p>
    </div>
  );
}

function CardPermissionNotice({ cardName }: { cardName: string }) {
  const { t } = useI18n();
  return (
    <div className="mt-4 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">{cardName} {t("authz.fragments.unavailable.for.this.actor_38693b")}</p>
      <p className="mt-1">
        {t("admin.authz.the.selected.operating.actor.does.not.have.permission.t_e17df1")}
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
  const { t } = useI18n();
  return (
    <div className="mt-4 space-y-3">
      <label className="block text-sm font-semibold text-gray-700">
        {t("admin.authz.actor.key_ee9fe5")}
        <input
          type="text"
          value={value.actorKey}
          onChange={(event) =>
            onChange({ ...value, actorKey: event.target.value })
          }
          placeholder="global-support-operator"
          className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base leading-6 text-gray-950"
        />
      </label>

      <label className="block text-sm font-semibold text-gray-700">
        {t("admin.authz.display.name_8d6b34")}
        <input
          type="text"
          value={value.displayName}
          onChange={(event) =>
            onChange({ ...value, displayName: event.target.value })
          }
          placeholder={t("authz.extra.global.support.operator_48e23b")}
          className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base leading-6 text-gray-950"
        />
      </label>

      <p className="text-xs text-gray-500">
        {t("admin.authz.global.control.plane.actors.are.created.without.tenant._3a8737")}
      </p>
    </div>
  );
}

function ActorCard({
  actor,
  allActors,
  roles,
  selectedRoleCode,
  onSelectedRoleCodeChange,
  currentActorKey,
  isMutating,
  onGrantRole,
  onRevokeGrant,
  onSetActive,
}: {
  actor: AuthzActor;
  allActors: AuthzActor[];
  roles: AuthzRole[];
  selectedRoleCode?: string;
  onSelectedRoleCodeChange: (roleCode: string) => void;
  currentActorKey: string;
  isMutating: boolean;
  onGrantRole: (targetActorId: string, roleCode: string, tenantId: string) => Promise<void>;
  onRevokeGrant: (targetActorId: string, grant: AuthzActorRoleGrant) => Promise<void>;
  onSetActive: (targetActorId: string, actorKey: string, active: boolean) => Promise<void>;
}) {
  const { t } = useI18n();
  // The Account -> Actor binding is authoritative for grant scope. A tenant
  // Actor belongs to exactly one tenant, so the UI must never offer an
  // application Role for it or derive the grant tenant from transient page
  // context. Conversely, a GLOBAL/unbound control-plane Actor may receive only
  // application Roles. This mirrors the backend scope invariant instead of
  // asking the administrator to keep Role scope and tenant selection aligned by
  // hand.
  const compatibleRoles = roles.filter((role) =>
    isRoleCompatibleWithActor(role, actor),
  );
  const actorTenantId = tenantBindingId(actor);
  const roleCode = compatibleRoles.some((role) => role.code === selectedRoleCode)
    ? selectedRoleCode ?? ""
    : "";
  const selectedRole = compatibleRoles.find((role) => role.code === roleCode);
  const applicationScopedRole = isApplicationScopedRole(selectedRole);
  const persistedSelectedRoleGrant = (actor.roleGrants ?? []).find(
    (grant) => grant.active && grant.roleCode === roleCode,
  );

  // A persisted grant is authoritative for its own tenant. This matters after
  // a refresh/remount and while the page-level tenant selector is changing: an
  // already-granted tenant Role must continue to render its persisted tenant
  // and disabled duplicate-grant action rather than snapping to another tenant
  // (or, via APPLICATION_ADMIN, to *). For a new grant, the selected tenant is
  // still the requested target. Application-scoped roles are always global.
  const targetTenantId = applicationScopedRole
    ? "*"
    : persistedSelectedRoleGrant?.tenantId || actorTenantId;
  const tenantEligibility = tenantRoleGrantEligibility(actor);
  const tenantRoleIneligible =
    !applicationScopedRole && !tenantEligibility.eligible;
  const tenantAdminCardinalityBlocker =
    roleCode === "TENANT_ADMIN" && targetTenantId
      ? tenantAdministratorGrantBlocker(actor, allActors, targetTenantId)
      : null;
  const alreadyGranted = Boolean(
    roleCode &&
      targetTenantId &&
      (actor.roleGrants ?? []).some(
        (grant) =>
          grant.active &&
          !grant.lifecycleSuspended &&
          grant.roleCode === roleCode &&
          grant.tenantId === targetTenantId,
      ),
  );

  async function submitGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !roleCode ||
      !targetTenantId ||
      alreadyGranted ||
      tenantAdminCardinalityBlocker
    ) return;
    await onGrantRole(actor.id, roleCode, targetTenantId);
  }

  return (
    <article data-testid="authz-actor-card" className="rounded-xl border p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="font-semibold text-gray-950">{actor.actorKey}</h3>
          <p className="text-sm text-gray-600">{actor.displayName || "—"}</p>
          <p className="mt-1 text-xs text-gray-500">
            {actor.active ? t("byte352.authz.active") : t("byte352.authz.inactive")}
            {actor.personId ? ` · Person ${actor.personId}` : ""}
            {actor.collaboratorId ? ` · Collaborator ${actor.collaboratorId}` : ""}
          </p>
          <ActorBindingSummary actor={actor} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-lg border bg-white px-3 py-1 text-xs font-semibold text-gray-700 disabled:opacity-60"
            disabled={isMutating || actor.actorKey === currentActorKey}
            type="button"
            onClick={() => onSetActive(actor.id, actor.actorKey, !actor.active)}
          >
            {actor.active ? t("byte352.authz.deactivate") : t("byte352.authz.activate")}
          </button>
        </div>
      </div>

      <section className="mt-4 rounded-xl border border-gray-200 bg-gray-50/60 p-3">
        <div className="mb-3">
          <h4 className="text-sm font-semibold text-gray-950">{t("admin.authz.grant.a.role_73d1f0")}</h4>
          <p className="mt-0.5 text-xs text-gray-600">
            {t("admin.authz.choose.one.compatible.role.from.the.selector.then.grant_7213e1")}
          </p>
        </div>

        <form className="grid gap-2 md:grid-cols-[1fr_1fr_auto]" onSubmit={submitGrant}>
          <RoleSelector
            actorId={actor.id}
            roles={compatibleRoles}
            selectedRoleCode={roleCode}
            onChange={onSelectedRoleCodeChange}
            disabled={compatibleRoles.length === 0}
          />
          <label className="block text-sm font-semibold text-gray-700">
            {t("admin.authz.grant.tenant_d351da")}
            <input
              className="mt-1 block w-full rounded-xl border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-700"
              value={targetTenantId}
              disabled
              readOnly
            />
          </label>
          <button
            className="self-end rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600"
            disabled={
              isMutating ||
              !actor.active ||
              !roleCode ||
              tenantRoleIneligible ||
              Boolean(tenantAdminCardinalityBlocker) ||
              alreadyGranted
            }
            type="submit"
          >
            {t("admin.authz.grant.role_850973")}
          </button>
        </form>
        {tenantRoleIneligible && (
          <p className="mt-2 text-xs font-medium text-amber-700">
            {t("authz.fragments.tenant.role.grant.unavailable_1ce1ee")} {localizeAuthzReason(tenantEligibility.reason, t)}
          </p>
        )}
        {tenantAdminCardinalityBlocker && !alreadyGranted && (
          <p className="mt-2 text-xs font-medium text-amber-700">
            {t("authz.fragments.tenant.admin.grant.unavailable_213323")} {localizeAuthzReason(tenantAdminCardinalityBlocker, t)}
          </p>
        )}
        {alreadyGranted && (
          <p className="mt-2 text-xs font-medium text-gray-500">
            {roleCode} {t("authz.fragments.is.already.granted.for_ba1162")} {targetTenantId}.
          </p>
        )}
      </section>

      <section className="mt-4">
        <div className="mb-2">
          <h4 className="text-sm font-semibold text-gray-950">{t("admin.authz.current.role.grants_24dd80")}</h4>
          <p className="mt-0.5 text-xs text-gray-500">
            {t("admin.authz.roles.already.granted.to.this.actor.are.listed.here.and_7c8592")}
          </p>
        </div>
        <div className="space-y-2">
          {(actor.roleGrants ?? []).length === 0 && (
            <p className="rounded-xl border border-dashed p-3 text-sm text-gray-500">
              {t("admin.authz.no.current.role.grants_7347da")}
            </p>
          )}
          {(actor.roleGrants ?? []).map((grant) => (
            <div key={grant.id} className="flex flex-col gap-2 rounded-xl bg-gray-50 p-3 text-sm md:flex-row md:items-center md:justify-between">
              <div>
                <span className="font-semibold text-gray-950">{grant.roleCode}</span>
                <span className="text-gray-500"> · {grant.tenantId} · {grant.scopeType}</span>
                {grant.lifecycleSuspended && (
                  <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{t("admin.authz.lifecycle.suspended_850341")}</span>
                )}
              </div>
              <button
                className="rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-700 disabled:opacity-60"
                disabled={isMutating || actor.actorKey === currentActorKey}
                type="button"
                onClick={() => onRevokeGrant(actor.id, grant)}
              >
                {t("admin.authz.revoke_0be720")}
              </button>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}

function RoleSelector({
  actorId,
  roles,
  selectedRoleCode,
  onChange,
  disabled,
}: {
  actorId: string;
  roles: AuthzRole[];
  selectedRoleCode: string;
  onChange: (roleCode: string) => void;
  disabled: boolean;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const selectedRole = roles.find((role) => role.code === selectedRoleCode);
  const normalizedFilter = filterText.trim().toLocaleLowerCase();
  const visibleRoles = normalizedFilter
    ? roles.filter((role) =>
        [role.code, role.label, role.description, localizedAdminRoleLabel(role, t, locale)].some((value) =>
          value.toLocaleLowerCase().includes(normalizedFilter),
        ),
      )
    : roles;
  const optionsId = `authz-role-options-${actorId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  function closeSelector({ restoreFocus = false }: { restoreFocus?: boolean } = {}) {
    setFilterText("");
    setOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => {
        triggerRef.current?.focus();
      });
    }
  }

  function openSelector() {
    if (disabled) return;
    setFilterText("");
    setOpen(true);
    window.requestAnimationFrame(() => filterRef.current?.focus());
  }

  function chooseRole(roleCode: string) {
    onChange(roleCode);
    closeSelector();
  }

  return (
    <div
      className="relative"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (
          open &&
          (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget))
        ) {
          closeSelector();
        }
      }}
    >
      <p className="text-sm font-semibold text-gray-700">{t("admin.authz.role.selector_d23819")}</p>
      <button
        type="button"
        ref={triggerRef}
        aria-label={t("authz.extra.role.selector_d23819")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? optionsId : undefined}
        disabled={disabled}
        onClick={() => (open ? closeSelector() : openSelector())}
        className="mt-1 flex w-full items-center justify-between gap-3 rounded-xl border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-950 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold">
            {selectedRole?.code ?? (disabled ? t("byte354b.authz.noCompatible") : t("byte354b.authz.selectRole"))}
          </span>
          {selectedRole && (
            <span className="block truncate text-xs text-gray-500">
              {localizedAdminRoleLabel(selectedRole, t, locale)}
            </span>
          )}
        </span>
        <span aria-hidden="true" className="shrink-0 text-gray-500">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border border-gray-300 bg-white shadow-lg">
          <div className="border-b border-gray-200 p-2">
            <label className="grid gap-1 text-xs font-semibold text-gray-700">
              {t("admin.authz.filter.roles_41c1af")}
              <input
                ref={filterRef}
                type="search"
                role="combobox"
                aria-label={t("authz.extra.filter.roles_41c1af")}
                aria-autocomplete="list"
                aria-controls={optionsId}
                aria-expanded="true"
                value={filterText}
                onChange={(event) => setFilterText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeSelector({ restoreFocus: true });
                  }
                }}
                placeholder={t("authz.extra.role.code.name.or.description_aab641")}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
            </label>
            <p className="mt-1 text-xs text-gray-500" aria-live="polite">
              {visibleRoles.length} {t("authz.fragments.of_de04fa")} {roles.length} {t("authz.fragments.compatible.roles_36ef17")}
            </p>
          </div>

          <div
            id={optionsId}
            role="listbox"
            aria-label={t("authz.extra.role.choices_855376")}
            className="max-h-64 overflow-y-auto p-1"
          >
            {visibleRoles.length === 0 ? (
              <p className="px-3 py-4 text-sm text-gray-500">
                {t("admin.authz.no.matching.roles_60595e")}
              </p>
            ) : (
              visibleRoles.map((role) => (
                <button
                  key={role.code}
                  type="button"
                  role="option"
                  aria-selected={role.code === selectedRoleCode}
                  data-role-code={role.code}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseRole(role.code)}
                  className="block w-full rounded-lg px-3 py-2 text-left hover:bg-gray-50 focus:bg-gray-100 focus:outline-none"
                >
                  <span className="block text-sm font-semibold text-gray-950">
                    {role.code}
                  </span>
                  <span className="block text-xs font-medium text-gray-600">
                    {localizedAdminRoleLabel(role, t, locale)}
                  </span>
                  {role.description && (
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {localizedAdminRoleDescription(role, t, locale)}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ActorBindingSummary({ actor }: { actor: AuthzActor }) {
  const { t } = useI18n();
  const eligibility = tenantRoleGrantEligibility(actor);
  const binding = actor.binding;
  const accountLabel = binding?.accountLogin?.trim() || binding?.accountId?.trim();

  return (
    <div className="mt-2 space-y-1 text-xs">
      <p className="font-medium text-gray-600">
        {t("authz.fragments.authentication.account_e8ea76")}{" "}
        {binding ? (
          <>
            {t("authz.fragments.bound_2c346a")}{accountLabel ? ` · ${accountLabel}` : ""}
          </>
        ) : (
          t("byte354b.authz.notBound")
        )}
      </p>

      {!binding ? (
        <p className="font-medium text-gray-500">
          {t("admin.authz.actor.scope.unbound.control.plane.actor_e58529")}
        </p>
      ) : binding.scopeType.trim().toUpperCase() === "TENANT" ? (
        <>
          <p className="font-medium text-gray-500">
            {t("authz.fragments.authentication.binding.tenant_384cf7")} {binding.tenantId || "—"}
          </p>
          <p className="font-medium text-gray-500">
            {t("authz.fragments.person.tenant.membership_0882cd")}{" "}
            {binding.membershipId
              ? binding.membershipActive
                ? "ACTIVE"
                : "INACTIVE"
              : t("byte354b.authz.missing")}
            {binding.membershipId
              ? binding.membershipSameTenant
                ? t("byte354b.authz.sameTenant")
                : `${t("byte354b.authz.mismatch")}${
                    binding.membershipTenantId
                      ? ` (${binding.membershipTenantId})`
                      : ""
                  }`
              : ""}
            {binding.membershipId ? ` · ${binding.membershipId}` : ""}
          </p>
        </>
      ) : (
        <>
          <p className="font-medium text-gray-500">
            {t("authz.fragments.authentication.binding_9847ab")} {binding.scopeType.trim().toUpperCase() || "GLOBAL"}
          </p>
          <p className="font-medium text-gray-500">
            {t("admin.authz.person.tenant.membership.not.applicable_35981a")}
          </p>
        </>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span
          data-testid="tenant-role-grant-eligibility"
          className={
            eligibility.eligible
              ? "rounded-full bg-green-100 px-2 py-1 font-semibold text-green-800"
              : "rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-800"
          }
        >
          {t("authz.fragments.tenant.role.grants_e3d2c2")} {eligibility.eligible ? t("byte354b.authz.eligible") : t("byte354b.authz.ineligible")}
        </span>
        {!eligibility.eligible && (
          <span className="font-medium text-gray-500">{localizeAuthzReason(eligibility.reason, t)}</span>
        )}
      </div>
    </div>
  );
}

// Eligibility and cardinality decisions carry a translation key, never
// English text that is later matched back to a key.
type AuthzReason = {
  key: TranslationKey;
  params?: TranslationParameters;
};

type TenantRoleGrantEligibility = {
  eligible: boolean;
  reason: AuthzReason;
};


// Catalog role metadata is server-provided. Localize known system Role codes
// only at display boundaries; keep codes, grants, and arbitrary custom text intact.
function localizedAdminRoleLabel(role: AuthzRole, t: ReturnType<typeof useI18n>["t"], locale: ReturnType<typeof useI18n>["locale"]): string {
  if (locale === "en-US") return role.label;
  switch (role.code) {
    case "TENANT_ADMIN": return t("byte354b.roles.tenantAdministrator");
    case "TENANT_VIEWER": return t("byte354b.authz.role.tenantViewer");
    case "EARNINGS_OPERATOR": return t("byte354b.roles.earningsOperator");
    case "EXPENSE_OPERATOR": return t("byte354b.roles.expensesOperator");
    default: return role.label;
  }
}

function localizedAdminRoleDescription(role: AuthzRole, t: ReturnType<typeof useI18n>["t"], locale: ReturnType<typeof useI18n>["locale"]): string {
  if (locale === "en-US") return role.description;
  return role.code === "TENANT_ADMIN" && role.description === "Tenant administration"
    ? t("byte354b.authz.role.tenantDescription")
    : role.description;
}

function localizeAuthzReason(reason: AuthzReason, t: ReturnType<typeof useI18n>["t"]): string {
  return t(reason.key, reason.params);
}

function tenantRoleGrantEligibility(actor: AuthzActor): TenantRoleGrantEligibility {
  if (!actor.active) {
    return { eligible: false, reason: { key: "byte354b.authz.reason.00" } };
  }

  const binding = actor.binding;
  if (!binding || !(binding.accountId ?? "").trim()) {
    return { eligible: false, reason: { key: "byte354b.authz.reason.01" } };
  }

  if (binding.scopeType.trim().toUpperCase() !== "TENANT") {
    return { eligible: false, reason: { key: "byte354b.authz.reason.02" } };
  }

  const tenantId = binding.tenantId?.trim() ?? "";
  if (!tenantId || tenantId === "*") {
    return { eligible: false, reason: { key: "byte354b.authz.reason.03" } };
  }

  if (!binding.membershipId?.trim()) {
    return { eligible: false, reason: { key: "byte354b.authz.reason.04" } };
  }

  if (!binding.membershipSameTenant) {
    return { eligible: false, reason: { key: "byte354b.authz.reason.05" } };
  }

  if (!binding.membershipActive) {
    return { eligible: false, reason: { key: "byte354b.authz.reason.06" } };
  }

  return { eligible: true, reason: { key: "byte354b.authz.reason.07" } };
}

function filterActorsByTenantRoleEligibility(
  actors: AuthzActor[],
  filter: TenantRoleEligibilityFilter,
) {
  if (filter === "ALL") return actors;

  return actors.filter((actor) => {
    const eligible = tenantRoleGrantEligibility(actor).eligible;
    return filter === "ELIGIBLE" ? eligible : !eligible;
  });
}


function tenantAdministratorGrantBlocker(
  actor: AuthzActor,
  allActors: AuthzActor[],
  targetTenantId: string,
): AuthzReason | null {
  const targetPersonId = actor.globalPersonId?.trim() ?? actor.binding?.globalPersonId?.trim() ?? "";
  if (!targetPersonId) {
    return { key: "byte354b.authz.reason.08" };
  }

  const activeTenantAdminGrants = allActors.flatMap((candidateActor) =>
    (candidateActor.roleGrants ?? [])
      .filter((grant) => grant.active && grant.roleCode === "TENANT_ADMIN")
      .map((grant) => ({ actor: candidateActor, grant })),
  );
  const otherGrants = activeTenantAdminGrants.filter(
    ({ actor: grantedActor }) => grantedActor.id !== actor.id,
  );

  if (
    otherGrants.filter(({ grant }) => grant.tenantId === targetTenantId).length >= 2
  ) {
    return { key: "byte354b.authz.reason.09" };
  }

  const samePersonSameTenant = otherGrants.find(
    ({ actor: grantedActor, grant }) =>
      (grantedActor.globalPersonId?.trim() ?? grantedActor.binding?.globalPersonId?.trim()) === targetPersonId &&
      grant.tenantId === targetTenantId,
  );
  if (samePersonSameTenant) {
    return { key: "byte354b.authz.reason.10" };
  }

  const samePersonOtherTenant = activeTenantAdminGrants.find(
    ({ actor: grantedActor, grant }) =>
      (grantedActor.globalPersonId?.trim() ?? grantedActor.binding?.globalPersonId?.trim()) === targetPersonId &&
      grant.tenantId !== targetTenantId,
  );
  if (samePersonOtherTenant) {
    return { key: "byte354b.authz.otherTenant", params: { tenantId: samePersonOtherTenant.grant.tenantId } };
  }

  return null;
}

function tenantBindingId(actor: AuthzActor): string {
  if (actor.binding?.scopeType.trim().toUpperCase() !== "TENANT") return "";
  return actor.binding.tenantId?.trim() ?? "";
}

function isRoleCompatibleWithActor(role: AuthzRole, actor: AuthzActor): boolean {
  const roleScope = normalizedRoleScope(role);
  const bindingScope = actor.binding?.scopeType.trim().toUpperCase() ?? "";

  if (bindingScope === "TENANT") return roleScope === "TENANT";
  if (bindingScope === "GLOBAL") return roleScope === "APPLICATION";

  // Raw Actors created from Application Authorization are intentionally
  // identity-neutral. 30K.2B2 requires delegated application authority to be
  // rooted in a canonical GLOBAL AccountActor owned by an Authentication
  // Account, so an unbound Actor must not be offered any grantable Role.
  return false;
}

function normalizedRoleScope(role: AuthzRole): string {
  if (role.code === "APPLICATION_ADMIN") return "APPLICATION";
  return role.scopeType.trim().toUpperCase();
}

function isApplicationScopedRole(role: AuthzRole | undefined) {
  return (
    role?.code === "APPLICATION_ADMIN" ||
    role?.scopeType.trim().toUpperCase() === "APPLICATION"
  );
}

function filterActorsByActorKeyOrDisplayName(
  actors: AuthzActor[],
  filter: string,
) {
  const normalizedFilter = normalizeActorFilterValue(filter);
  if (!normalizedFilter) return actors;

  return actors.filter((actor) =>
    normalizeActorFilterValue(actor.actorKey).includes(normalizedFilter) ||
    normalizeActorFilterValue(actor.displayName).includes(normalizedFilter),
  );
}

function normalizeActorFilterValue(value: string) {
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



function byCode<T extends { code: string }>(a: T, b: T) {
  return a.code.localeCompare(b.code);
}
