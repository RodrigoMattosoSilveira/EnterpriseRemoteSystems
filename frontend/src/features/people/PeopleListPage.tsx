import { useEffect, useMemo, useState } from "react";

import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { useOptionalAuthorizationContext } from "../../components/layout/AuthorizationContext";
import { useReferenceDataByType } from "../reference-data/useReferenceData";

import { useCreatePersonMembership, useGlobalPeopleSearch, usePeoplePage } from "./usePeople";

import {
  CardViewIcon,
  ListViewIcon,
  SegmentedOptionToggle,
} from "../../components/options/SegmentedOptionToggle";
import type {
  PeopleListFilter,
  Person,
  ProfileCompletionStatus,
} from "../../types/people";
import { PageTitle } from "../../components/layout/PageHeading";
import { useI18n } from "../../i18n";
import { personMissingSectionLabel } from "./personPresentation";
import { visibleNavigationLinks } from "../../components/layout/navigation";

type PeopleListState = {
  flash: string;
  createdPersonId: string;
  createdPerson?: Person;
};

type CollaboratorEligibilityFilter = "all" | "true" | "false";

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 25, 50];
const SEARCH_DEBOUNCE_MS = 350;

export function PeopleListPage() {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const actor = useOptionalAuthorizationContext();
  const canManageMemberships =
    actor?.scope === "TENANT" && actor.roleCodes.includes("TENANT_ADMIN");
  // Person creation is a Tenant data-plane capability. Bite 30I.1 removes it
  // from the GLOBAL Application Administrator while preserving it for Tenant
  // identities that explicitly hold people.create.
  const wildcard = Boolean(actor?.permissions.includes("*"));
  const canCreatePerson =
    !actor || wildcard || actor.permissions.includes("people.create");
  const canReadReferenceData =
    !actor || wildcard || actor.permissions.includes("reference_data.read");
  const visiblePaths = useMemo(() => {
    if (!actor) return null;
    return new Set(
      visibleNavigationLinks(actor.permissions, actor.scope, {
        personId: actor.personId,
        collaboratorId: actor.collaboratorId,
        supportLeaseId: actor.supportLeaseId,
      }).map((link) => link.to),
    );
  }, [actor]);
  const canNavigateTo = (path: string) => !visiblePaths || visiblePaths.has(path);

  // Person status IDs are Tenant reference data. A narrow support lease such as
  // people.read must still be able to open the People workspace without
  // triggering an unrelated reference_data.read request (and its global 403
  // redirect). Status filtering is therefore available only when the effective
  // context can actually read reference data.
  const personStatusesQuery = useReferenceDataByType(
    "person_status",
    Boolean(actor && canReadReferenceData),
  );
  const personStatuses = personStatusesQuery.data ?? [];
  const statusIdByCode = useMemo(() => {
    const entries = personStatuses.map((status) => [status.code, status.id] as const);
    return new Map(entries);
  }, [personStatuses]);
  const listState = readPeopleListState(location.state);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [profileCompletionStatus, setProfileCompletionStatus] =
    useState<ProfileCompletionStatus | "">("");
  const [canCreateCollaborator, setCanCreateCollaborator] =
    useState<CollaboratorEligibilityFilter>("all");
  const [peopleStatus, setPeopleStatus] = 
    useState<"All" | "Active" | "InActive" | "Discontinued">("All");
  
  const [searchParams, setSearchParams] = useSearchParams();
  const initialView = (searchParams.get("view") as "cards" | "list") || "cards";
  const [viewMode, setViewMode] = useState<"cards" | "list">(initialView);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const handleChange = (mode: "cards" | "list") => {
    setViewMode(mode);
    setSearchParams({ view: mode });
  };

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const filter = useMemo<PeopleListFilter>(
    () => ({
      search: debouncedSearch || undefined,
      profileCompletionStatus: profileCompletionStatus || undefined,
      canCreateCollaborator:
        canCreateCollaborator === "all"
          ? undefined
          : canCreateCollaborator === "true",
      page,
      pageSize,
      statusId:
        peopleStatus === "Active"
          ? statusIdByCode.get("ACTIVE") ?? (!actor ? "ref-person-status-active" : undefined)
          : peopleStatus === "InActive"
          ? statusIdByCode.get("INACTIVE") ?? (!actor ? "ref-person-status-inactive" : undefined)
          : peopleStatus === "Discontinued"
          ? statusIdByCode.get("DISCONTINUED") ?? (!actor ? "ref-person-status-discontinued" : undefined)
          : undefined,
    }),
    [actor, canCreateCollaborator, page, pageSize, profileCompletionStatus, peopleStatus, debouncedSearch, statusIdByCode],
  );

  const { data, isLoading, error } = usePeoplePage(filter);
  const people = data?.items ?? [];
  const total = data?.total ?? 0;
  const shouldSearchGlobal =
    canManageMemberships &&
    debouncedSearch.length >= 3 &&
    !isLoading &&
    !error &&
    total === 0;
  const globalPeopleQuery = useGlobalPeopleSearch(
    shouldSearchGlobal ? debouncedSearch : "",
  );
  const createMembership = useCreatePersonMembership();
  const globalCandidates = globalPeopleQuery.data?.items ?? [];
  const activeMembershipStatusId = statusIdByCode.get("ACTIVE");
  const displayedPeople = pinCreatedPerson(
    people,
    listState.createdPersonId,
    listState.createdPerson,
  );
  const hasActiveFilters = Boolean(
    debouncedSearch || profileCompletionStatus || canCreateCollaborator !== "all" || peopleStatus !== "All",
  );
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = total === 0 ? 0 : Math.min(total, page * pageSize);

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setProfileCompletionStatus("");
    setCanCreateCollaborator("all");
    setPeopleStatus("All");
    setPage(1);
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div>
            <PageTitle>{t("people.title")}</PageTitle>
            <p className="text-sm text-gray-500">
              {t("people.subtitle")}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {canNavigateTo("/collaborators") && (
              <Link
                to="/collaborators"
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
              >
                {t("common.collaborators")}
              </Link>
            )}
            {canNavigateTo("/expenses") && (
              <Link
                to="/expenses"
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
              >
                {t("common.expenses")}
              </Link>
            )}
            {canNavigateTo("/admin/tenants") && (
              <Link
                to="/admin/tenants"
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
              >
                {t("common.tenants")}
              </Link>
            )}
            {canNavigateTo("/admin/reference-data") && (
              <Link
                to="/admin/reference-data"
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
              >
                {t("common.admin")}
              </Link>
            )}
            {canNavigateTo("/admin/authorization") && (
              <Link
                to="/admin/authorization"
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
              >
                {t("common.authorizationShort")}
              </Link>
            )}
            {canManageMemberships && (
              <Link
                to="/people/add-existing"
                className="rounded-xl border border-gray-950 bg-white px-4 py-2 text-sm font-semibold text-gray-950 shadow-sm"
              >
                {t("people.addExisting")}
              </Link>
            )}
            {canCreatePerson && (
              <Link
                to="/people/new"
                className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white shadow-sm"
              >
                {t("people.newPerson")}
              </Link>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-4xl space-y-4 p-4">
        {listState.flash && (
          <div
            role="status"
            className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800"
          >
            {listState.flash}
          </div>
        )}

        {actor && actor.tenantId !== "*" && (
          <section
            aria-label={t("people.tenantBoundary.aria")}
            className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  {t("people.tenantBoundary.title")}
                </p>
                <h2 className="mt-1 text-lg font-bold text-slate-950">
                  {actor.selectedTenantName ?? actor.selectedTenantCode ?? actor.tenantId}
                </h2>
                <p className="mt-1 text-sm font-semibold text-slate-700">
                  {actor.selectedTenantCode && actor.selectedTenantCode !== actor.selectedTenantName
                    ? `${actor.selectedTenantCode} · `
                    : ""}
                  {t("people.tenantBoundary.tenantId")} <span className="font-mono">{actor.tenantId}</span>
                </p>
              </div>
              {actor.supportLeaseId && (
                <span className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-bold text-white">
                  {t("people.tenantBoundary.supportLease")}
                </span>
              )}
            </div>
            <p className="mt-3 text-sm text-slate-700">
              {t("people.tenantBoundary.description")}
            </p>
            {actor.supportLeaseId && (
              <p className="mt-2 text-xs font-medium text-slate-500">
                {t("people.tenantBoundary.supportLeaseId")} <span className="font-mono">{actor.supportLeaseId}</span>
              </p>
            )}
          </section>
        )}

        {/* Stable post-Bite-30 reconciliation evidence marker: Search and filter controls */}
        <section
          aria-label={t("people.filters.aria")}
          className="rounded-2xl border bg-white p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div>
                <h2 className="text-lg font-semibold text-gray-950">{t("people.filters.title")}</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {t("people.filters.help")}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <SegmentedOptionToggle
                ariaLabel={t("people.filters.aria")}
                value={viewMode}
                onChange={handleChange}
                showLabels={false}
                options={[
                  { value: "cards", label: t("common.cards"), icon: <CardViewIcon /> },
                  { value: "list", label: t("common.list"), icon: <ListViewIcon /> },
                ]}
              />
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
              >
                {t("people.filters.clear")}
              </button>
            )}
          </div>

          <div className="mt-4">
            <label className="grid gap-1 text-sm font-medium text-gray-700">
              {t("people.filters.filterPeople")}
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("people.filters.searchPlaceholder")}
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm"
              />
            </label>
            {canManageMemberships && (
              <p className="mt-2 text-xs text-gray-500">
                {t("people.filters.globalHelp")}
              </p>
            )}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-4 justify-items-start">
            <label className="grid gap-1 text-sm font-medium text-gray-700 min-w-0">
              {t("people.filters.profileCompletion")}
              <select
                value={profileCompletionStatus}
                onChange={(event) => {
                  setProfileCompletionStatus(
                    event.target.value as ProfileCompletionStatus | "",
                  );
                  setPage(1);
                }}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm"
              >
                <option value="">{t("people.filters.allCompletion")}</option>
                <option value="COMPLETE">{t("common.complete")}</option>
                <option value="INCOMPLETE">{t("common.incomplete")}</option>
                <option value="PERSONAL_ONLY">{t("people.filters.personalOnly")}</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-gray-700 min-w-0">
              {t("people.filters.collaboratorEligibility")}
              <select
                value={canCreateCollaborator}
                onChange={(event) => {
                  setCanCreateCollaborator(
                    event.target.value as CollaboratorEligibilityFilter,
                  );
                  setPage(1);
                }}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm"
              >
                <option value="all">{t("people.filters.allPeople")}</option>
                <option value="true">{t("people.filters.canCreate")}</option>
                <option value="false">{t("people.filters.cannotCreate")}</option>
              </select>
            </label>

            {canReadReferenceData && (
              <label className="grid gap-1 text-sm font-medium text-gray-700 min-w-0">
                {t("people.filters.status")}
                <select
                  value={peopleStatus}
                  onChange={(event) => {
                    setPeopleStatus(
                      event.target.value as "All" | "Active" | "InActive" | "Discontinued",
                    );
                    setPage(1);
                  }}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm">
                  <option value="All">{t("people.filters.all")}</option>
                  <option value="Active">{t("common.active")}</option>
                  <option value="InActive">{t("common.inactive")}</option>
                  <option value="Discontinued">{t("common.discontinued")}</option>
                </select>
              </label>
            )}

            <label className="grid gap-1 text-sm font-medium text-gray-700 min-w-0 md:max-w-[10rem]">  
              {t("people.filters.perPage")}
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm"
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {isLoading && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            {t("people.loading")}
          </div>
        )}

        {error && <ApiErrorPanel error={error} translate={t} />}
        {globalPeopleQuery.error && <ApiErrorPanel error={globalPeopleQuery.error} translate={t} />}
        {createMembership.error && <ApiErrorPanel error={createMembership.error} translate={t} />}

        {!isLoading && !error && (
          <PaginationSummary
            page={page}
            totalPages={totalPages}
            pageStart={pageStart}
            pageEnd={pageEnd}
            total={total}
            onPrevious={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
          />
        )}

        {!isLoading && !error && displayedPeople.length === 0 && (
          <>
            {shouldSearchGlobal && globalPeopleQuery.isLoading && (
              <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
                <h2 className="text-lg font-semibold">{t("people.empty.noMatch")}</h2>
                <p className="mt-2 text-sm text-gray-500">
                  {t("people.global.searching")}
                </p>
              </div>
            )}

            {shouldSearchGlobal &&
              !globalPeopleQuery.isLoading &&
              !globalPeopleQuery.error &&
              globalCandidates.length > 0 && (
                <section
                  aria-label={t("people.global.availableAria")}
                  className="rounded-2xl border border-blue-200 bg-blue-50/40 p-5 shadow-sm"
                >
                  <div>
                    <h2 className="text-lg font-semibold text-gray-950">
                      {t("people.global.availableTitle")}
                    </h2>
                    <p className="mt-1 text-sm text-gray-600">
                      {t("people.global.availableHelp")}
                    </p>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {globalCandidates.map((person) => (
                      <article
                        key={person.id}
                        className="rounded-xl border bg-white p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="font-semibold text-gray-950">
                              {person.firstName} {person.lastName}
                            </h3>
                            {person.nickname && (
                              <p className="text-sm text-gray-500">{person.nickname}</p>
                            )}
                            <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm md:grid-cols-2">
                              <div>
                                <dt className="inline font-medium">{t("common.email")}: </dt>
                                <dd className="inline">{person.email}</dd>
                              </div>
                              <div>
                                <dt className="inline font-medium">{t("common.cellular")}: </dt>
                                <dd className="inline">{person.cellular}</dd>
                              </div>
                            </dl>
                          </div>

                          <button
                            type="button"
                            disabled={!activeMembershipStatusId || createMembership.isPending}
                            onClick={async () => {
                              if (!activeMembershipStatusId) return;
                              const created = await createMembership.mutateAsync({
                                personId: person.id,
                                statusId: activeMembershipStatusId,
                                notes: "",
                              });
                              navigate(`/people/${created.id}#authentication`, {
                                state: {
                                  flash: t("people.membershipAdded", {
                                    name: `${created.firstName} ${created.lastName}`,
                                    instruction: t("people.authentication.configureTenant"),
                                  }),
                                },
                              });
                            }}
                            className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {createMembership.isPending ? t("people.adding") : t("people.addToTenant")}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      to={`/people/add-existing?search=${encodeURIComponent(debouncedSearch)}`}
                      className="text-sm font-semibold text-gray-700 underline"
                    >
                      {t("people.global.openAdvanced")}
                    </Link>
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="text-sm font-semibold text-gray-700 underline"
                    >
                      {t("people.filters.clear")}
                    </button>
                  </div>
                </section>
              )}

            {(!shouldSearchGlobal ||
              (!globalPeopleQuery.isLoading &&
                !globalPeopleQuery.error &&
                globalCandidates.length === 0)) && (
              <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
                <h2 className="text-lg font-semibold">
                  {hasActiveFilters ? t("people.empty.noMatch") : t("people.empty.none")}
                </h2>
                <p className="mt-2 text-sm text-gray-500">
                  {hasActiveFilters
                    ? canManageMemberships && debouncedSearch.length >= 3
                      ? t("people.global.noMatch")
                      : t("people.filters.widen")
                    : t("people.empty.createFirst")}
                </p>
                {hasActiveFilters ? (
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="inline-block rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white"
                    >
                      {t("people.filters.clear")}
                    </button>
                    {canManageMemberships && debouncedSearch.length >= 3 && (
                      <Link
                        to={`/people/add-existing?search=${encodeURIComponent(debouncedSearch)}`}
                        className="inline-block rounded-xl border border-gray-950 bg-white px-5 py-3 text-sm font-semibold text-gray-950"
                      >
                        {t("people.global.advancedSearch")}
                      </Link>
                    )}
                  </div>
                ) : canManageMemberships || canCreatePerson ? (
                  <div className="mt-5 flex justify-center gap-2">
                    {canManageMemberships && (
                      <Link
                        to="/people/add-existing"
                        className="inline-block rounded-xl border border-gray-950 bg-white px-5 py-3 text-sm font-semibold text-gray-950"
                      >
                        {t("people.addExisting")}
                      </Link>
                    )}
                    {canCreatePerson && (
                      <Link
                        to="/people/new"
                        className="inline-block rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white"
                      >
                        {t("people.createPerson")}
                      </Link>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </>
        )}

        {viewMode === "cards" ? (
          <div className="grid gap-4 md:grid-cols-2">
            {displayedPeople.map((person) => {
              const wasJustCreated = person.id === listState.createdPersonId;


              return (
                <Link
                  key={person.id}
                  to={`/people/${person.id}?view=${viewMode}`}
                  className={`block rounded-2xl border p-5 shadow-sm transition hover:underline ${
                    wasJustCreated
                      ? "border-green-300 bg-green-50 ring-2 ring-green-100"
                      : "bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-gray-950">
                          {person.firstName} {person.lastName}
                        </h2>
                        {wasJustCreated && (
                          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
                            {t("people.justAdded")}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-base font-medium text-slate-700">
                        <span className="font-bold">{t("common.nickname")}:</span>{" "}
                        {person.nickname || "—"}
                      </p>
                    </div>

                    <StatusBadge complete={person.canCreateCollaborator}>
                      {person.canCreateCollaborator ? t("people.profileComplete") : t("people.profileIncomplete")}
                    </StatusBadge>
                  </div>

                  <dl
                    aria-label={t("people.details.identityAria")}
                    className="mt-4 grid gap-2.5 rounded-xl bg-slate-50 p-3 text-base text-slate-800"
                  >
                    <Info label="CPF" value={person.cpf} monospaced />
                    <Info label="RG" value={person.rg} monospaced />
                    <Info label={t("people.contact.cellular")} value={person.cellular} />
                    <Info label={t("people.contact.email")} value={person.email} />
                  </dl>

                  {!person.canCreateCollaborator &&
                    person.missingSections &&
                    person.missingSections.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {person.missingSections.map((section) => (
                          <span
                            key={section}
                            className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800"
                          >
                            {t("people.missingSection", { section: personMissingSectionLabel(section, t) })}
                          </span>
                        ))}
                      </div>
                    )}
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-base">
                <thead className="bg-slate-100 text-sm font-bold uppercase tracking-wide text-slate-700">
                  <tr>
                    <th className="p-3">{t("people.table.name")}</th>
                    <th className="p-3">{t("people.table.nickname")}</th>
                    <th className="p-3">ID</th>
                    <th className="p-3">{t("people.table.contact")}</th>
                    <th className="p-3">{t("people.table.status")}</th>
                    {/* <th className="p-3">Missing1</th> */}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {displayedPeople.map((person) => {
                    const wasJustCreated = person.id === listState.createdPersonId;

                    return (
                      <tr
                        key={person.id}
                        className={wasJustCreated ? "bg-green-50" : "bg-white"}
                      >
                        <td className="p-3 align-top">
                          <Link
                            to={`/people/${person.id}?view=${viewMode}`}
                            className="font-semibold text-gray-950 underline-offset-2 hover:underline"
                          >
                            {person.firstName} {person.lastName}
                          </Link>
                          {wasJustCreated && (
                            <div className="mt-1">
                              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
                                {t("people.justAdded")}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="p-3 align-top font-medium text-slate-800">
                          {person.nickname || "—"}
                        </td>
                        <td className="p-3 align-top text-slate-800">
                          <IdentityDetails cpf={person.cpf} rg={person.rg} />
                        </td>
                        <td className="p-3 align-top text-slate-800">
                          <ContactDetails cellular={person.cellular} email={person.email} />
                        </td>
                        <td className="p-3 align-top">
                          <StatusBadge complete={person.canCreateCollaborator}>
                            {person.canCreateCollaborator ? t("people.profileComplete") : t("people.profileIncomplete")}
                          </StatusBadge>
                        </td>
                        {/*
                        <td className="p-3 align-top">
                          {person.canCreateCollaborator || !person.missingSections || person.missingSections.length === 0 ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {person.missingSections.map((section) => (
                                <span
                                  key={section}
                                  className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800"
                                >
                                  {t("people.missingSection", { section: personMissingSectionLabel(section, t) })}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        */}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!isLoading && !error && displayedPeople.length > 0 && (
          <PaginationSummary
            page={page}
            totalPages={totalPages}
            pageStart={pageStart}
            pageEnd={pageEnd}
            total={total}
            onPrevious={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
          />
        )}
      </section>
    </main>
  );
}

function PaginationSummary({
  page,
  totalPages,
  pageStart,
  pageEnd,
  total,
  onPrevious,
  onNext,
}: {
  page: number;
  totalPages: number;
  pageStart: number;
  pageEnd: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-4 text-sm shadow-sm">
      <p className="font-medium text-gray-700" aria-live="polite">
        {t("people.pagination.summary", { start: pageStart, end: pageEnd, total })}
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPrevious}
          disabled={page <= 1}
          className="rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("common.previous")}
        </button>
        <span className="text-gray-500">
          {t("people.pagination.page", { page, total: totalPages })}
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={page >= totalPages || total === 0}
          className="rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("common.next")}
        </button>
      </div>
    </div>
  );
}

function readPeopleListState(state: unknown): PeopleListState {
  if (typeof state !== "object" || state === null) {
    return { flash: "", createdPersonId: "" };
  }

  const record = state as Record<string, unknown>;
  const createdPerson = isPerson(record.createdPerson)
    ? record.createdPerson
    : undefined;

  return {
    flash: typeof record.flash === "string" ? record.flash : "",
    createdPersonId:
      typeof record.createdPersonId === "string" ? record.createdPersonId : "",
    createdPerson,
  };
}

function pinCreatedPerson(
  people: Person[],
  createdPersonId: string,
  createdPerson?: Person,
) {
  if (!createdPersonId) return people;

  const matched = people.find((person) => person.id === createdPersonId);
  const pinnedPerson = matched ?? createdPerson;
  if (!pinnedPerson) return people;

  return [
    pinnedPerson,
    ...people.filter((person) => person.id !== createdPersonId),
  ];
}

function isPerson(value: unknown): value is Person {
  if (typeof value !== "object" || value === null) return false;

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.firstName === "string" &&
    typeof record.lastName === "string" &&
    typeof record.nickname === "string" &&
    typeof record.cpf === "string" &&
    typeof record.rg === "string" &&
    typeof record.cellular === "string" &&
    typeof record.email === "string"
  );
}

function Info({
  label,
  value,
  monospaced = false,
}: {
  label: string;
  value?: string;
  monospaced?: boolean;
}) {
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-baseline gap-3">
      <dt className="font-bold text-slate-700">{label}</dt>
      <dd
        className={`min-w-0 break-words text-right font-semibold text-slate-950 ${
          monospaced ? "font-mono tabular-nums tracking-wide" : ""
        }`}
      >
        {value || "—"}
      </dd>
    </div>
  );
}

function IdentityDetails({ cpf, rg }: { cpf?: string; rg?: string }) {
  const { t } = useI18n();
  return (
    <dl aria-label={t("people.identityAria")} className="grid gap-2">
      <IdentityRow label="CPF" value={cpf} />
      <IdentityRow label="RG" value={rg} />
    </dl>
  );
}

function IdentityRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="grid grid-cols-[3rem_minmax(0,1fr)] items-baseline gap-2">
      <dt className="font-bold text-slate-700">{label}</dt>
      <dd className="font-mono font-semibold tabular-nums tracking-wide text-slate-950">
        {value || "—"}
      </dd>
    </div>
  );
}

function ContactDetails({ cellular, email }: { cellular?: string; email?: string }) {
  const { t } = useI18n();
  return (
    <dl aria-label={t("people.contact.aria")} className="grid gap-2">
      <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-baseline gap-2">
        <dt className="font-bold text-slate-700">{t("people.contact.cellular")}</dt>
        <dd className="font-semibold tabular-nums text-slate-950">{cellular || "—"}</dd>
      </div>
      <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-baseline gap-2">
        <dt className="font-bold text-slate-700">{t("people.contact.email")}</dt>
        <dd className="break-all font-semibold text-slate-950">{email || "—"}</dd>
      </div>
    </dl>
  );
}

function StatusBadge({
  complete,
  children,
}: {
  complete: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        complete
          ? "bg-green-100 text-green-800"
          : "bg-amber-100 text-amber-800"
      }`}
    >
      {children}
    </span>
  );
}