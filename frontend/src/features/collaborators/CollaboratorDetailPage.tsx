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

export function CollaboratorDetailPage() {
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
            {canBrowseCollaborators ? "Back to Collaborators" : "Back to My Journeys"}
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
            {canBrowseCollaborators ? "Back to Collaborators" : "Back to My Journeys"}
          </Link>
          <p className="mt-4 text-gray-700">Collaborator not found.</p>
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
            {canBrowseCollaborators ? "Back to Collaborators" : "Back to My Journeys"}
          </Link>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <PageTitle>
                Collaborator Journey
              </PageTitle>
              <PageContextHeading>
                {displayPersonName(collaborator)}
              </PageContextHeading>
              <p className="mt-1 text-sm text-gray-600">
                <span className="font-semibold">Journey Code:</span>{" "}
                <span className="break-all font-mono">{collaborator.id}</span>
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Started {formatDate(collaborator.journeyStartDate)} · Projected
                end {formatDate(collaborator.projectedEndDate)}
              </p>
              {collaborator.closedAt ? (
                <div
                  role="status"
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-900"
                >
                  <span>Journey Closed</span>
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
                    Current Account
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
                    Edit Collaborator
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
                    Edit Work Assignment
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
                `Collaborator updated for ${displayPersonName(updated)}.`,
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
                `Work assignment updated for ${displayPersonName(updated)}.`,
              );
            }}
          />
        )}

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
              to={`/people/${collaborator.legacyPersonId ?? collaborator.personId}`}
            >
              View Person
            </Link>
          </div>

          <dl className="mt-5 grid gap-3 text-sm">
            <Info label="Nickname" value={personDisplayName(collaborator)} />
            <Info label="Legal Name" value={personLegalName(collaborator)} />
            <Info label="Person ID" value={collaborator.personId} />
            <Info label="Membership ID" value={collaborator.membershipId} />
            {collaborator.legacyPersonId && (
              <Info label="Legacy Person ID" value={collaborator.legacyPersonId} />
            )}
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
              label="Avail."
              value={planningAvailabilityLabel(
                collaborator.planningAvailability,
              )}
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
              value={formatCollaboratorPaymentValue(collaborator)}
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
      setClientError("Select sector, location, and task before saving.");
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
            Edit Work Assignment
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Earnings administration may update only Sector, Location, and Task.
          </p>
        </div>
        <button
          type="button"
          className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
          onClick={onCancel}
        >
          Cancel edit
        </button>
      </div>

      {isLoading && (
        <p className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
          Loading editable reference data...
        </p>
      )}

      <ApiErrorPanel error={loadError} />
      <ApiErrorPanel error={updateMutation.error} />

      {clientError && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
          {clientError}
        </div>
      )}

      {!isLoading && !loadError && (
        <form onSubmit={submit} className="mt-5 space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Select
              label="Sector"
              required
              value={form.sectorId}
              onChange={(value) => update("sectorId", value)}
              options={sectorOptions}
              placeholder="Select a sector"
            />
            <Select
              label="Location"
              required
              value={form.locationId}
              onChange={(value) => update("locationId", value)}
              options={locationOptions}
              placeholder="Select a location"
            />
            <Select
              label="Task"
              required
              value={form.taskId}
              onChange={(value) => update("taskId", value)}
              options={taskOptions}
              placeholder="Select a task"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {updateMutation.isPending ? "Saving..." : "Save Work Assignment"}
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
  );
  const paymentValueValidation = validatePaymentValueInput(
    form.paymentValue,
    paymentValueConfig,
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
      setClientError(
        "Select availability, sector, location, task, and payment method before saving.",
      );
      return;
    }
    if (!paymentValueValidation.valid) {
      setClientError(paymentValueValidation.message);
      return;
    }
    if (!Number.isInteger(extensionDays) || extensionDays < 0) {
      setClientError(
        "Extension days must be a whole number of zero or greater.",
      );
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
            Edit Collaborator
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Update assignment, payment, and journey extension details for this
            Collaborator.
          </p>
        </div>
        <button
          type="button"
          className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
          onClick={onCancel}
        >
          Cancel edit
        </button>
      </div>

      {isLoading && (
        <p className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
          Loading editable reference data...
        </p>
      )}

      <ApiErrorPanel error={loadError} />
      <ApiErrorPanel error={updateMutation.error} />

      {clientError && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
          {clientError}
        </div>
      )}

      {!isLoading && !loadError && (
        <form onSubmit={submit} className="mt-5 space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            <Select
              label="Avail."
              required
              value={form.planningAvailability}
              onChange={(value) => update("planningAvailability", value)}
              options={planningAvailabilityOptions}
              placeholder="Select availability"
            />
            <Select
              label="Sector"
              required
              value={form.sectorId}
              onChange={(value) => update("sectorId", value)}
              options={sectorOptions}
              placeholder="Select a sector"
            />
            <Select
              label="Location"
              required
              value={form.locationId}
              onChange={(value) => update("locationId", value)}
              options={locationOptions}
              placeholder="Select a location"
            />
            <Select
              label="Task"
              required
              value={form.taskId}
              onChange={(value) => update("taskId", value)}
              options={taskOptions}
              placeholder="Select a task"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Select
              label="Payment Method"
              required
              value={form.paymentMethodId}
              onChange={(value) => update("paymentMethodId", value)}
              options={paymentMethodOptions}
              placeholder="Select a payment method"
            />
            <Input
              label="Payment Value"
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
              label="Extension Days"
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
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {updateMutation.isPending ? "Saving..." : "Save Collaborator"}
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

const planningAvailabilityOptions = [
  { value: "ACTIVE", label: "A — Active" },
  { value: "DAY_OFF", label: "D — Day Off" },
  { value: "LEAVE_OF_ABSENCE", label: "L — Leave of Absence" },
];

function planningAvailabilityLabel(value?: string) {
  switch (value) {
    case "DAY_OFF":
      return "D — Day Off";
    case "LEAVE_OF_ABSENCE":
      return "L — Leave of Absence";
    default:
      return "A — Active";
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
  const rawNotes = collaborator.notes?.trim() ?? "";
  const refreshGoldBalance =
    canRefreshGoldBalance && hasStoredGoldBalanceNote(rawNotes);
  const preview = useSettlementPreview(
    refreshGoldBalance ? collaborator.id : "",
  );
  const displayedNotes = refreshGoldBalance
    ? notesWithCurrentGoldBalance(rawNotes, preview.data?.goldGramBalance)
    : rawNotes || "No notes recorded.";

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm lg:col-span-2">
      <h2 className="text-lg font-semibold text-gray-950">Notes</h2>
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

function notesWithCurrentGoldBalance(notes: string, goldGramBalance?: number) {
  if (goldGramBalance === undefined || !Number.isFinite(goldGramBalance)) {
    return notes || "No notes recorded.";
  }

  return notes.replace(
    storedGoldBalanceNotePattern,
    `Gold balance starts at ${formatGoldGramsForNotes(goldGramBalance)} grams.`,
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
          Journey Closed
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
            Continue
          </button>
        </div>
      </div>
    </div>
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
