import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { JourneyDaysRemaining } from "../../components/JourneyDaysRemaining";
import { useAuthorizationContext } from "../../components/layout/AuthorizationContext";
import type {
  Collaborator,
  UpdateCollaboratorInput,
  UpdateCollaboratorWorkAssignmentInput,
} from "../../types/collaborators";
import type { ReferenceDataItem } from "../../types/referenceData";
import { useReferenceDataByType } from "../reference-data/useReferenceData";
import { JourneySettlementPanel } from "./JourneySettlementPanel";
import {
  formatCollaboratorPaymentValue,
  normalizePaymentMethodCode,
  paymentValueInputConfig,
  validatePaymentValueInput,
} from "./paymentValue";
import {
  useCollaborator,
  useUpdateCollaborator,
  useUpdateCollaboratorWorkAssignment,
} from "./useCollaborators";
import { useSettlementPreview } from "./useSettlements";
import { PageContextHeading, PageTitle } from "../../components/layout/PageHeading";
import { translateEnglish, type Translate, useI18n } from "../../i18n";

export function CollaboratorDetailPage() {
  const { t, formatDate, formatCurrency } = useI18n();
  const { id = "" } = useParams();
  const actor = useAuthorizationContext();
  const wildcard = actor.permissions.includes("*");
  const canBrowseCollaborators = wildcard || actor.permissions.includes("collaborators.read");
  const canEditCollaborator = wildcard || actor.permissions.includes("collaborators.update");
  const canEditWorkAssignment =
    canEditCollaborator ||
    actor.permissions.includes("collaborators.work_assignment.update");
  const canPreviewSettlement = wildcard || actor.permissions.includes("journey.settlements.preview");
  const canReadCurrentAccount =
    wildcard ||
    actor.permissions.includes("current_accounts.summary.read") ||
    (actor.permissions.includes("current_accounts.self.summary.read") && actor.collaboratorId === id);
  const { data: collaborator, isLoading, error } = useCollaborator(
    id,
    !canBrowseCollaborators,
  );
  const [editMode, setEditMode] = useState<"full" | "work-assignment" | null>(null);
  const [flash, setFlash] = useState("");
  const [journeyCloseNotice, setJourneyCloseNotice] = useState("");

  if (isLoading) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <section className="mx-auto max-w-5xl rounded-2xl border bg-white p-5 shadow-sm">
          {t("collaborator.loading")}
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
            {canBrowseCollaborators ? t("collaborator.back") : t("collaborator.backMy")}
          </Link>
          <div className="mt-4">
            <ApiErrorPanel error={error} translate={t} />
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
            {canBrowseCollaborators ? t("collaborator.back") : t("collaborator.backMy")}
          </Link>
          <p className="mt-4 text-gray-700">{t("collaborator.notFound")}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {journeyCloseNotice ? (
        <JourneyCloseSuccessDialog
          message={journeyCloseNotice}
          onDismiss={() => setJourneyCloseNotice("")}
        />
      ) : null}
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto max-w-5xl">
          <Link
            className="text-sm font-semibold text-gray-600 underline"
            to="/collaborators"
          >
            {canBrowseCollaborators ? t("collaborator.back") : t("collaborator.backMy")}
          </Link>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <PageTitle>
                {t("collaborator.journeyTitle")}
              </PageTitle>
              <PageContextHeading>
                {displayPersonName(collaborator)}
              </PageContextHeading>
              <p className="mt-1 text-sm text-gray-600">
                <span className="font-semibold">{t("collaborator.journeyId")}:</span>{" "}
                <span className="break-all font-mono">{collaborator.id}</span>
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {t("collaborator.startedProjected", { start: formatDate(collaborator.journeyStartDate), end: formatDate(collaborator.projectedEndDate) })}
              </p>
              {collaborator.closedAt ? (
                <div
                  role="status"
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-900"
                >
                  <span>{t("collaborator.journeyClosed")}</span>
                  <span className="font-medium text-gray-600">
                    {formatDate(collaborator.closedAt)}
                  </span>
                </div>
              ) : (
                <JourneyDaysRemaining
                  projectedEndDate={collaborator.projectedEndDate}
                  className="mt-1 block text-sm"
                />
              )}
            </div>

            <div className="flex flex-col items-start gap-3 sm:items-end">
              <StatusBadge collaborator={collaborator} />
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {canReadCurrentAccount ? (
                  <Link
                    className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
                    to={`/collaborators/${collaborator.id}/current-account`}
                  >
                    {t("collaborator.currentAccount")}
                  </Link>
                ) : null}
                {canEditCollaborator ? (
                  <button
                    type="button"
                    className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
                    onClick={() => {
                      setFlash("");
                      setEditMode("full");
                    }}
                  >
                    {t("collaborator.edit")}
                  </button>
                ) : canEditWorkAssignment ? (
                  <button
                    type="button"
                    className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
                    onClick={() => {
                      setFlash("");
                      setEditMode("work-assignment");
                    }}
                  >
                    {t("collaborator.editAssignment")}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-5xl gap-4 p-4 lg:grid-cols-[1fr_1fr]">
        {flash && (
          <div
            role="status"
            className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-900 lg:col-span-2"
          >
            {flash}
          </div>
        )}

        {editMode === "full" && (
          <CollaboratorEditPanel
            collaborator={collaborator}
            onCancel={() => setEditMode(null)}
            onSaved={(updated) => {
              setEditMode(null);
              setFlash(
                t("collaborator.updated", { name: displayPersonName(updated) }),
              );
            }}
          />
        )}

        {editMode === "work-assignment" && (
          <CollaboratorWorkAssignmentEditPanel
            collaborator={collaborator}
            onCancel={() => setEditMode(null)}
            onSaved={(updated) => {
              setEditMode(null);
              setFlash(
                t("collaborator.assignmentUpdated", { name: displayPersonName(updated) }),
              );
            }}
          />
        )}

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">
                {t("collaborator.personSummary")}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {t("collaborator.personSummaryHelp2")}
              </p>
            </div>
            <Link
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm"
              to={`/people/${collaborator.personId}`}
            >
              {t("collaborator.viewPerson")}
            </Link>
          </div>

          <dl className="mt-5 grid gap-3 text-sm">
            <Info label={t("common.nickname")} value={personDisplayName(collaborator, t)} />
            <Info label={t("collaborator.legalName")} value={personLegalName(collaborator)} />
            <Info label={t("collaborator.personId")} value={collaborator.personId} />
            <Info label={t("collaborator.membershipId")} value={collaborator.membershipId} />
            {collaborator.legacyPersonId && (
              <Info label={t("collaborator.legacyPersonId")} value={collaborator.legacyPersonId} />
            )}
          </dl>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">{t("collaborator.lifecycle")}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {t("collaborator.lifecycleHelp")}
          </p>

          <dl className="mt-5 grid gap-3 text-sm">
            <Info
              label={t("collaborator.status")}
              value={collaborator.statusLabel || collaborator.statusId}
            />
            <Info
              label={t("collaborator.availabilityShort")}
              value={planningAvailabilityLabel(
                collaborator.planningAvailability,
                t,
              )}
            />
            <Info
              label={t("collaborator.journeyStart")}
              value={formatDate(collaborator.journeyStartDate)}
            />
            <Info
              label={t("collaborator.defaultEnd")}
              value={formatDate(collaborator.defaultEndDate)}
            />
            <Info
              label={t("collaborator.extensionDays")}
              value={String(collaborator.extensionDays)}
            />
            <Info
              label={t("collaborator.projectedEnd")}
              value={formatDate(collaborator.projectedEndDate)}
            />
            <Info label={t("collaborator.closedAt")} value={collaborator.closedAt ? formatDate(collaborator.closedAt) : "—"} />
          </dl>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">
            {t("collaborator.workAssignment")}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {t("collaborator.workAssignmentHelp2")}
          </p>

          <dl className="mt-5 grid gap-3 text-sm">
            <Info
              label={t("collaborator.sector")}
              value={collaborator.sectorLabel || collaborator.sectorId}
            />
            <Info
              label={t("collaborator.location")}
              value={collaborator.locationLabel || collaborator.locationId}
            />
            <Info
              label={t("collaborator.task")}
              value={collaborator.taskLabel || collaborator.taskId}
            />
          </dl>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">{t("collaborator.payment")}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {t("collaborator.paymentHelp2")}
          </p>

          <dl className="mt-5 grid gap-3 text-sm">
            <Info
              label={t("collaborator.method")}
              value={
                collaborator.paymentMethodLabel || collaborator.paymentMethodId
              }
            />
            <Info
              label={t("collaborator.value")}
              value={formatCollaboratorPaymentValue(collaborator, formatCurrency)}
            />
          </dl>
        </section>

        {canPreviewSettlement && !collaborator.closedAt ? (
          <JourneySettlementPanel
            collaboratorId={collaborator.id}
            projectedEndDate={collaborator.projectedEndDate}
            onJourneyClosed={setJourneyCloseNotice}
          />
        ) : null}

        <CollaboratorNotes
          collaborator={collaborator}
          canRefreshGoldBalance={canPreviewSettlement && !collaborator.closedAt}
        />
      </section>
    </main>
  );
}

type WorkAssignmentEditFormState = {
  sectorId: string;
  locationId: string;
  taskId: string;
};

function CollaboratorWorkAssignmentEditPanel({
  collaborator,
  onCancel,
  onSaved,
}: {
  collaborator: Collaborator;
  onCancel: () => void;
  onSaved: (collaborator: Collaborator) => void;
}) {
  const { t } = useI18n();
  const sectorsQuery = useReferenceDataByType("sector");
  const locationsQuery = useReferenceDataByType("location");
  const tasksQuery = useReferenceDataByType("task");
  const updateMutation = useUpdateCollaboratorWorkAssignment(collaborator.id);
  const [form, setForm] = useState<WorkAssignmentEditFormState>({
    sectorId: collaborator.sectorId,
    locationId: collaborator.locationId,
    taskId: collaborator.taskId,
  });
  const [clientError, setClientError] = useState("");

  const isLoading =
    sectorsQuery.isLoading || locationsQuery.isLoading || tasksQuery.isLoading;
  const loadError =
    sectorsQuery.error || locationsQuery.error || tasksQuery.error;

  const sectorOptions = activeOptionsWithCurrent(
    sectorsQuery.data,
    collaborator.sectorId,
    collaborator.sectorLabel,
  );
  const locationOptions = activeOptionsWithCurrent(
    locationsQuery.data,
    collaborator.locationId,
    collaborator.locationLabel,
  );
  const taskOptions = activeOptionsWithCurrent(
    tasksQuery.data,
    collaborator.taskId,
    collaborator.taskLabel,
  );

  function update<K extends keyof WorkAssignmentEditFormState>(
    key: K,
    value: WorkAssignmentEditFormState[K],
  ) {
    setClientError("");
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.sectorId || !form.locationId || !form.taskId) {
      setClientError(t("collaborator.validation.workAssignmentRequired"));
      return;
    }

    const input: UpdateCollaboratorWorkAssignmentInput = {
      sectorId: form.sectorId,
      locationId: form.locationId,
      taskId: form.taskId,
    };

    try {
      const updated = await updateMutation.mutateAsync(input);
      onSaved(updated);
    } catch {
      // The mutation state renders API validation errors below.
    }
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm lg:col-span-2">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">
            {t("collaborator.editAssignment")}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {t("collaborator.editAssignmentHelp")}
          </p>
        </div>
        <button
          type="button"
          className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
          onClick={onCancel}
        >
          {t("common.cancelEdit")}
        </button>
      </div>

      {isLoading && (
        <p className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
          {t("collaborator.loadingEditable")}
        </p>
      )}

      <ApiErrorPanel error={loadError} translate={t} />
      <ApiErrorPanel error={updateMutation.error} translate={t} />

      {clientError && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
          {clientError}
        </div>
      )}

      {!isLoading && !loadError && (
        <form onSubmit={submit} className="mt-5 space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Select
              label={t("collaborator.sector")}
              required
              value={form.sectorId}
              onChange={(value) => update("sectorId", value)}
              options={sectorOptions}
              placeholder={t("collaborator.selectSector")}
            />
            <Select
              label={t("collaborator.location")}
              required
              value={form.locationId}
              onChange={(value) => update("locationId", value)}
              options={locationOptions}
              placeholder={t("collaborator.selectLocation")}
            />
            <Select
              label={t("collaborator.task")}
              required
              value={form.taskId}
              onChange={(value) => update("taskId", value)}
              options={taskOptions}
              placeholder={t("collaborator.selectTask")}
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm"
              onClick={onCancel}
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {updateMutation.isPending ? t("common.saving") : t("collaborator.saveAssignment")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

type EditFormState = {
  planningAvailability: string;
  sectorId: string;
  locationId: string;
  taskId: string;
  paymentMethodId: string;
  paymentValue: string;
  extensionDays: string;
};

function CollaboratorEditPanel({
  collaborator,
  onCancel,
  onSaved,
}: {
  collaborator: Collaborator;
  onCancel: () => void;
  onSaved: (collaborator: Collaborator) => void;
}) {
  const { t } = useI18n();
  const paymentMethodsQuery = useReferenceDataByType("method");
  const sectorsQuery = useReferenceDataByType("sector");
  const locationsQuery = useReferenceDataByType("location");
  const tasksQuery = useReferenceDataByType("task");
  const updateMutation = useUpdateCollaborator(collaborator.id);

  const [form, setForm] = useState<EditFormState>(() =>
    editFormFromCollaborator(collaborator),
  );
  const [clientError, setClientError] = useState("");

  const isLoading =
    paymentMethodsQuery.isLoading ||
    sectorsQuery.isLoading ||
    locationsQuery.isLoading ||
    tasksQuery.isLoading;
  const loadError =
    paymentMethodsQuery.error ||
    sectorsQuery.error ||
    locationsQuery.error ||
    tasksQuery.error;

  const paymentMethodOptions = activeOptionsWithCurrent(
    paymentMethodsQuery.data,
    collaborator.paymentMethodId,
    collaborator.paymentMethodLabel,
  );
  const sectorOptions = activeOptionsWithCurrent(
    sectorsQuery.data,
    collaborator.sectorId,
    collaborator.sectorLabel,
  );
  const locationOptions = activeOptionsWithCurrent(
    locationsQuery.data,
    collaborator.locationId,
    collaborator.locationLabel,
  );
  const taskOptions = activeOptionsWithCurrent(
    tasksQuery.data,
    collaborator.taskId,
    collaborator.taskLabel,
  );
  const selectedPaymentMethod = paymentMethodsQuery.data?.find(
    (item) => item.id === form.paymentMethodId,
  );
  const paymentValueConfig = paymentValueInputConfig(
    selectedPaymentMethod?.code,
    t,
  );
  const paymentValueValidation = validatePaymentValueInput(
    form.paymentValue,
    paymentValueConfig,
    t,
  );

  function update<K extends keyof EditFormState>(
    key: K,
    value: EditFormState[K],
  ) {
    setClientError("");
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const paymentValue = paymentValueValidation.value;
    const extensionDays = Number(form.extensionDays);

    if (
      !form.planningAvailability ||
      !form.sectorId ||
      !form.locationId ||
      !form.taskId ||
      !form.paymentMethodId
    ) {
      setClientError(t("collaborator.validation.editRequired"));
      return;
    }
    if (!paymentValueValidation.valid) {
      setClientError(paymentValueValidation.message);
      return;
    }
    if (!Number.isInteger(extensionDays) || extensionDays < 0) {
      setClientError(t("collaborator.validation.extensionDays"));
      return;
    }

    const input = collaboratorUpdateInput(
      form,
      paymentValue,
      extensionDays,
      selectedPaymentMethod,
      collaborator,
    );

    try {
      const updated = await updateMutation.mutateAsync(input);
      onSaved(updated);
    } catch {
      // The mutation state renders API validation errors below.
    }
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm lg:col-span-2">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">
            {t("collaborator.edit")}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {t("collaborator.editHelp")}
          </p>
        </div>
        <button
          type="button"
          className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
          onClick={onCancel}
        >
          {t("common.cancelEdit")}
        </button>
      </div>

      {isLoading && (
        <p className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
          {t("collaborator.loadingEditable")}
        </p>
      )}

      <ApiErrorPanel error={loadError} translate={t} />
      <ApiErrorPanel error={updateMutation.error} translate={t} />

      {clientError && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
          {clientError}
        </div>
      )}

      {!isLoading && !loadError && (
        <form onSubmit={submit} className="mt-5 space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            <Select
              label={t("collaborator.availabilityShort")}
              required
              value={form.planningAvailability}
              onChange={(value) => update("planningAvailability", value)}
              options={planningAvailabilityOptions(t)}
              placeholder={t("collaborator.selectAvailability")}
            />
            <Select
              label={t("collaborator.sector")}
              required
              value={form.sectorId}
              onChange={(value) => update("sectorId", value)}
              options={sectorOptions}
              placeholder={t("collaborator.selectSector")}
            />
            <Select
              label={t("collaborator.location")}
              required
              value={form.locationId}
              onChange={(value) => update("locationId", value)}
              options={locationOptions}
              placeholder={t("collaborator.selectLocation")}
            />
            <Select
              label={t("collaborator.task")}
              required
              value={form.taskId}
              onChange={(value) => update("taskId", value)}
              options={taskOptions}
              placeholder={t("collaborator.selectTask")}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Select
              label={t("collaborator.paymentMethod")}
              required
              value={form.paymentMethodId}
              onChange={(value) => update("paymentMethodId", value)}
              options={paymentMethodOptions}
              placeholder={t("collaborator.selectPaymentMethod")}
            />
            <Input
              label={t("collaborator.paymentValue")}
              required
              type="text"
              inputMode="decimal"
              pattern={paymentValueConfig.pattern}
              placeholder={paymentValueConfig.placeholder}
              helperText={paymentValueConfig.helperText}
              value={form.paymentValue}
              onChange={(value) => update("paymentValue", value)}
            />
            <Input
              label={t("collaborator.extensionDays")}
              required
              type="number"
              min="0"
              step="1"
              value={form.extensionDays}
              onChange={(value) => update("extensionDays", value)}
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm"
              onClick={onCancel}
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {updateMutation.isPending ? t("common.saving") : t("collaborator.save")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function editFormFromCollaborator(collaborator: Collaborator): EditFormState {
  return {
    planningAvailability: collaborator.planningAvailability || "ACTIVE",
    sectorId: collaborator.sectorId,
    locationId: collaborator.locationId,
    taskId: collaborator.taskId,
    paymentMethodId: collaborator.paymentMethodId,
    paymentValue: String(collaborator.paymentValue || ""),
    extensionDays: String(collaborator.extensionDays ?? 0),
  };
}

function collaboratorUpdateInput(
  form: EditFormState,
  paymentValue: number,
  extensionDays: number,
  selectedPaymentMethod: ReferenceDataItem | undefined,
  collaborator: Collaborator,
): UpdateCollaboratorInput {
  const input: UpdateCollaboratorInput = {
    planningAvailability:
      form.planningAvailability as UpdateCollaboratorInput["planningAvailability"],
    sectorId: form.sectorId,
    locationId: form.locationId,
    taskId: form.taskId,
    paymentMethodId: form.paymentMethodId,
    paymentValue,
    extensionDays,
  };

  switch (normalizePaymentMethodCode(selectedPaymentMethod?.code)) {
    case "DAILY_BRL":
      input.dailyBrlAmount = paymentValue;
      break;
    case "FIXED_BRL":
      input.fixedMonthlyBrlAmount = paymentValue;
      break;
    case "GOLD_COMMISSION":
      input.goldCommissionPercent = paymentValue;
      input.timeOffGoldSplitPercent =
        collaborator.timeOffGoldSplitPercent ?? 50;
      input.sickDayOffReplacementGoldGrams =
        collaborator.sickDayOffReplacementGoldGrams ?? 1;
      break;
  }

  return input;
}

function planningAvailabilityOptions(t: ReturnType<typeof useI18n>["t"]) {
  return [
    { value: "ACTIVE", label: t("planning.availability.active") },
    { value: "DAY_OFF", label: t("planning.availability.dayOff") },
    { value: "LEAVE_OF_ABSENCE", label: t("planning.availability.leave") },
  ];
}

function planningAvailabilityLabel(value: string | undefined, t: ReturnType<typeof useI18n>["t"]) {
  switch (value) {
    case "DAY_OFF":
      return t("planning.availability.dayOff");
    case "LEAVE_OF_ABSENCE":
      return t("planning.availability.leave");
    default:
      return t("planning.availability.active");
  }
}

function activeOptionsWithCurrent(
  items: ReferenceDataItem[] = [],
  currentId: string,
  currentLabel?: string,
) {
  const options = items
    .filter((item) => item.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map((item) => ({ value: item.id, label: item.label }));

  if (currentId && !options.some((option) => option.value === currentId)) {
    options.unshift({
      value: currentId,
      label: currentLabel
        ? `${currentLabel} (inactive)`
        : `${currentId} (inactive)`,
    });
  }

  return options;
}

function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-gray-700">
      {label}
      {required && <span className="text-red-600"> *</span>}
      <select
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Input({
  label,
  value,
  onChange,
  required = false,
  type = "text",
  min,
  step,
  placeholder,
  inputMode,
  pattern,
  helperText,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  min?: string;
  step?: string;
  placeholder?: string;
  inputMode?: "decimal" | "numeric" | "text";
  pattern?: string;
  helperText?: string;
}) {
  return (
    <label className="block text-sm font-medium text-gray-700">
      {label}
      {required && <span className="text-red-600"> *</span>}
      <input
        required={required}
        type={type}
        min={min}
        step={step}
        placeholder={placeholder}
        inputMode={inputMode}
        pattern={pattern}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
      />
      {helperText && (
        <span className="mt-1 block text-xs font-normal text-gray-500">
          {helperText}
        </span>
      )}
    </label>
  );
}

function CollaboratorNotes({
  collaborator,
  canRefreshGoldBalance,
}: {
  collaborator: Collaborator;
  canRefreshGoldBalance: boolean;
}) {
  const { t } = useI18n();
  const rawNotes = collaborator.notes?.trim() ?? "";
  const refreshGoldBalance =
    canRefreshGoldBalance && hasStoredGoldBalanceNote(rawNotes);
  const preview = useSettlementPreview(
    refreshGoldBalance ? collaborator.id : "",
  );
  const displayedNotes = refreshGoldBalance
    ? notesWithCurrentGoldBalance(rawNotes, preview.data?.goldGramBalance, t)
    : rawNotes || t("collaborator.noNotes");

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm lg:col-span-2">
      <h2 className="text-lg font-semibold text-gray-950">{t("collaborator.notes")}</h2>
      <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">
        {displayedNotes}
      </p>
    </section>
  );
}

const storedGoldBalanceNotePattern =
  /Gold balance starts at\s+[-+]?\d+(?:\.\d+)?\s+grams\./i;

function hasStoredGoldBalanceNote(notes: string) {
  return storedGoldBalanceNotePattern.test(notes);
}

function notesWithCurrentGoldBalance(
  notes: string,
  goldGramBalance: number | undefined,
  t: Translate = translateEnglish,
) {
  if (goldGramBalance === undefined || !Number.isFinite(goldGramBalance)) {
    return notes || t("collaborator.noNotes");
  }

  return notes.replace(
    storedGoldBalanceNotePattern,
    t("collaborator.goldBalanceStarts", {
      value: formatGoldGramsForNotes(goldGramBalance),
    }),
  );
}

function formatGoldGramsForNotes(value: number) {
  return value.toFixed(3);
}

function JourneyCloseSuccessDialog({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="journey-close-success-title"
        aria-describedby="journey-close-success-description"
        className="w-full max-w-md rounded-2xl border border-green-200 bg-white p-6 shadow-2xl"
      >
        <h2
          id="journey-close-success-title"
          className="text-xl font-bold text-green-900"
        >
          {t("collaborator.journeyClosed")}
        </h2>
        <p
          id="journey-close-success-description"
          className="mt-3 text-base font-semibold text-gray-800"
        >
          {message}
        </p>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            autoFocus
            className="rounded-xl bg-green-800 px-4 py-2 text-sm font-semibold text-white shadow-sm"
            onClick={onDismiss}
          >
            {t("common.continue")}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ collaborator }: { collaborator: Collaborator }) {
  const { t } = useI18n();
  const closed = Boolean(collaborator.closedAt);
  const label = closed
    ? t("collaborator.closed")
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

function personDisplayName(collaborator: Collaborator, t: Translate = translateEnglish) {
  return (
    collaborator.personNickname?.trim() ||
    collaborator.personName?.trim() ||
    t("collaborator.personUnavailable")
  );
}

function personLegalName(collaborator: Collaborator) {
  return collaborator.personName?.trim() || "—";
}

function formatDate(value?: string) {
  if (!value) return "—";
  return value;
}
