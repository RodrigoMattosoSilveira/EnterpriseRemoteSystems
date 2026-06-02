import { Link, useLocation } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import type { Collaborator } from "../../types/collaborators";
import { useCollaborators } from "./useCollaborators";

export function CollaboratorsListPage() {
  const { data, isLoading, error } = useCollaborators();
  const location = useLocation();
  const collaborators = data?.items ?? [];
  const total = data?.total ?? collaborators.length;
  const flash = readFlash(location.state);

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Operations
            </p>
            <h1 className="text-xl font-bold text-gray-950">Collaborators</h1>
            <p className="text-sm text-gray-500">
              Active work journeys created from complete Person profiles.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/people"
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
            >
              People
            </Link>
            <Link
              to="/collaborators/new"
              className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white shadow-sm"
            >
              Add
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">
                Collaborator Journeys
              </h2>
              <p className="text-sm text-gray-500">
                Showing {collaborators.length} of {total} collaborator records.
              </p>
            </div>
          </div>
        </section>

        {isLoading && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            Loading collaborators...
          </div>
        )}

        {!isLoading && !error && collaborators.length === 0 && (
          <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
            <h2 className="text-lg font-semibold">No collaborators yet</h2>
            <p className="mt-2 text-sm text-gray-500">
              Create a Collaborator after the related Person profile is complete.
            </p>
            <Link
              to="/collaborators/new"
              className="mt-5 inline-block rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white"
            >
              Create Collaborator
            </Link>
          </div>
        )}

        {!isLoading && collaborators.length > 0 && (
          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="hidden md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="p-3">Person</th>
                    <th className="p-3">Journey</th>
                    <th className="p-3">Work</th>
                    <th className="p-3">Payment</th>
                    <th className="p-3">Status</th>
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
                          {personDisplayName(collaborator)}
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
                          Projected end: {formatDate(collaborator.projectedEndDate)}
                        </div>
                      </td>
                      <td className="p-3 text-gray-700">
                        <div>{collaborator.taskLabel || "—"}</div>
                        <div className="text-xs text-gray-500">
                          {collaborator.sectorLabel || "—"} · {collaborator.locationLabel || "—"}
                        </div>
                      </td>
                      <td className="p-3 text-gray-700">
                        <div>{formatMoney(collaborator.paymentValue)}</div>
                        <div className="text-xs text-gray-500">
                          {collaborator.paymentMethodLabel || "—"}
                        </div>
                      </td>
                      <td className="p-3">
                        <StatusBadge label={collaborator.statusLabel || collaborator.statusId} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y md:hidden">
              {collaborators.map((collaborator) => (
                <CollaboratorCard key={collaborator.id} collaborator={collaborator} />
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function CollaboratorCard({ collaborator }: { collaborator: Collaborator }) {
  return (
    <Link to={`/collaborators/${collaborator.id}`} className="block p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-950">
            {personDisplayName(collaborator)}
          </h2>
          {personSecondaryLabel(collaborator) && (
            <p className="text-xs text-gray-500">
              {personSecondaryLabel(collaborator)}
            </p>
          )}
          <p className="text-sm text-gray-500">
            {collaborator.taskLabel || "—"} · {collaborator.locationLabel || "—"}
          </p>
        </div>
        <StatusBadge label={collaborator.statusLabel || collaborator.statusId} />
      </div>

      <div className="mt-4 grid gap-2 text-sm text-gray-700">
        <Info label="Start" value={formatDate(collaborator.journeyStartDate)} />
        <Info label="Projected End" value={formatDate(collaborator.projectedEndDate)} />
        <Info label="Payment" value={formatMoney(collaborator.paymentValue)} />
        <Info label="Method" value={collaborator.paymentMethodLabel || "—"} />
      </div>
    </Link>
  );
}

function personDisplayName(collaborator: Collaborator) {
  return (
    collaborator.personNickname?.trim() ||
    collaborator.personName?.trim() ||
    "Person unavailable"
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

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
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
