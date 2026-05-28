import { Link, useNavigate, useParams } from "react-router-dom";
import { PersonForm } from "./PersonForm";
import { usePerson, useUpdatePerson } from "./usePeople";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";

const ACTIVE_STATUS_ID = "ref-person-status-active";

export function PersonDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const personQuery = usePerson(id);
  const mutation = useUpdatePerson(id);

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

  return (
    <main className="mx-auto max-w-3xl p-4">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto max-w-4xl">
          <Link className="text-sm text-gray-500 underline" to="/people">
            Back to People
          </Link>

          <div className="mt-3 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-950">
                {personQuery.data.firstName} {personQuery.data.lastName}
              </h1>
              <p className="text-sm text-gray-500">
                {personQuery.data.nickname}
              </p>
            </div>

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
      </header>
    <section className="mx-auto max-w-4xl p-4">
      {/* mutation error + PersonForm */}
        {mutation.error && (
          <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-red-700">
            <p className="font-semibold">{(mutation.error as Error).message}</p>

            <ApiErrorPanel error={mutation.error} />
          </div>
        )}

        <PersonForm
          initial={personQuery.data}
          defaultStatusId={ACTIVE_STATUS_ID}
          submitting={mutation.isPending}
          onSubmit={async (input) => {
            try {
              await mutation.mutateAsync(input);
              navigate("/people", {
                state: { flash: "Person updated successfully." },
              });
            } catch {
              // The mutation state renders the API error above the form.
            }
          }}
        />
      </section>
    </main>
  );
}