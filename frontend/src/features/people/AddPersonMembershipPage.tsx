import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { useReferenceDataByType } from "../reference-data/useReferenceData";
import { useCreatePersonMembership, useGlobalPeopleSearch } from "./usePeople";
import { PageTitle } from "../../components/layout/PageHeading";

const SEARCH_DEBOUNCE_MS = 300;

export function AddPersonMembershipPage() {
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
            Back to People
          </Link>
          <PageTitle className="mt-3">Add existing Person</PageTitle>
          <p className="mt-1 text-sm text-gray-500">
            Search the global Person directory, then create a membership in the selected tenant.
            Other tenant relationships are never shown.
          </p>
        </div>
      </header>

      <section className="mx-auto max-w-4xl space-y-4 p-4">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <label className="grid gap-1 text-sm font-medium text-gray-700">
            Find Person
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setSelectedPersonId("");
              }}
              placeholder="Name, nickname, CPF, RG, cellular, or email"
              className="rounded-xl border border-gray-300 px-3 py-2 shadow-sm"
              autoFocus
            />
          </label>
          <p className="mt-2 text-xs text-gray-500">Enter at least 3 characters. An unfiltered global directory is not available.</p>
        </div>

        {statusesQuery.error && <ApiErrorPanel error={statusesQuery.error} />}
        {globalQuery.error && <ApiErrorPanel error={globalQuery.error} />}
        {mutation.error && <ApiErrorPanel error={mutation.error} />}

        {debouncedSearch.length >= 3 && globalQuery.isLoading && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">Searching...</div>
        )}

        {debouncedSearch.length >= 3 && !globalQuery.isLoading && !globalQuery.error && rows.length === 0 && (
          <div className="rounded-2xl border bg-white p-5 text-sm text-gray-600 shadow-sm">
            No global Person outside this tenant matches the search. If this is a new human, create a new Person instead.
            <div className="mt-3"><Link className="font-semibold underline" to="/people/new">Create new Person</Link></div>
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
                    <div><dt className="inline font-medium">Cellular: </dt><dd className="inline">{person.cellular}</dd></div>
                    <div><dt className="inline font-medium">Email: </dt><dd className="inline">{person.email}</dd></div>
                  </dl>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPersonId(selected ? "" : person.id)}
                  className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white"
                >
                  {selected ? "Selected" : "Select"}
                </button>
              </div>

              {selected && (
                <div className="mt-5 grid gap-4 border-t pt-4">
                  <label className="grid gap-1 text-sm font-medium text-gray-700">
                    Tenant status
                    <select
                      value={statusId}
                      onChange={(event) => setStatusId(event.target.value)}
                      className="rounded-xl border border-gray-300 px-3 py-2"
                    >
                      {activeStatuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-gray-700">
                    Tenant-private notes
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
                        navigate("/people", {
                          state: {
                            flash: `Person membership added: ${created.firstName} ${created.lastName}.`,
                            createdPersonId: created.id,
                            createdPerson: created,
                          },
                        });
                      }}
                      className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {mutation.isPending ? "Adding..." : "Add to this tenant"}
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
