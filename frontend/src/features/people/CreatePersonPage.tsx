import { Link, useNavigate } from "react-router-dom";
import { PersonForm } from "./PersonForm";
import { useCreatePerson } from "./usePeople";
import { ApiError } from "../../api/client";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { useReferenceDataByType } from "../reference-data/useReferenceData";
import { PageTitle } from "../../components/layout/PageHeading";

const FALLBACK_ACTIVE_STATUS_ID = "ref-person-status-active";

export function CreatePersonPage() {
  const navigate = useNavigate();
  const mutation = useCreatePerson();
  const statusesQuery = useReferenceDataByType("person_status");
  const activeStatuses = (statusesQuery.data ?? []).filter((status) => status.active);
  const activeStatus =
    activeStatuses.find((status) => status.code === "ACTIVE") ?? activeStatuses[0];
  const defaultStatusId = activeStatus?.id ?? FALLBACK_ACTIVE_STATUS_ID;
  const statusOptions = activeStatuses.length > 0
    ? activeStatuses.map((status) => ({ value: status.id, label: status.label }))
    : undefined;

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto max-w-4xl">
          <Link className="text-sm text-gray-500 underline" to="/people">
            Back to People
          </Link>
          <PageTitle className="mt-3">
            New Person
          </PageTitle>
          <p className="text-sm text-gray-500">
            Create one global Person identity and its membership in the selected
            tenant. Complete the Personal section first; other sections can be
            filled later.
          </p>
        </div>
      </header>

      <section className="mx-auto max-w-4xl p-4">
        {mutation.error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
            <p className="font-semibold">{(mutation.error as Error).message}</p>

            <ApiErrorPanel error={mutation.error} />
          </div>
        )}

        <PersonForm
          defaultStatusId={defaultStatusId}
          statusOptions={statusOptions}
          submitting={mutation.isPending}
          onSubmit={async (input) => {
            const created = await mutation.mutateAsync(input);
            navigate("/people", {
              state: {
                flash: `Person record added: ${created.firstName} ${created.lastName}.`,
                createdPersonId: created.id,
                createdPerson: created,
              },
            });
          }}
        />
      </section>
    </main>
  );
}