import { Link, useLocation } from "react-router-dom";
import { usePeople } from "./usePeople";
import type { Person } from "../../types/people";

type PeopleListState = {
  flash: string;
  createdPersonId: string;
  createdPerson?: Person;
};

export function PeopleListPage() {
  const { data, isLoading, error } = usePeople();
  const location = useLocation();
  const people = Array.isArray(data) ? data : [];
  const listState = readPeopleListState(location.state);
  const displayedPeople = pinCreatedPerson(
    people,
    listState.createdPersonId,
    listState.createdPerson,
  );

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-950">People</h1>
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
            <Link
              to="/people/new"
              className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white shadow-sm"
            >
              Add
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

        {isLoading && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            Loading people...
          </div>
        )}

        {/* {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
            {(error as Error).message}
          </div>
        )} */}
        {error && (
          <pre className="rounded bg-red-50 p-4 text-xs text-red-800">
            {JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}
          </pre>
        )}

        {!isLoading && !error && displayedPeople.length === 0 && (
          <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
            <h2 className="text-lg font-semibold">No people yet</h2>
            <p className="mt-2 text-sm text-gray-500">
              Create the first Person record before creating collaborators.
            </p>
            <Link
              to="/people/new"
              className="mt-5 inline-block rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white"
            >
              Create Person
            </Link>
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
                        Just added
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    Nickname: {person.nickname || "—"}
                  </p>
                </div>

                <StatusBadge complete={person.canCreateCollaborator}>
                  {person.canCreateCollaborator ? "Complete" : "Incomplete"}
                </StatusBadge>
              </div>

              <div className="mt-4 grid gap-2 text-sm text-gray-700">
                <Info label="CPF" value={person.cpf} />
                <Info label="RG" value={person.rg} />
                <Info label="Cellular" value={person.cellular} />
                <Info label="Email" value={person.email} />
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
                        Missing {section}
                      </span>
                    ))}
                  </div>
                )}
            </Link>
          );
        })}
      </section>
    </main>
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
