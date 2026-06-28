import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { JourneyDaysRemaining } from "../../components/JourneyDaysRemaining";
import type {
  Collaborator,
  UpdateCollaboratorInput,
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
import { useCollaborator, useUpdateCollaborator } from "./useCollaborators";
import { useSettlementPreview } from "./useSettlements";

export function CollaboratorDetailPage() {
  const { id = "" } = useParams();
  const { data: collaborator, isLoading, error } = useCollaborator(id);
  const [editing, setEditing] = useState(false);
  const [flash, setFlash] = useState("");

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
              <JourneyDaysRemaining
                projectedEndDate={collaborator.projectedEndDate}
                closedAt={collaborator.closedAt}
                className="mt-1 block text-sm"
              />
            </div>

            <div className="flex flex-col items-start gap-3 sm:items-end">
              <StatusBadge collaborator={collaborator} />
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Link
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
                  to={`/collaborators/${collaborator.id}/current-account`}
                >
                  Current Account
                </Link>
              <button
                type="button"
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
                onClick={() => {
                  setFlash("");
                  setEditing(true);
                }}
              >
                Edit Collaborator
              </button>
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

        {editing && (
          <CollaboratorEditPanel
            collaborator={collaborator}
            onCancel={() => setEditing(false)}
            onSaved={(updated) => {
              setEditing(false);
              setFlash(
                `Collaborator updated for ${displayPersonName(updated)}.`,
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
              value={formatCollaboratorPaymentValue(collaborator)}
            />
          </dl>
        </section>

        <JourneySettlementPanel
          collaboratorId={collaborator.id}
          projectedEndDate={collaborator.projectedEndDate}
          closedAt={collaborator.closedAt}
        />

        <CollaboratorNotes collaborator={collaborator} />
      </section>
    </main>
  );
}

type EditFormState = {
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
      !form.sectorId ||
      !form.locationId ||
      !form.taskId ||
      !form.paymentMethodId
    ) {
      setClientError(
        "Select sector, location, task, and payment method before saving.",
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

function CollaboratorNotes({ collaborator }: { collaborator: Collaborator }) {
  const rawNotes = collaborator.notes?.trim() ?? "";
  const refreshGoldBalance = hasStoredGoldBalanceNote(rawNotes);
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
