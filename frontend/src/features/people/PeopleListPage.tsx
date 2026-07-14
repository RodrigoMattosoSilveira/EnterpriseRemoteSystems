import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePeoplePage } from "./usePeople";
import type {
  PeopleListFilter,
  Person,
  ProfileCompletionStatus,
} from "../../types/people";

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
  const listState = readPeopleListState(location.state);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [profileCompletionStatus, setProfileCompletionStatus] =
    useState<ProfileCompletionStatus | "">("");
  const [canCreateCollaborator, setCanCreateCollaborator] =
    useState<CollaboratorEligibilityFilter>("all");
  const [peopleStatus, setPeopleStatus] = 
    useState<"All" | "Active" | "InActive">("All");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

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
          ? "ref-person-status-active"
          : peopleStatus === "InActive"
          ? "ref-person-status-inactive"
          : undefined,
    }),
    [canCreateCollaborator, page, pageSize, profileCompletionStatus, peopleStatus, debouncedSearch],
  );

  const { data, isLoading, error } = usePeoplePage(filter);
  const people = data?.items ?? [];
  const total = data?.total ?? 0;
  const displayedPeople = pinCreatedPerson(
    people,
    listState.createdPersonId,
    listState.createdPerson,
  );
  const hasActiveFilters = Boolean(
    debouncedSearch || profileCompletionStatus || canCreateCollaborator !== "all",
  );
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = total === 0 ? 0 : Math.min(total, page * pageSize);

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setProfileCompletionStatus("");
    setCanCreateCollaborator("all");
    setPage(1);
  }

  const { t } = useTranslation("people");

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-950">{t("title")}</h1>
            <p className="text-sm text-gray-500">{t("subtitle")}</p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/collaborators"
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
            >
              {t("collaboratorsLink")}
            </Link>
            <Link
              to="/expenses"
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
            >
              {t("expensesLink")}
            </Link>
            <Link
              to="/admin/reference-data"
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
            >
              {t("adminLink")}
            </Link>
            <Link
              to="/admin/authorization"
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
            >
              {t("authzLink")}
            </Link>
            <Link
              to="/people/new"
              className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white shadow-sm"
            >
              {t("addButton")}
            </Link>
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

        <section
          aria-label={t("filtersTitle")}
          className="rounded-2xl border bg-white p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">{t("filtersTitle")}</h2>
              <p className="mt-1 text-sm text-gray-500">{t("filtersDescription")}</p>
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
              >
                {t("clearFilters")}
              </button>
            )}
          </div>

          <div className="mt-4">
            <label className="grid gap-1 text-sm font-medium text-gray-700">
              {t("filterPeople")}
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("searchPlaceholder")}
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-4 justify-items-start">
            <label className="grid gap-1 text-sm font-medium text-gray-700 min-w-0">
              {t("profileCompletion")}
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
                <option value="">{t("allCompletionStatuses")}</option>
                <option value="COMPLETE">{t("complete")}</option>
                <option value="INCOMPLETE">{t("incomplete")}</option>
                <option value="PERSONAL_ONLY">{t("personalOnly")}</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-gray-700 min-w-0">
              {t("collaboratorEligibility")}
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
                <option value="all">{t("allPeople")}</option>
                <option value="true">{t("canCreateCollaborator")}</option>
                <option value="false">{t("cannotCreateCollaborator")}</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-gray-700 min-w-0">
              {t("status")}
              <select
                value={peopleStatus}
                onChange={(event) => {
                  setPeopleStatus(
                    event.target.value as "All" | "Active" | "InActive",
                  );
                  setPage(1);
                }}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm">
                <option value="All">{t("all")}</option>
                <option value="Active">{t("active")}</option>
                <option value="InActive">{t("inactive")}</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-gray-700 min-w-0 md:max-w-[10rem]">
              {t("peoplePerPage")}
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
            {t("loading")}
          </div>
        )}

        {error && (
          <pre className="rounded bg-red-50 p-4 text-xs text-red-800">
            {JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}
          </pre>
        )}

        {!isLoading && !error && (
          <PaginationSummary            t={t}            page={page}
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
          <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
            <h2 className="text-lg font-semibold">
              {hasActiveFilters ? t("noMatchFilters") : t("noPeopleYet")}
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              {hasActiveFilters ? t("adjustClearFilters") : t("createFirstPerson")}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-5 inline-block rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white"
              >
                {t("clearFilters")}
              </button>
            ) : (
              <Link
                to="/people/new"
                className="mt-5 inline-block rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white"
              >
                {t("createPerson")}
              </Link>
            )}
          </div>
        )}

        {displayedPeople.map((person) => {
          const wasJustCreated = person.id === listState.createdPersonId;

          return (
            <Link
              key={person.id}
              to={`/people/${person.id}`}
              className={`block rounded-2xl border p-5 shadow-sm transition hover:shadow-md ${
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
                        {t("justAdded")}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    {t("nickname")}: {person.nickname || t("emptyValue")}
                  </p>
                </div>

                <StatusBadge complete={person.canCreateCollaborator}>
                  {person.canCreateCollaborator ? t("complete") : t("incomplete")}
                </StatusBadge>
              </div>

              <div className="mt-4 grid gap-2 text-sm text-gray-700">
                <Info label={t("cpf")} value={person.cpf} />
                <Info label={t("rg")} value={person.rg} />
                <Info label={t("cellular")} value={person.cellular} />
                <Info label={t("email")} value={person.email} />
              </div>

              {!person.canCreateCollaborator &&
                person.missingSections &&
                person.missingSections.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {person.missingSections.map((section) => (
                      <span
                        key={section}
                        className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800"
                      >
                        {t("missing", { section })}
                      </span>
                    ))}
                  </div>
                )}
            </Link>
          );
        })}

        {!isLoading && !error && displayedPeople.length > 0 && (
          <PaginationSummary
            t={t}
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
  t,
  page,
  totalPages,
  pageStart,
  pageEnd,
  total,
  onPrevious,
  onNext,
}: {
  t: (key: string, options?: Record<string, string | number>) => string;
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
        {t("showing", { pageStart, pageEnd, total })}
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPrevious}
          disabled={page <= 1}
          className="rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("previous")}
        </button>
        <span className="text-gray-500">
          {t("pageOf", { page, totalPages })}
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={page >= totalPages || total === 0}
          className="rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("next")}
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

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium">{value || "—"}</span>
    </div>
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