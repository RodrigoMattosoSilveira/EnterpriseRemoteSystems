import { Link, useParams } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import type { Collaborator } from "../../types/collaborators";
import { JourneySettlementPanel } from "./JourneySettlementPanel";
import { useCollaborator } from "./useCollaborators";

export function CollaboratorDetailPage() {
  const { id = "" } = useParams();
  const { data: collaborator, isLoading, error } = useCollaborator(id);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <section className="mx-auto max-w-5xl rounded-2xl border bg-white p-5 shadow-sm">
          Loading collaborator...
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <section className="mx-auto max-w-5xl">
          <Link
            className="text-sm font-semibold text-gray-600 underline"
            to="/collaborators"
          >
            Back to Collaborators
          </Link>
          <div className="mt-4">
            <ApiErrorPanel error={error} />
          </div>
        </section>
      </main>
    );
  }

  if (!collaborator) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <section className="mx-auto max-w-5xl rounded-2xl border bg-white p-5 shadow-sm">
          <Link
            className="text-sm font-semibold text-gray-600 underline"
            to="/collaborators"
          >
            Back to Collaborators
          </Link>
          <p className="mt-4 text-gray-700">Collaborator not found.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto max-w-5xl">
          <Link
            className="text-sm font-semibold text-gray-600 underline"
            to="/collaborators"
          >
            Back to Collaborators
          </Link>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Collaborator Journey
              </p>
              <h1 className="text-2xl font-bold text-gray-950">
                {displayPersonName(collaborator)}
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Started {formatDate(collaborator.journeyStartDate)} · Projected
                end {formatDate(collaborator.projectedEndDate)}
              </p>
            </div>

            <StatusBadge collaborator={collaborator} />
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-5xl gap-4 p-4 lg:grid-cols-[1fr_1fr]">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">
                Person Summary
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                The Person profile behind this Collaborator journey.
              </p>
            </div>
            <Link
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm"
              to={`/people/${collaborator.personId}`}
            >
              View Person
            </Link>
          </div>

          <dl className="mt-5 grid gap-3 text-sm">
            <Info label="Nickname" value={personDisplayName(collaborator)} />
            <Info label="Legal Name" value={personLegalName(collaborator)} />
            <Info label="Person ID" value={collaborator.personId} />
          </dl>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">Lifecycle</h2>
          <p className="mt-1 text-sm text-gray-500">
            Current journey timing and status.
          </p>

          <dl className="mt-5 grid gap-3 text-sm">
            <Info
              label="Status"
              value={collaborator.statusLabel || collaborator.statusId}
            />
            <Info
              label="Journey Start"
              value={formatDate(collaborator.journeyStartDate)}
            />
            <Info
              label="Default End"
              value={formatDate(collaborator.defaultEndDate)}
            />
            <Info
              label="Extension Days"
              value={String(collaborator.extensionDays)}
            />
            <Info
              label="Projected End"
              value={formatDate(collaborator.projectedEndDate)}
            />
            <Info label="Closed At" value={formatDate(collaborator.closedAt)} />
          </dl>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">
            Work Assignment
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Operational placement for this Collaborator.
          </p>

          <dl className="mt-5 grid gap-3 text-sm">
            <Info
              label="Sector"
              value={collaborator.sectorLabel || collaborator.sectorId}
            />
            <Info
              label="Location"
              value={collaborator.locationLabel || collaborator.locationId}
            />
            <Info
              label="Task"
              value={collaborator.taskLabel || collaborator.taskId}
            />
          </dl>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">Payment</h2>
          <p className="mt-1 text-sm text-gray-500">
            Default payment method and value for this journey.
          </p>

          <dl className="mt-5 grid gap-3 text-sm">
            <Info
              label="Method"
              value={
                collaborator.paymentMethodLabel || collaborator.paymentMethodId
              }
            />
            <Info
              label="Value"
              value={formatMoney(collaborator.paymentValue)}
            />
          </dl>
        </section>

        <JourneySettlementPanel collaboratorId={collaborator.id} />

        <section className="rounded-2xl border bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-950">Notes</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">
            {collaborator.notes?.trim() || "No notes recorded."}
          </p>
        </section>
      </section>
    </main>
  );
}

function StatusBadge({ collaborator }: { collaborator: Collaborator }) {
  const closed = Boolean(collaborator.closedAt);
  const label = closed
    ? "Closed"
    : collaborator.statusLabel || collaborator.statusId;

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
        closed ? "bg-gray-100 text-gray-700" : "bg-green-100 text-green-800"
      }`}
    >
      {label}
    </span>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-xl bg-gray-50 p-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-950">{value || "—"}</dd>
    </div>
  );
}

function displayPersonName(collaborator: Collaborator) {
  return personDisplayName(collaborator);
}

function personDisplayName(collaborator: Collaborator) {
  return (
    collaborator.personNickname?.trim() ||
    collaborator.personName?.trim() ||
    "Person unavailable"
  );
}

function personLegalName(collaborator: Collaborator) {
  return collaborator.personName?.trim() || "—";
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
