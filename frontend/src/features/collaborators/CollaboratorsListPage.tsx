import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { JourneyDaysRemaining } from "../../components/JourneyDaysRemaining";
import type { Collaborator } from "../../types/collaborators";
import {
  useCollaboratorCatalog,
  useCollaboratorSearch,
} from "./useCollaborators";

export function CollaboratorsListPage() {
  const { t, i18n } = useTranslation("collaborators");
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("search")?.trim() ?? "";
  const [searchDraft, setSearchDraft] = useState(search);
  const hasSearch = search.length > 0;
  const catalogQuery = useCollaboratorCatalog(!hasSearch);
  const searchQuery = useCollaboratorSearch(search);
  const allCollaborators = catalogQuery.data ?? [];
  const searchResult = searchQuery.data;
  const collaborators = useMemo(
    () =>
      sortCollaborators(
        hasSearch ? searchResult?.items ?? [] : allCollaborators,
        t("personUnavailable"),
      ),
    [allCollaborators, hasSearch, searchResult?.items, t],
  );
  const total = hasSearch ? searchResult?.total ?? 0 : allCollaborators.length;
  const isLoading = hasSearch ? searchQuery.isLoading : catalogQuery.isLoading;
  const error = hasSearch ? searchQuery.error : catalogQuery.error;
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
              {t("operations")}
            </p>
            <h1 className="text-xl font-bold text-gray-950">{t("title")}</h1>
            <p className="text-sm text-gray-500">
              {t("subtitle")}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/people"
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
            >
              {t("peopleLink")}
            </Link>
            <Link
              to="/expenses"
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
            >
              {t("expensesLink")}
            </Link>
            <Link
              to="/work-periods"
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
            >
              {t("workPeriodsLink")}
            </Link>
            <Link
              to="/collaborators/new"
              className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white shadow-sm"
            >
              {t("addButton")}
            </Link>
          </div>
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

        <ApiErrorPanel error={error} />

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">
                {t("journeysTitle")}
              </h2>
              <p className="text-sm text-gray-500">
                {t("showingRecords", { shown: collaborators.length, total })}
              </p>
              {hasSearch && (
                <p className="mt-1 text-xs font-medium text-gray-600">
                  {t("filteringBy", { search })}
                </p>
              )}
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-xl">
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="collaborator-search"
                  className="text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  {t("searchByNameOrNickname")}
                </label>
                <input
                  id="collaborator-search"
                  value={searchDraft}
                  onChange={(event) => updateSearch(event.target.value)}
                  placeholder={t("searchPlaceholder")}
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
                    {t("clear")}
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {isLoading && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            {t("loadingCollaborators")}
          </div>
        )}

        {!isLoading && !error && collaborators.length === 0 && (
          <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
            <h2 className="text-lg font-semibold">
              {hasSearch
                ? t("noCollaboratorsMatchFilter")
                : t("noCollaboratorsYet")}
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              {hasSearch
                ? t("tryAnotherNameOrNickname")
                : t("createAfterPersonComplete")}
            </p>
            {!hasSearch && (
              <>
                <Link
                  to="/expenses"
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
                >
                  {t("expensesLink")}
                </Link>
                <Link
                  to="/collaborators/new"
                  className="mt-5 inline-block rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white"
                >
                  {t("createCollaborator")}
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
                    <th className="p-3">{t("person")}</th>
                    <th className="p-3">{t("journey")}</th>
                    <th className="p-3">{t("work")}</th>
                    <th className="p-3">{t("payment")}</th>
                    <th className="p-3">{t("status")}</th>
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
                          {personDisplayName(collaborator, t("personUnavailable"))}
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
                          {t("projectedEnd")}: {" "}
                          {formatDate(collaborator.projectedEndDate)}
                        </div>
                        <JourneyDaysRemaining
                          projectedEndDate={collaborator.projectedEndDate}
                          closedAt={collaborator.closedAt}
                          className="mt-1 block text-xs"
                        />
                      </td>
                      <td className="p-3 text-gray-700">
                        <div>{collaborator.taskLabel || t("dash")}</div>
                        <div className="text-xs text-gray-500">
                          {collaborator.sectorLabel || t("dash")} ·{" "}
                          {collaborator.locationLabel || t("dash")}
                        </div>
                      </td>
                      <td className="p-3 text-gray-700">
                        <div>{formatMoney(collaborator.paymentValue, i18n.language)}</div>
                        <div className="text-xs text-gray-500">
                          {collaborator.paymentMethodLabel || t("dash")}
                        </div>
                      </td>
                      <td className="p-3">
                        <StatusBadge
                          label={
                            collaborator.statusLabel || collaborator.statusId
                          }
                        />
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
                  unavailableLabel={t("personUnavailable")}
                  dash={t("dash")}
                  locale={i18n.language}
                  t={t}
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

function sortCollaborators(collaborators: Collaborator[], unavailableLabel: string) {
  return [...collaborators].sort((left, right) => {
    const displayComparison = collaboratorNameCollator.compare(
      personDisplayName(left, unavailableLabel),
      personDisplayName(right, unavailableLabel),
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

function CollaboratorCard({
  collaborator,
  unavailableLabel,
  dash,
  locale,
  t,
}: {
  collaborator: Collaborator;
  unavailableLabel: string;
  dash: string;
  locale: string;
  t: (key: string) => string;
}) {
  return (
    <Link to={`/collaborators/${collaborator.id}`} className="block p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-950">
            {personDisplayName(collaborator, unavailableLabel)}
          </h2>
          {personSecondaryLabel(collaborator) && (
            <p className="text-xs text-gray-500">
              {personSecondaryLabel(collaborator)}
            </p>
          )}
          <p className="text-sm text-gray-500">
            {collaborator.taskLabel || dash} · {" "}
            {collaborator.locationLabel || dash}
          </p>
        </div>
        <StatusBadge
          label={collaborator.statusLabel || collaborator.statusId}
        />
      </div>

      <div className="mt-4 grid gap-2 text-sm text-gray-700">
        <Info label={t("start")} value={formatDate(collaborator.journeyStartDate)} />
        <Info
          label={t("projectedEndShort")}
          value={formatDate(collaborator.projectedEndDate)}
        />
        <JourneyDaysRemaining
          projectedEndDate={collaborator.projectedEndDate}
          closedAt={collaborator.closedAt}
          className="text-right text-sm"
        />
        <Info label={t("payment")} value={formatMoney(collaborator.paymentValue, locale)} />
        <Info label={t("method")} value={collaborator.paymentMethodLabel || dash} />
      </div>
    </Link>
  );
}

function personDisplayName(collaborator: Collaborator, unavailableLabel: string) {
  return (
    collaborator.personNickname?.trim() ||
    collaborator.personName?.trim() ||
    unavailableLabel
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

function StatusBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
      {label}
    </span>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return "—";
  return value;
}

function formatMoney(value: number, locale: string) {
  return new Intl.NumberFormat(locale || "en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
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
