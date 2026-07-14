import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PersonForm } from "./PersonForm";
import { useCreatePerson } from "./usePeople";
import { ApiError } from "../../api/client";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";

const ACTIVE_STATUS_ID = "ref-person-status-active";

export function CreatePersonPage() {
  const { t } = useTranslation("people");
  const navigate = useNavigate();
  const mutation = useCreatePerson();

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto max-w-4xl">
          <Link className="text-sm text-gray-500 underline" to="/people">
            {t("backToPeople")}
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-gray-950">
            {t("createPersonPageTitle")}
          </h1>
          <p className="text-sm text-gray-500">
            {t("createPersonPageDescription")}
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
          defaultStatusId={ACTIVE_STATUS_ID}
          submitting={mutation.isPending}
          onSubmit={async (input) => {
            const created = await mutation.mutateAsync(input);
            navigate("/people", {
              state: {
                flash: t("personCreatedFlash", {
                  firstName: created.firstName,
                  lastName: created.lastName,
                }),
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