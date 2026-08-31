import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { PersonForm } from "./PersonForm";
import { usePerson, useUpdatePerson } from "./usePeople";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { useAuthorizationContext } from "../../components/layout/AuthorizationContext";
import { useReferenceDataByType } from "../reference-data/useReferenceData";
import { PersonAuthenticationSection } from "./PersonAuthenticationSection";
import { useCollaboratorCandidates } from "../collaborators/useCollaborators";
import { PageContextHeading, PageTitle } from "../../components/layout/PageHeading";

const FALLBACK_ACTIVE_STATUS_ID = "ref-person-status-active";

export function PersonDetailPage() {
  const { id = "" } = useParams();
  const actor = useAuthorizationContext();
  const canBrowsePeople = actor.permissions.includes("*") || actor.permissions.includes("people.read");
  const canManageTenantAuthentication =
    actor.scope === "TENANT" && actor.roleCodes.includes("TENANT_ADMIN");
  const canCreateCollaboratorJourney =
    actor.scope === "TENANT" &&
    (actor.permissions.includes("*") ||
      actor.permissions.includes("collaborators.create"));
  const [successMessage, setSuccessMessage] = useState("");

  const personQuery = usePerson(id);
  const collaboratorCandidatesQuery = useCollaboratorCandidates(
    canCreateCollaboratorJourney,
  );
  const mutation = useUpdatePerson(id);
  const statusesQuery = useReferenceDataByType("person_status");

  const [searchParams] = useSearchParams();
  const view = searchParams.get("view") || "cards";

  if (personQuery.isLoading) {
    return <main className="p-4">Loading person...</main>;
  }

  if (personQuery.error) {
    return (
      <main className="p-4 text-red-700">
        {(personQuery.error as Error).message}
      </main>
    );
  }

  if (!personQuery.data) {
    return <main className="p-4">Person not found.</main>;
  }

  const activeStatuses = (statusesQuery.data ?? []).filter((status) => status.active);
  const statusOptions = activeStatuses.length > 0
    ? activeStatuses.map((status) => ({ value: status.id, label: status.label }))
    : undefined;
  const defaultStatusId =
    activeStatuses.find((status) => status.code === "ACTIVE")?.id ??
    personQuery.data.statusId ??
    FALLBACK_ACTIVE_STATUS_ID;
  const collaboratorCandidates = Array.isArray(collaboratorCandidatesQuery.data)
    ? collaboratorCandidatesQuery.data
    : [];
  const canStartCollaboratorJourney =
    canCreateCollaboratorJourney &&
    collaboratorCandidates.some((person) => person.id === personQuery.data.id);

  return (
    <main className="mx-auto max-w-3xl p-4">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto max-w-4xl">
          {canBrowsePeople ? (
            <Link className="text-sm text-gray-500 underline" to={`/people?view=${view}`}>
              Back to People
            </Link>
          ) : actor.collaboratorId ? (
            <Link className="text-sm text-gray-500 underline" to={`/collaborators/${actor.collaboratorId}`}>
              My Collaborator record
            </Link>
          ) : null}

          <div className="mt-3 flex items-start justify-between gap-3">
            <div>
              <PageTitle>Person</PageTitle>
              <PageContextHeading>
                {personQuery.data.firstName} {personQuery.data.lastName}
              </PageContextHeading>
              <p className="mt-1 text-sm text-gray-500">
                {personQuery.data.nickname}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {canStartCollaboratorJourney && (
                <Link
                  to={`/collaborators/new?personId=${encodeURIComponent(personQuery.data.id)}`}
                  className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white shadow-sm"
                >
                  Create Collaborator
                </Link>
              )}
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  personQuery.data.canCreateCollaborator
                    ? "bg-green-100 text-green-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {personQuery.data.canCreateCollaborator ? "Complete" : "Incomplete"}
              </span>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-4xl p-4">
        {successMessage && (
          <div
            className="mb-4 rounded border border-green-300 bg-green-50 p-3 text-green-800"
            role="status"
          >
            {successMessage}
          </div>
        )}

        {mutation.error && (
          <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-red-700">
            <p className="font-semibold">{(mutation.error as Error).message}</p>

            <ApiErrorPanel error={mutation.error} />
          </div>
        )}

        <PersonForm
          initial={personQuery.data}
          defaultStatusId={defaultStatusId}
          statusOptions={statusOptions}
          submitting={mutation.isPending}
          onSubmit={async (input) => {
            setSuccessMessage("");
            await mutation.mutateAsync(input);
            setSuccessMessage("Person updated successfully.");
          }}
        />
      </section>

      {canManageTenantAuthentication && (
        <PersonAuthenticationSection personId={personQuery.data.id} />
      )}
    </main>
  );
}
