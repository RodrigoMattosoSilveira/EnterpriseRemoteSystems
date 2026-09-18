import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { JourneyDaysRemaining } from "../../components/JourneyDaysRemaining";
import { useAuthorizationContext } from "../../components/layout/AuthorizationContext";
import type { Collaborator } from "../../types/collaborators";
import {
  useCollaboratorCatalog,
  useCollaboratorSearch,
  useSelfCollaboratorJourneys,
} from "./useCollaborators";
import { PageTitle } from "../../components/layout/PageHeading";
import { translateEnglish, type Translate, useI18n } from "../../i18n";

export function CollaboratorsListPage() {
  const { t } = useI18n();
  const location = useLocation();
  const actor = useAuthorizationContext();
  const wildcard = actor.permissions.includes("*");
  const canBrowseCollaborators =
    wildcard || actor.permissions.includes("collaborators.read");
  const selfMode =
    !canBrowseCollaborators &&
    actor.permissions.includes("collaborators.self.read");
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("search")?.trim() ?? "";
  const [searchDraft, setSearchDraft] = useState(search);
  const hasSearch = !selfMode && search.length > 0;
  const catalogQuery = useCollaboratorCatalog(!selfMode && !hasSearch);
  const searchQuery = useCollaboratorSearch(selfMode ? "" : search);
  const selfQuery = useSelfCollaboratorJourneys(selfMode);
  const allCollaborators = catalogQuery.data ?? [];
  const searchResult = searchQuery.data;
  const collaborators = useMemo(
    () => {
      if (selfMode) {
        return sortSelfCollaboratorJourneys(selfQuery.data ?? []);
      }
      return sortCollaborators(
        hasSearch ? searchResult?.items ?? [] : allCollaborators,
      );
    },
    [allCollaborators, hasSearch, searchResult?.items, selfMode, selfQuery.data],
  );
  const total = selfMode
    ? selfQuery.data?.length ?? 0
    : hasSearch
      ? searchResult?.total ?? 0
      : allCollaborators.length;
  const isLoading = selfMode
    ? selfQuery.isLoading
    : hasSearch
      ? searchQuery.isLoading
      : catalogQuery.isLoading;
  const error = selfMode
    ? selfQuery.error
    : hasSearch
      ? searchQuery.error
      : catalogQuery.error;
  const flash = readFlash(location.state);

  useEffect(() => {
    setSearchDraft(search);
  }, [search]);

  function updateSearch(nextValue: string) {
    setSearchDraft(nextValue);

    const next = new URLSearchParams(searchParams);
    const normalizedSearch = nextValue.trim();
    if (normalizedSearch) {
      next.set("search", normalizedSearch);
    } else {
      next.delete("search");
    }
    setSearchParams(next, { replace: true });
  }

  function clearFilter() {
    const next = new URLSearchParams(searchParams);
    next.delete("search");
    setSearchDraft("");
    setSearchParams(next, { replace: true });
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t("common.operations")}
            </p>
            <PageTitle>
              {selfMode ? t("collaborators.myJourneys") : t("collaborators.title")}
            </PageTitle>
            <p className="text-sm text-gray-500">
              {selfMode
                ? t("collaborators.selfSubtitle")
                : t("collaborators.subtitle")}
            </p>
          </div>

          {canBrowseCollaborators ? (
            <div className="flex items-center gap-2">
              <Link
                to="/people"
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
              >
                {t("nav.people")}
              </Link>
              <Link
                to="/expenses"
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
              >
                {t("nav.expenses")}
              </Link>
              <Link
                to="/work-periods"
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
              >
                {t("nav.workPeriods")}
              </Link>
              <Link
                to="/collaborators/new"
                className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white shadow-sm"
              >
                {t("collaborators.add")}
              </Link>
            </div>
          ) : actor.personId ? (
            <Link
              to={`/people/${encodeURIComponent(actor.personId)}`}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
            >
              {t("collaborators.myPerson")}
            </Link>
          ) : null}
        </div>
      </header>

      <section className="mx-auto max-w-5xl space-y-4 p-4">
        {flash && (
          <div
            role="status"
            className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800"
          >
            {flash}
          </div>
        )}

        <ApiErrorPanel error={error} translate={t} />

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">
                {selfMode ? t("collaborators.history") : t("collaborators.journeys")}
              </h2>
              <p className="text-sm text-gray-500">
                {selfMode
                  ? t(collaborators.length === 1 ? "collaborators.showingJourneyOne" : "collaborators.showingJourneys", { count: collaborators.length })
                  : t("collaborators.showing", { count: collaborators.length, total })}
              </p>
              {hasSearch && (
                <p className="mt-1 text-xs font-medium text-gray-600">
                  {t("collaborators.filtering", { search })}
                </p>
              )}
            </div>

            {!selfMode ? (
              <div className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-xl">
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="collaborator-search"
                  className="text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  {t("collaborators.search")}
                </label>
                <input
                  id="collaborator-search"
                  value={searchDraft}
                  onChange={(event) => updateSearch(event.target.value)}
                  placeholder={t("collaborators.searchPlaceholder")}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-950 focus:outline-none focus:ring-1 focus:ring-gray-950"
                />
              </div>
              <div className="flex items-end gap-2">
                {hasSearch && (
                  <button
                    type="button"
                    onClick={clearFilter}
                    className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
                  >
                    {t("common.clear")}
                  </button>
                )}
              </div>
            </div>
            ) : null}
          </div>
        </section>

        {isLoading && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            {t("collaborators.loading")}
          </div>
        )}

        {!isLoading && !error && collaborators.length === 0 && (
          <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
            <h2 className="text-lg font-semibold">
              {selfMode
                ? t("collaborators.emptySelf")
                : hasSearch
                  ? t("collaborators.emptyFiltered")
                  : t("collaborators.empty")}
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              {selfMode
                ? t("collaborators.emptySelfHelp")
                : hasSearch
                  ? t("collaborators.emptyFilteredHelp")
                  : t("collaborators.emptyHelp")}
            </p>
            {!selfMode && !hasSearch && (
              <>
                <Link
                  to="/expenses"
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
                >
                  {t("nav.expenses")}
                </Link>
                <Link
                  to="/collaborators/new"
                  className="mt-5 inline-block rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white"
                >
                  {t("collaborators.create")}
                </Link>
              </>
            )}
          </div>
        )}

        {!isLoading && collaborators.length > 0 && (
          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="hidden md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="p-3">{t("collaborators.table.person")}</th>
                    <th className="p-3">{t("collaborators.table.journey")}</th>
                    <th className="p-3">{t("collaborators.table.work")}</th>
                    <th className="p-3">{t("common.journeyId")}</th>
                    <th className="p-3">{t("collaborators.table.status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {collaborators.map((collaborator) => (
                    <tr key={collaborator.id}>
                      <td className="p-3">
                        <Link
                          to={`/collaborators/${collaborator.id}`}
                          className="font-semibold text-gray-950 underline-offset-2 hover:underline"
                        >
                          {personDisplayName(collaborator, t)}
                        </Link>
                        {personSecondaryLabel(collaborator) && (
                          <div className="text-xs text-gray-500">
                            {personSecondaryLabel(collaborator)}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-gray-700">
                        <div>{formatDate(collaborator.journeyStartDate)}</div>
                        <div className="text-xs text-gray-500">
                          {t("collaborators.projectedEnd", { date: collaborator.projectedEndDate })}
                        </div>
                        <JourneyTiming collaborator={collaborator} className="mt-1 block text-xs" />
                      </td>
                      <td className="p-3 text-gray-700">
                        <div>{collaborator.taskLabel || "—"}</div>
                        <div className="text-xs text-gray-500">
                          {collaborator.sectorLabel || "—"} ·{" "}
                          {collaborator.locationLabel || "—"}
                        </div>
                      </td>
                      <td className="p-3 text-gray-700">
                        <Link
                          to={`/collaborators/${collaborator.id}`}
                          className="break-all font-mono text-xs font-semibold text-gray-900 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-900"
                        >
                          {collaborator.id}
                        </Link>
                      </td>
                      <td className="p-3">
                        <JourneyStatusBadge collaborator={collaborator} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y md:hidden">
              {collaborators.map((collaborator) => (
                <CollaboratorCard
                  key={collaborator.id}
                  collaborator={collaborator}
                  selfMode={selfMode}
                />
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

const collaboratorNameCollator = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
});

function sortCollaborators(collaborators: Collaborator[]) {
  return [...collaborators].sort((left, right) => {
    const displayComparison = collaboratorNameCollator.compare(
      personDisplayName(left),
      personDisplayName(right),
    );
    if (displayComparison !== 0) return displayComparison;

    const legalNameComparison = collaboratorNameCollator.compare(
      left.personName?.trim() ?? "",
      right.personName?.trim() ?? "",
    );
    if (legalNameComparison !== 0) return legalNameComparison;

    return collaboratorNameCollator.compare(left.id, right.id);
  });
}

function sortSelfCollaboratorJourneys(collaborators: Collaborator[]) {
  return [...collaborators].sort((left, right) => {
    const startComparison = right.journeyStartDate.localeCompare(
      left.journeyStartDate,
    );
    if (startComparison !== 0) return startComparison;
    return right.createdAt.localeCompare(left.createdAt);
  });
}

function CollaboratorCard({
  collaborator,
  selfMode,
}: {
  collaborator: Collaborator;
  selfMode: boolean;
}) {
  const { t } = useI18n();
  return (
    <Link to={`/collaborators/${collaborator.id}`} className="block p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-950">
            {personDisplayName(collaborator, t)}
          </h2>
          {personSecondaryLabel(collaborator) && (
            <p className="text-xs text-gray-500">
              {personSecondaryLabel(collaborator)}
            </p>
          )}
          <p className="text-sm text-gray-500">
            {collaborator.taskLabel || "—"} ·{" "}
            {collaborator.locationLabel || "—"}
          </p>
        </div>
        <JourneyStatusBadge collaborator={collaborator} />
      </div>

      <div className="mt-4 grid gap-2 text-sm text-gray-700">
        <Info label={t("common.start")} value={formatDate(collaborator.journeyStartDate)} />
        <Info
          label={t("common.projectedEnd")}
          value={formatDate(collaborator.projectedEndDate)}
        />
        <JourneyTiming
          collaborator={collaborator}
          className="text-right text-sm"
        />
        <Info label={t("common.journeyId")} value={collaborator.id} breakValue />
      </div>
    </Link>
  );
}

function personDisplayName(
  collaborator: Collaborator,
  t: Translate = translateEnglish,
) {
  return (
    collaborator.personNickname?.trim() ||
    collaborator.personName?.trim() ||
    t("collaborator.personUnavailable")
  );
}

function personSecondaryLabel(collaborator: Collaborator) {
  const nickname = collaborator.personNickname?.trim();
  const name = collaborator.personName?.trim();

  if (!nickname || !name || name === nickname) {
    return "";
  }

  return name;
}

function JourneyStatusBadge({ collaborator }: { collaborator: Collaborator }) {
  const { t } = useI18n();
  const closed = Boolean(collaborator.closedAt);
  const label = closed
    ? t("collaborators.closed")
    : collaborator.statusLabel || collaborator.statusId;

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        closed ? "bg-gray-100 text-gray-700" : "bg-green-100 text-green-800"
      }`}
    >
      {label}
    </span>
  );
}

function JourneyTiming({
  collaborator,
  className,
}: {
  collaborator: Collaborator;
  className?: string;
}) {
  const { t } = useI18n();
  if (collaborator.closedAt) {
    return (
      <span className={["font-semibold text-gray-600", className].filter(Boolean).join(" ")}>
        {t("collaborators.closed")} {formatDate(collaborator.closedAt)}
      </span>
    );
  }

  return (
    <JourneyDaysRemaining
      projectedEndDate={collaborator.projectedEndDate}
      className={className}
    />
  );
}

function Info({
  label,
  value,
  breakValue = false,
}: {
  label: string;
  value: string;
  breakValue?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-500">{label}</span>
      <span
        className={`text-right font-medium ${breakValue ? "break-all font-mono text-xs" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return "—";
  return value;
}

function readFlash(state: unknown) {
  if (
    typeof state === "object" &&
    state !== null &&
    "flash" in state &&
    typeof state.flash === "string"
  ) {
    return state.flash;
  }
  return "";
}
