import { useEffect, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { PersonForm } from "./PersonForm";
import { usePerson, useUpdatePerson } from "./usePeople";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { useAuthorizationContext } from "../../components/layout/AuthorizationContext";
import { useReferenceDataByType } from "../reference-data/useReferenceData";
import { PersonAuthenticationSection } from "./PersonAuthenticationSection";
import {
  useCollaboratorCandidates,
  useCollaboratorJourneysForMembership,
} from "../collaborators/useCollaborators";
import type { Collaborator } from "../../types/collaborators";
import { PageContextHeading, PageTitle } from "../../components/layout/PageHeading";
import { useI18n } from "../../i18n";
import { personStatusLabel } from "./personPresentation";

const FALLBACK_ACTIVE_STATUS_ID = "ref-person-status-active";

function personDetailFlash(state: unknown): string {
  if (!state || typeof state !== "object" || !("flash" in state)) return "";
  return typeof state.flash === "string" ? state.flash : "";
}

export function PersonDetailPage() {
  const { t, formatDate } = useI18n();
  const { id = "" } = useParams();
  const location = useLocation();
  const actor = useAuthorizationContext();
  const canBrowsePeople = actor.permissions.includes("*") || actor.permissions.includes("people.read");
  const canManageTenantAuthentication =
    actor.scope === "TENANT" && actor.roleCodes.includes("TENANT_ADMIN");
  const canCreateCollaboratorJourney =
    actor.scope === "TENANT" &&
    (actor.permissions.includes("*") ||
      actor.permissions.includes("collaborators.create"));
  const canBrowseCollaboratorJourneys =
    actor.scope === "TENANT" &&
    (actor.permissions.includes("*") ||
      actor.permissions.includes("collaborators.read"));
  const [successMessage, setSuccessMessage] = useState(() => personDetailFlash(location.state));

  const personQuery = usePerson(id);
  const collaboratorCandidatesQuery = useCollaboratorCandidates(
    canCreateCollaboratorJourney,
  );
  const membershipID = personQuery.data?.membershipId ?? "";
  const collaboratorJourneysQuery = useCollaboratorJourneysForMembership(
    membershipID,
    canBrowseCollaboratorJourneys,
  );
  const mutation = useUpdatePerson(id);
  const statusesQuery = useReferenceDataByType("person_status");
  useEffect(() => {
    if (
      !personQuery.data ||
      !canManageTenantAuthentication ||
      location.hash !== "#authentication"
    ) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const authenticationSection = document.getElementById("authentication");
      authenticationSection?.scrollIntoView({ block: "start" });
      authenticationSection?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [canManageTenantAuthentication, location.hash, personQuery.data]);

  const [searchParams] = useSearchParams();
  const view = searchParams.get("view") || "cards";

  if (personQuery.isLoading) {
    return <main className="p-4">{t("people.loading")}</main>;
  }

  if (personQuery.error) {
    return (
      <main className="p-4 text-red-700">
        {(personQuery.error as Error).message}
      </main>
    );
  }

  if (!personQuery.data) {
    return <main className="p-4">{t("people.notFound")}</main>;
  }

  const activeStatuses = (statusesQuery.data ?? []).filter((status) => status.active);
  const statusOptions = activeStatuses.length > 0
    ? activeStatuses.map((status) => ({ value: status.id, label: personStatusLabel(status.code, status.label, t) }))
    : undefined;
  const defaultStatusId =
    activeStatuses.find((status) => status.code === "ACTIVE")?.id ??
    personQuery.data.statusId ??
    FALLBACK_ACTIVE_STATUS_ID;
  const collaboratorCandidates = Array.isArray(collaboratorCandidatesQuery.data)
    ? collaboratorCandidatesQuery.data
    : [];
  const collaboratorJourneys = sortCollaboratorJourneys(
    collaboratorJourneysQuery.data ?? [],
  );
  const currentCollaborator = collaboratorJourneys.find(
    (collaborator) => !collaborator.closedAt,
  );
  const canStartCollaboratorJourney =
    !currentCollaborator &&
    canCreateCollaboratorJourney &&
    collaboratorCandidates.some((person) => person.id === personQuery.data.id);

  return (
    <main className="mx-auto max-w-3xl p-4">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto max-w-4xl">
          {canBrowsePeople ? (
            <Link className="text-sm text-gray-500 underline" to={`/people?view=${view}`}>
              {t("people.back")}
            </Link>
          ) : actor.collaboratorId ? (
            <Link className="text-sm text-gray-500 underline" to={`/collaborators/${actor.collaboratorId}`}>
              {t("people.myCollaborator")}
            </Link>
          ) : null}

          <div className="mt-3 flex items-start justify-between gap-3">
            <div>
              <PageTitle>{t("people.personTitle")}</PageTitle>
              <PageContextHeading>
                {personQuery.data.firstName} {personQuery.data.lastName}
              </PageContextHeading>
              <p className="mt-1 text-sm text-gray-500">
                {personQuery.data.nickname}
              </p>
              {personQuery.data.membershipId && (
                <p className="mt-1 text-xs text-gray-500">
                  {t("people.membershipId")}: <span className="font-mono">{personQuery.data.membershipId}</span>
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {canStartCollaboratorJourney && (
                <Link
                  to={`/collaborators/new?personId=${encodeURIComponent(personQuery.data.id)}`}
                  className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white shadow-sm"
                >
                  {t("people.createCollaborator")}
                </Link>
              )}
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  personQuery.data.canCreateCollaborator
                    ? "bg-green-100 text-green-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {personQuery.data.canCreateCollaborator ? t("common.complete") : t("common.incomplete")}
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

            <ApiErrorPanel error={mutation.error} translate={t} />
          </div>
        )}

        <PersonForm
          initial={personQuery.data}
          currentCollaboratorId={currentCollaborator?.id}
          defaultStatusId={defaultStatusId}
          statusOptions={statusOptions}
          submitting={mutation.isPending}
          onSubmit={async (input) => {
            setSuccessMessage("");
            await mutation.mutateAsync(input);
            setSuccessMessage(t("people.updated"));
          }}
        />
      </section>

      {canBrowseCollaboratorJourneys && membershipID && (
        <section className="mx-auto max-w-4xl px-4 pb-4">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div>
              <h2
                id="person-journey-history-title"
                className="text-lg font-semibold text-gray-950"
              >
                {t("people.journeyHistory.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {t("people.journeyHistory.description")}
              </p>
            </div>

            <ApiErrorPanel error={collaboratorJourneysQuery.error} translate={t} />

            {collaboratorJourneysQuery.isLoading && (
              <p className="mt-4 text-sm text-gray-600">
                {t("people.journeyHistory.loading")}
              </p>
            )}

            {!collaboratorJourneysQuery.isLoading &&
              !collaboratorJourneysQuery.error &&
              collaboratorJourneys.length === 0 && (
                <p className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
                  {t("people.journeyHistory.empty")}
                </p>
              )}

            {!collaboratorJourneysQuery.isLoading &&
              collaboratorJourneys.length > 0 && (
                <div className="mt-4 space-y-3" aria-labelledby="person-journey-history-title">
                  {collaboratorJourneys.map((journey) => {
                    const closed = Boolean(journey.closedAt);
                    return (
                      <article
                        key={journey.id}
                        className="rounded-xl border border-gray-200 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-gray-950">
                              {t("people.journeyHistory.started", {
                                date: formatDate(journey.journeyStartDate),
                              })}
                            </p>
                            <p className="mt-1 text-sm text-gray-500">
                              {closed
                                ? t("people.journeyHistory.closedOn", {
                                    date: formatDate(journey.closedAt!),
                                  })
                                : t("people.journeyHistory.projectedEnd", {
                                    date: formatDate(journey.projectedEndDate),
                                  })}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              closed
                                ? "bg-gray-100 text-gray-700"
                                : "bg-green-100 text-green-800"
                            }`}
                          >
                            {closed
                              ? t("collaborators.closed")
                              : t("people.journeyHistory.current")}
                          </span>
                        </div>

                        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                              {t("people.journeyHistory.workAssignment")}
                            </dt>
                            <dd className="mt-1 text-gray-800">
                              {journey.taskLabel || "—"}
                              <span className="block text-xs text-gray-500">
                                {[journey.sectorLabel, journey.locationLabel]
                                  .filter(Boolean)
                                  .join(" · ") || "—"}
                              </span>
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                              {t("people.journeyHistory.compensation")}
                            </dt>
                            <dd className="mt-1 text-gray-800">
                              {journey.paymentMethodLabel || journey.paymentMethodId || "—"}
                            </dd>
                          </div>
                        </dl>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                          <span className="break-all font-mono text-xs text-gray-500">
                            {t("common.journeyId")}: {journey.id}
                          </span>
                          <Link
                            to={`/collaborators/${encodeURIComponent(journey.id)}`}
                            className="text-sm font-semibold text-gray-950 underline underline-offset-2"
                          >
                            {t("people.journeyHistory.openJourney")}
                          </Link>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
          </div>
        </section>
      )}

      {canManageTenantAuthentication && (
        <PersonAuthenticationSection personId={personQuery.data.id} />
      )}
    </main>
  );
}

function sortCollaboratorJourneys(journeys: Collaborator[]) {
  return [...journeys].sort((left, right) => {
    const startComparison = right.journeyStartDate.localeCompare(left.journeyStartDate);
    if (startComparison !== 0) return startComparison;
    return right.createdAt.localeCompare(left.createdAt);
  });
}
