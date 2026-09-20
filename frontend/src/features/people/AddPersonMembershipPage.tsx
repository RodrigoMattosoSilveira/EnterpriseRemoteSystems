import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { useReferenceDataByType } from "../reference-data/useReferenceData";
import { useCreatePersonMembership, useGlobalPeopleSearch } from "./usePeople";
import { PageTitle } from "../../components/layout/PageHeading";
import { useI18n } from "../../i18n";
import { personStatusLabel } from "./personPresentation";

const SEARCH_DEBOUNCE_MS = 300;

export function AddPersonMembershipPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialSearch = searchParams.get("search") ?? "";
  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusId, setStatusId] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState("");

  const statusesQuery = useReferenceDataByType("person_status");
  const activeStatuses = useMemo(
    () => (statusesQuery.data ?? []).filter((row) => row.active),
    [statusesQuery.data],
  );
  const globalQuery = useGlobalPeopleSearch(debouncedSearch);
  const mutation = useCreatePersonMembership();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (statusId || activeStatuses.length === 0) return;
    const active = activeStatuses.find((row) => row.code === "ACTIVE") ?? activeStatuses[0];
    setStatusId(active.id);
  }, [activeStatuses, statusId]);

  const rows = globalQuery.data?.items ?? [];

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto max-w-4xl">
          <Link className="text-sm text-gray-500 underline" to="/people">
            {t("people.back")}
          </Link>
          <PageTitle className="mt-3">{t("people.membership.addExistingTitle")}</PageTitle>
          <p className="mt-1 text-sm text-gray-500">
            {t("people.membership.addExistingHelp")}
          </p>
        </div>
      </header>

      <section className="mx-auto max-w-4xl space-y-4 p-4">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <label className="grid gap-1 text-sm font-medium text-gray-700">
            {t("people.membership.findPerson")}
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setSelectedPersonId("");
              }}
              placeholder={t("people.membership.searchPlaceholder")}
              className="rounded-xl border border-gray-300 px-3 py-2 shadow-sm"
              autoFocus
            />
          </label>
          <p className="mt-2 text-xs text-gray-500">{t("people.membership.searchHelp")}</p>
        </div>

        {statusesQuery.error && <ApiErrorPanel error={statusesQuery.error} translate={t} />}
        {globalQuery.error && <ApiErrorPanel error={globalQuery.error} translate={t} />}
        {mutation.error && <ApiErrorPanel error={mutation.error} translate={t} />}

        {debouncedSearch.length >= 3 && globalQuery.isLoading && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">{t("common.searching")}</div>
        )}

        {debouncedSearch.length >= 3 && !globalQuery.isLoading && !globalQuery.error && rows.length === 0 && (
          <div className="rounded-2xl border bg-white p-5 text-sm text-gray-600 shadow-sm">
            {t("people.membership.noMatch")}
            <div className="mt-3"><Link className="font-semibold underline" to="/people/new">{t("people.createPerson")}</Link></div>
          </div>
        )}

        {rows.map((person) => {
          const selected = selectedPersonId === person.id;
          return (
            <section key={person.id} className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-950">{person.firstName} {person.lastName}</h2>
                  <p className="text-sm text-gray-500">{person.nickname}</p>
                  <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm md:grid-cols-2">
                    <div><dt className="inline font-medium">CPF: </dt><dd className="inline">{person.cpf}</dd></div>
                    <div><dt className="inline font-medium">RG: </dt><dd className="inline">{person.rg}</dd></div>
                    <div><dt className="inline font-medium">{t("common.cellular")}: </dt><dd className="inline">{person.cellular}</dd></div>
                    <div><dt className="inline font-medium">{t("common.email")}: </dt><dd className="inline">{person.email}</dd></div>
                  </dl>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPersonId(selected ? "" : person.id)}
                  className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white"
                >
                  {selected ? t("common.selected") : t("common.select")}
                </button>
              </div>

              {selected && (
                <div className="mt-5 grid gap-4 border-t pt-4">
                  <label className="grid gap-1 text-sm font-medium text-gray-700">
                    {t("people.membership.tenantStatus")}
                    <select
                      value={statusId}
                      onChange={(event) => setStatusId(event.target.value)}
                      className="rounded-xl border border-gray-300 px-3 py-2"
                    >
                      {activeStatuses.map((status) => (
                        <option key={status.id} value={status.id}>
                          {personStatusLabel(status.code, status.label, t)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-gray-700">
                    {t("people.membership.privateNotes")}
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      className="min-h-24 rounded-xl border border-gray-300 px-3 py-2"
                    />
                  </label>
                  <div>
                    <button
                      type="button"
                      disabled={!statusId || mutation.isPending}
                      onClick={async () => {
                        const created = await mutation.mutateAsync({ personId: person.id, statusId, notes });
                        navigate(`/people/${created.id}#authentication`, {
                          state: {
                            flash: t("people.membershipAdded", {
                              name: `${created.firstName} ${created.lastName}`,
                              instruction: t("people.authentication.configureTenant"),
                            }),
                          },
                        });
                      }}
                      className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {mutation.isPending ? t("people.adding") : t("people.addToTenant")}
                    </button>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </section>
    </main>
  );
}
