import { useEffect, useMemo, useState } from "react";

import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { ReactivationRequestsAlert } from "../auth/ReactivationRequestsAlert";
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
  const location = useLocation();
  const navigate = useNavigate();
  const actor = useOptionalAuthorizationContext();
  const canManageMemberships =
    actor?.scope === "TENANT" && actor.roleCodes.includes("TENANT_ADMIN");
  const isApplicationAdministrator =
    actor?.scope === "APPLICATION" && actor.roleCodes.includes("APPLICATION_ADMIN");
  // POST /people remains a Bite 28 compatibility path until the dedicated global
  // administration cutover. Preserve the existing create affordance for actors
  // that currently hold people.create (including today's Application Admin).
  const canCreatePerson =
    !actor || actor.permissions.includes("*") || actor.permissions.includes("people.create");
  // In the real application, status IDs are tenant-specific reference-data IDs.
  // Component tests render this page without AuthorizationContext, so retain the
  // historic default IDs only as that isolated-test fallback.
  const personStatusesQuery = useReferenceDataByType("person_status", Boolean(actor));
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
            <PageTitle>People</PageTitle>
            <p className="text-sm text-gray-500">
              Permanent identity records
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/collaborators"
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
            >
              Collaborators
            </Link>
            <Link
              to="/expenses"
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
            >
              Expenses
            </Link>
            <Link
              to="/admin/tenants"
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
            >
              Tenants
            </Link>
            <Link
              to="/admin/reference-data"
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
            >
              Admin
            </Link>
            <Link
              to="/admin/authorization"
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
            >
              Authz
            </Link>
            {canManageMemberships && (
              <Link
                to="/people/add-existing"
                className="rounded-xl border border-gray-950 bg-white px-4 py-2 text-sm font-semibold text-gray-950 shadow-sm"
              >
                Add existing
              </Link>
            )}
            {canCreatePerson && (
              <Link
                to="/people/new"
                className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white shadow-sm"
              >
                New Person
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

        {isApplicationAdministrator && <ReactivationRequestsAlert />}

        <section
          aria-label="Search and filter controls"
          className="rounded-2xl border bg-white p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div>
                <h2 className="text-lg font-semibold text-gray-950">Filters</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Search by Person details, Authentication login, Actor ID, or Actor Key.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <SegmentedOptionToggle
                ariaLabel="People view mode"
                value={viewMode}
                onChange={handleChange}
                showLabels={false}
                options={[
                  { value: "cards", label: "Card view", icon: <CardViewIcon /> },
                  { value: "list", label: "List view", icon: <ListViewIcon /> },
                ]}
              />
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
              >
                Clear filters
              </button>
            )}
          </div>

          <div className="mt-4">
            <label className="grid gap-1 text-sm font-medium text-gray-700">
              Filter people
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, nickname, CPF, RG, cellular, or email"
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm"
              />
            </label>
            {canManageMemberships && (
              <p className="mt-2 text-xs text-gray-500">
                Current-tenant People are searched first. If none match, ERS also searches global People who can be added to this tenant.
              </p>
            )}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-4 justify-items-start">
            <label className="grid gap-1 text-sm font-medium text-gray-700 min-w-0">
              Profile completion
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
                <option value="">All completion statuses</option>
                <option value="COMPLETE">Complete</option>
                <option value="INCOMPLETE">Incomplete</option>
                <option value="PERSONAL_ONLY">Personal only</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-gray-700 min-w-0">
              Collaborator eligibility
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
                <option value="all">All people</option>
                <option value="true">Can create collaborator</option>
                <option value="false">Cannot create collaborator</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-gray-700 min-w-0">
              Status
              <select
                value={peopleStatus}
                onChange={(event) => {
                  setPeopleStatus(
                    event.target.value as "All" | "Active" | "InActive" | "Discontinued",
                  );
                  setPage(1);
                }}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm">
                <option value="All">All</option>
                <option value="Active">Active</option>
                <option value="InActive">InActive</option>
                <option value="Discontinued">Discontinued</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-gray-700 min-w-0 md:max-w-[10rem]">  
              People per page
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
            Loading people...
          </div>
        )}

        {error && <ApiErrorPanel error={error} />}
        {globalPeopleQuery.error && <ApiErrorPanel error={globalPeopleQuery.error} />}
        {createMembership.error && <ApiErrorPanel error={createMembership.error} />}

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
                <h2 className="text-lg font-semibold">No Person in this tenant matches</h2>
                <p className="mt-2 text-sm text-gray-500">
                  Searching global People who can be added to this tenant...
                </p>
              </div>
            )}

            {shouldSearchGlobal &&
              !globalPeopleQuery.isLoading &&
              !globalPeopleQuery.error &&
              globalCandidates.length > 0 && (
                <section
                  aria-label="People available to add to this tenant"
                  className="rounded-2xl border border-blue-200 bg-blue-50/40 p-5 shadow-sm"
                >
                  <div>
                    <h2 className="text-lg font-semibold text-gray-950">
                      People available to add to this tenant
                    </h2>
                    <p className="mt-1 text-sm text-gray-600">
                      No current-tenant Person matched. These global People match your search and do not yet belong to this tenant.
                      Other tenant relationships and authentication details are not shown.
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
                                <dt className="inline font-medium">Email: </dt>
                                <dd className="inline">{person.email}</dd>
                              </div>
                              <div>
                                <dt className="inline font-medium">Cellular: </dt>
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
                              navigate(`/people/${created.id}`, {
                                state: {
                                  flash: `Person membership added: ${created.firstName} ${created.lastName}.`,
                                },
                              });
                            }}
                            className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {createMembership.isPending ? "Adding..." : "Add to this tenant"}
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
                      Open advanced membership form
                    </Link>
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="text-sm font-semibold text-gray-700 underline"
                    >
                      Clear filters
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
                  {hasActiveFilters ? "No people match these filters" : "No people yet"}
                </h2>
                <p className="mt-2 text-sm text-gray-500">
                  {hasActiveFilters
                    ? canManageMemberships && debouncedSearch.length >= 3
                      ? "No Person in this tenant or the global Person directory matches this search. Adjust the search, create a new Person, or clear the filters."
                      : "Adjust or clear the filters to widen the People list."
                    : "Create the first Person record before creating collaborators."}
                </p>
                {hasActiveFilters ? (
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="inline-block rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white"
                    >
                      Clear filters
                    </button>
                    {canManageMemberships && debouncedSearch.length >= 3 && (
                      <Link
                        to={`/people/add-existing?search=${encodeURIComponent(debouncedSearch)}`}
                        className="inline-block rounded-xl border border-gray-950 bg-white px-5 py-3 text-sm font-semibold text-gray-950"
                      >
                        Advanced global search
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
                        Add existing
                      </Link>
                    )}
                    {canCreatePerson && (
                      <Link
                        to="/people/new"
                        className="inline-block rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white"
                      >
                        Create Person
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
                            Just added
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-base font-medium text-slate-700">
                        <span className="font-bold">Nickname:</span>{" "}
                        {person.nickname || "—"}
                      </p>
                    </div>

                    <StatusBadge complete={person.canCreateCollaborator}>
                      {person.canCreateCollaborator ? "Complete" : "Incomplete"}
                    </StatusBadge>
                  </div>

                  <dl
                    aria-label="Person identity and contact details"
                    className="mt-4 grid gap-2.5 rounded-xl bg-slate-50 p-3 text-base text-slate-800"
                  >
                    <Info label="CPF" value={person.cpf} monospaced />
                    <Info label="RG" value={person.rg} monospaced />
                    <Info label="Cellular" value={person.cellular} />
                    <Info label="Email" value={person.email} />
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
                            Missing {section}
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
                    <th className="p-3">Name</th>
                    <th className="p-3">Nickname</th>
                    <th className="p-3">ID</th>
                    <th className="p-3">Contact</th>
                    <th className="p-3">Status</th>
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
                                Just added
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
                            {person.canCreateCollaborator ? "Complete" : "Incomplete"}
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
                                  Missing {section}
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
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-4 text-sm shadow-sm">
      <p className="font-medium text-gray-700" aria-live="polite">
        Showing {pageStart}-{pageEnd} of {total} people
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPrevious}
          disabled={page <= 1}
          className="rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-gray-500">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={page >= totalPages || total === 0}
          className="rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
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
  return (
    <dl aria-label="Identity details" className="grid gap-2">
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
  return (
    <dl aria-label="Contact details" className="grid gap-2">
      <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-baseline gap-2">
        <dt className="font-bold text-slate-700">Cellular</dt>
        <dd className="font-semibold tabular-nums text-slate-950">{cellular || "—"}</dd>
      </div>
      <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-baseline gap-2">
        <dt className="font-bold text-slate-700">Email</dt>
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