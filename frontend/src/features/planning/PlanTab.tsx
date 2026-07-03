import { useEffect, useMemo, useState } from "react";
import { getJourneyDaysPresentation } from "../../components/JourneyDaysRemaining";
import type { ReferenceDataItem } from "../../types/referenceData";
import type {
  BulkPlanWorkPeriodAssignmentsInput,
  PlanAssignmentRefinementInput,
  PlanAssignmentRefinementResult,
  PlanningAvailability,
  WorkPeriodPlanningTemplate,
  WorkPeriodPlanningTemplateRow,
} from "../../types/planning";

type SortKey =
  "selected" | "nickname" | "availability" | "sector" | "location" | "task";
type SortDirection = "asc" | "desc";

type SelectableReferenceDataItem = ReferenceDataItem & {
  inactiveCurrent?: boolean;
};

type LocalRow = WorkPeriodPlanningTemplateRow & {
  originalPlanningAvailability?: PlanningAvailability;
  availabilityChanged?: boolean;
};
type RefinementDraft = {
  sectorId: string;
  locationId: string;
  taskId: string;
  applyToFutureDefaults: boolean;
};

export function PlanTab(props: {
  template?: WorkPeriodPlanningTemplate;
  sectors: ReferenceDataItem[];
  locations: ReferenceDataItem[];
  tasks: ReferenceDataItem[];
  editable: boolean;
  loading: boolean;
  pending: boolean;
  onBulkPlan: (input: BulkPlanWorkPeriodAssignmentsInput) => void;
  onRefineAssignment?: (
    input: PlanAssignmentRefinementInput,
  ) => Promise<PlanAssignmentRefinementResult>;
}) {
  const [rows, setRows] = useState<LocalRow[]>([]);
  const [sort, setSort] = useState<{
    key: SortKey;
    direction: SortDirection;
  } | null>(null);
  const [refiningRow, setRefiningRow] = useState<LocalRow | null>(null);
  const [refinementDraft, setRefinementDraft] =
    useState<RefinementDraft | null>(null);
  const [refinementPending, setRefinementPending] = useState(false);
  const [refinementMessage, setRefinementMessage] = useState("");

  useEffect(() => {
    setRows(
      (props.template?.rows ?? []).map((row) => {
        const planningAvailability = normalizePlanningAvailability(
          row.planningAvailability,
        );
        return {
          ...row,
          planningAvailability,
          originalPlanningAvailability: planningAvailability,
          availabilityChanged: false,
        };
      }),
    );
  }, [props.template]);

  const selectedCount = rows.filter((row) => row.selected).length;
  const availabilityChangeCount = rows.filter(
    (row) => row.availabilityChanged,
  ).length;
  const sortedRows = useMemo(() => {
    const copy = [...rows];
    if (!sort) {
      return copy.sort(defaultCompareRows);
    }
    return copy.sort((left, right) => {
      const result = compareForKey(left, right, sort.key);
      return sort.direction === "asc" ? result : -result;
    });
  }, [rows, sort]);

  function updateRow(collaboratorId: string, patch: Partial<LocalRow>) {
    setRows((current) =>
      current.map((row) =>
        row.collaboratorId === collaboratorId ? { ...row, ...patch } : row,
      ),
    );
  }

  function toggleSort(key: SortKey) {
    setSort((current) => {
      if (!current || current.key !== key)
        return { key, direction: key === "selected" ? "desc" : "asc" };
      return { key, direction: current.direction === "asc" ? "desc" : "asc" };
    });
  }

  function submitPlan() {
    props.onBulkPlan({
      rows: rows
        .filter((row) => row.selected || row.availabilityChanged)
        .map((row) => ({
          collaboratorId: row.collaboratorId,
          selected: row.selected,
          sectorId: row.sectorId,
          locationId: row.locationId,
          taskId: row.taskId,
          planningAvailability: normalizePlanningAvailability(
            row.planningAvailability,
          ),
          availabilityChanged: Boolean(row.availabilityChanged),
        })),
    });
  }

  function openRefinement(row: LocalRow) {
    setRefiningRow(row);
    setRefinementDraft({
      sectorId: row.sectorId,
      locationId: row.locationId,
      taskId: row.taskId,
      applyToFutureDefaults: false,
    });
    setRefinementMessage("");
  }

  async function applyRefinement() {
    if (!refiningRow || !refinementDraft) return;

    setRefinementPending(true);
    setRefinementMessage("");
    try {
      let refinementResult: PlanAssignmentRefinementResult | undefined;
      if (refinementDraft.applyToFutureDefaults && props.onRefineAssignment) {
        refinementResult = await props.onRefineAssignment({
          collaboratorId: refiningRow.collaboratorId,
          sectorId: refinementDraft.sectorId,
          locationId: refinementDraft.locationId,
          taskId: refinementDraft.taskId,
          applyToFutureDefaults: true,
        });
      }

      updateRow(refiningRow.collaboratorId, {
        selected: true,
        sectorId: refinementResult?.sectorId ?? refinementDraft.sectorId,
        sectorLabel:
          refinementResult?.sectorLabel ??
          labelFor(props.sectors, refinementDraft.sectorId),
        locationId: refinementResult?.locationId ?? refinementDraft.locationId,
        locationLabel:
          refinementResult?.locationLabel ??
          labelFor(props.locations, refinementDraft.locationId),
        taskId: refinementResult?.taskId ?? refinementDraft.taskId,
        taskLabel:
          refinementResult?.taskLabel ??
          labelFor(props.tasks, refinementDraft.taskId),
      });
      setRefiningRow(null);
      setRefinementDraft(null);
      setRefinementMessage(
        refinementResult?.futureDefaultsUpdated
          ? "Assignment refinement applied and future planning defaults updated. Click Plan to save this Work Period assignment."
          : "Assignment refinement applied to this Work Period plan. Click Plan to save it.",
      );
    } finally {
      setRefinementPending(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Plan Assignments</h2>
          <p className="text-sm text-gray-500">
            Select collaborators for this Work Period. New plans start from the
            most recent Work Period with the same period code. Saving applies
            the selected rows only; unselected rows are ignored unless their
            Availability was changed for inheritance by the next plan.
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Use Plan Assignment to refine a collaborator&apos;s sector, local,
            and task before saving the Work Period plan. Future defaults are
            updated only when explicitly selected in that refinement workflow.
          </p>
          {props.template?.sourceWorkPeriodId && (
            <p className="mt-2 text-sm font-medium text-gray-700">
              Template source: {props.template.sourceWorkDate} ·{" "}
              {props.template.sourcePeriodName}
            </p>
          )}
          {!props.template?.sourceWorkPeriodId && rows.length > 0 && (
            <p className="mt-2 text-sm text-gray-500">
              No prior same-type Work Period template was found, or this Work
              Period already has saved assignments.
            </p>
          )}
          {refinementMessage && (
            <p className="mt-2 rounded-xl bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
              {refinementMessage}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <button
            type="button"
            onClick={() => setSort(null)}
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm"
          >
            Reset sort
          </button>
          <button
            type="button"
            onClick={submitPlan}
            disabled={
              !props.editable ||
              props.pending ||
              refinementPending ||
              props.loading ||
              (selectedCount === 0 && availabilityChangeCount === 0)
            }
            className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:bg-gray-400"
          >
            {props.pending
              ? "Saving plan..."
              : `Save plan (${selectedCount} selected)`}
          </button>
        </div>
      </div>

      {props.loading && (
        <div className="rounded-2xl border bg-white p-6 text-sm text-gray-500 shadow-sm">
          Loading planning collaborators...
        </div>
      )}
      {!props.loading && rows.length === 0 && (
        <div className="rounded-2xl border bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          No active collaborators are available for planning.
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] table-fixed divide-y divide-gray-200 text-sm">
              <colgroup>
                <col className="w-12" />
                <col className="w-36" />
                <col className="w-16" />
                <col className="w-14" />
                <col className="w-32" />
                <col className="w-32" />
                <col className="w-44" />
              </colgroup>
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <SortableHeader
                    label="✓"
                    title="Selected"
                    active={sort?.key === "selected"}
                    direction={sort?.direction}
                    onClick={() => toggleSort("selected")}
                    className="text-right"
                  />
                  <SortableHeader
                    label="Nick"
                    title="Nickname"
                    active={sort?.key === "nickname"}
                    direction={sort?.direction}
                    onClick={() => toggleSort("nickname")}
                  />
                  <th
                    className="px-1 py-3 text-center whitespace-nowrap"
                    title="Days left until projected Journey end"
                  >
                    D Left
                  </th>
                  <SortableHeader
                    label="Avail."
                    title="Availability"
                    active={sort?.key === "availability"}
                    direction={sort?.direction}
                    onClick={() => toggleSort("availability")}
                    className="px-1 text-center whitespace-nowrap"
                  />
                  <SortableHeader
                    label="Sector"
                    active={sort?.key === "sector"}
                    direction={sort?.direction}
                    onClick={() => toggleSort("sector")}
                  />
                  <SortableHeader
                    label="Local"
                    active={sort?.key === "location"}
                    direction={sort?.direction}
                    onClick={() => toggleSort("location")}
                  />
                  <SortableHeader
                    label="Task"
                    active={sort?.key === "task"}
                    direction={sort?.direction}
                    onClick={() => toggleSort("task")}
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedRows.map((row) => (
                  <tr
                    key={row.collaboratorId}
                    className={row.selected ? "bg-white" : "bg-gray-50/70"}
                  >
                    <td className="px-2 py-3 text-right align-top">
                      <label className="inline-flex items-center justify-end">
                        <span className="sr-only">
                          {row.selected
                            ? `Unselect ${row.collaboratorNickname || row.collaboratorName || row.collaboratorId}`
                            : `Select ${row.collaboratorNickname || row.collaboratorName || row.collaboratorId}`}
                        </span>
                        <input
                          type="checkbox"
                          checked={row.selected}
                          disabled={!props.editable || props.pending}
                          onChange={(event) =>
                            updateRow(row.collaboratorId, {
                              selected: event.target.checked,
                            })
                          }
                          className="h-4 w-4 rounded border-gray-300"
                        />
                      </label>
                    </td>
                    <td className="px-2 py-3 align-top">
                      <div
                        className="truncate font-semibold text-gray-950"
                        title={
                          row.collaboratorNickname ||
                          row.collaboratorName ||
                          row.collaboratorId
                        }
                      >
                        {row.collaboratorNickname ||
                          row.collaboratorName ||
                          row.collaboratorId}
                      </div>
                      <button
                        type="button"
                        disabled={!props.editable || props.pending}
                        onClick={() => openRefinement(row)}
                        className="mt-2 inline-flex rounded-lg border border-gray-300 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
                      >
                        Plan Assignment
                      </button>
                    </td>
                    <td className="px-1 py-3 text-center align-top">
                      <CompactJourneyDaysRemaining
                        projectedEndDate={row.projectedEndDate || ""}
                        className="text-xs"
                      />
                    </td>
                    <td className="px-1 py-3 text-center align-top">
                      <AvailabilitySelect
                        label={`Availability for ${row.collaboratorNickname || row.collaboratorName || row.collaboratorId}`}
                        value={normalizePlanningAvailability(
                          row.planningAvailability,
                        )}
                        disabled={!props.editable || props.pending}
                        onChange={(planningAvailability) =>
                          updateRow(row.collaboratorId, {
                            planningAvailability,
                            availabilityChanged:
                              planningAvailability !==
                              row.originalPlanningAvailability,
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-3 align-top">
                      <ReferenceSelect
                        label={`Sector for ${row.collaboratorNickname || row.collaboratorName || row.collaboratorId}`}
                        value={row.sectorId}
                        options={props.sectors}
                        widthClassName="w-32"
                        disabled={
                          !props.editable || props.pending || !row.selected
                        }
                        onChange={(sectorId) =>
                          updateRow(row.collaboratorId, { sectorId })
                        }
                      />
                    </td>
                    <td className="px-2 py-3 align-top">
                      <ReferenceSelect
                        label={`Local for ${row.collaboratorNickname || row.collaboratorName || row.collaboratorId}`}
                        value={row.locationId}
                        options={props.locations}
                        widthClassName="w-32"
                        disabled={
                          !props.editable || props.pending || !row.selected
                        }
                        onChange={(locationId) =>
                          updateRow(row.collaboratorId, { locationId })
                        }
                      />
                    </td>
                    <td className="px-2 py-3 align-top">
                      <ReferenceSelect
                        label={`Task for ${row.collaboratorNickname || row.collaboratorName || row.collaboratorId}`}
                        value={row.taskId}
                        options={props.tasks}
                        widthClassName="w-44"
                        disabled={
                          !props.editable || props.pending || !row.selected
                        }
                        onChange={(taskId) =>
                          updateRow(row.collaboratorId, { taskId })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {refiningRow && refinementDraft && (
        <PlanAssignmentRefinementDialog
          row={refiningRow}
          draft={refinementDraft}
          sectors={props.sectors}
          locations={props.locations}
          tasks={props.tasks}
          pending={refinementPending}
          onChange={(patch) =>
            setRefinementDraft((current) =>
              current ? { ...current, ...patch } : current,
            )
          }
          onCancel={() => {
            setRefiningRow(null);
            setRefinementDraft(null);
          }}
          onApply={() => void applyRefinement()}
        />
      )}
    </section>
  );
}

function SortableHeader(props: {
  label: string;
  active: boolean;
  direction?: SortDirection;
  onClick: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <th
      className={["px-2 py-3", props.className].filter(Boolean).join(" ")}
      title={props.title ?? props.label}
    >
      <button
        type="button"
        onClick={props.onClick}
        className="inline-flex items-center gap-1 font-semibold text-gray-600 hover:text-gray-950"
      >
        {props.label}
        {props.active && (
          <span aria-label={`sorted ${props.direction}`}>
            {props.direction === "asc" ? "↑" : "↓"}
          </span>
        )}
      </button>
    </th>
  );
}

function PlanAssignmentRefinementDialog(props: {
  row: LocalRow;
  draft: RefinementDraft;
  sectors: ReferenceDataItem[];
  locations: ReferenceDataItem[];
  tasks: ReferenceDataItem[];
  pending: boolean;
  onChange: (patch: Partial<RefinementDraft>) => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  const displayName =
    props.row.collaboratorNickname ||
    props.row.collaboratorName ||
    props.row.collaboratorId;

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-assignment-refinement-title"
        className="w-full max-w-xl space-y-4 rounded-2xl bg-white p-6 shadow-xl"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Plan Assignment
          </p>
          <h3
            id="plan-assignment-refinement-title"
            className="text-xl font-bold text-gray-950"
          >
            Refine {displayName}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Refine sector, local, and task for this Work Period plan. Future
            Collaborator defaults change only when explicitly selected below.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <VisibleReferenceSelect
            label="Sector"
            value={props.draft.sectorId}
            options={props.sectors}
            disabled={props.pending}
            onChange={(sectorId) => props.onChange({ sectorId })}
          />
          <VisibleReferenceSelect
            label="Local"
            value={props.draft.locationId}
            options={props.locations}
            disabled={props.pending}
            onChange={(locationId) => props.onChange({ locationId })}
          />
          <VisibleReferenceSelect
            label="Task"
            value={props.draft.taskId}
            options={props.tasks}
            disabled={props.pending}
            onChange={(taskId) => props.onChange({ taskId })}
          />
        </div>

        <label className="flex items-start gap-3 rounded-xl border bg-gray-50 p-3 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={props.draft.applyToFutureDefaults}
            disabled={props.pending}
            onChange={(event) =>
              props.onChange({ applyToFutureDefaults: event.target.checked })
            }
            className="mt-1 h-4 w-4 rounded border-gray-300"
          />
          <span>
            <span className="font-semibold text-gray-900">
              Use these values as future planning defaults for this Collaborator
            </span>
            <span className="block text-xs text-gray-500">
              This is the only option in this workflow that updates the
              Collaborator Journey defaults. The Work Period assignment is still
              saved by clicking Plan selected collaborators.
            </span>
          </span>
        </label>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={props.onCancel}
            disabled={props.pending}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm disabled:text-gray-400"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={props.onApply}
            disabled={props.pending}
            className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:bg-gray-400"
          >
            {props.pending ? "Applying..." : "Apply refinement"}
          </button>
        </div>
      </section>
    </div>
  );
}

function CompactJourneyDaysRemaining(props: {
  projectedEndDate: string;
  className?: string;
}) {
  const presentation = getJourneyDaysPresentation(
    props.projectedEndDate,
    new Date(),
  );

  if (!presentation) {
    return null;
  }

  return (
    <span
      className={["font-bold", presentation.colorClass, props.className]
        .filter(Boolean)
        .join(" ")}
      title={presentation.label}
    >
      {presentation.daysRemaining} D
    </span>
  );
}

function AvailabilitySelect(props: {
  label: string;
  value: PlanningAvailability;
  disabled: boolean;
  onChange: (value: PlanningAvailability) => void;
}) {
  return (
    <label>
      <span className="sr-only">{props.label}</span>
      <select
        aria-label={props.label}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) =>
          props.onChange(normalizePlanningAvailability(event.target.value))
        }
        title={availabilityLabel(props.value)}
        className="w-10 rounded-xl border border-gray-300 bg-white px-1 py-2 text-sm text-gray-900 shadow-sm disabled:bg-gray-100 disabled:text-gray-500"
      >
        <option value="ACTIVE" title="A — Active">A</option>
        <option value="DAY_OFF" title="D — Day Off">D</option>
        <option value="LEAVE_OF_ABSENCE" title="L — Leave of Absence">L</option>
      </select>
    </label>
  );
}

function ReferenceSelect(props: {
  label: string;
  value: string;
  options: ReferenceDataItem[];
  disabled: boolean;
  onChange: (value: string) => void;
  widthClassName?: string;
}) {
  const options = selectableReferenceOptions(props.options, props.value);

  return (
    <label>
      <span className="sr-only">{props.label}</span>
      <select
        aria-label={props.label}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
        title={referenceSelectTitle(options, props.value)}
        className={`${props.widthClassName ?? "w-36"} min-w-0 truncate rounded-xl border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900 shadow-sm disabled:bg-gray-100 disabled:text-gray-500`}
      >
        {options.map((option) => (
          <option
            key={option.id}
            value={option.id}
            disabled={option.inactiveCurrent}
          >
            {referenceOptionLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function VisibleReferenceSelect(props: {
  label: string;
  value: string;
  options: ReferenceDataItem[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const options = selectableReferenceOptions(props.options, props.value);

  return (
    <label className="text-sm font-medium text-gray-700">
      {props.label}
      <select
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm disabled:bg-gray-100 disabled:text-gray-500"
      >
        {options.map((option) => (
          <option
            key={option.id}
            value={option.id}
            disabled={option.inactiveCurrent}
          >
            {referenceOptionLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function selectableReferenceOptions(
  options: ReferenceDataItem[],
  currentValue: string,
): SelectableReferenceDataItem[] {
  const activeOptions = [...options]
    .filter((option) => option.active)
    .sort(bySortOrderThenLabel);

  if (
    !currentValue ||
    activeOptions.some((option) => option.id === currentValue)
  ) {
    return activeOptions;
  }

  const currentInactive = options.find((option) => option.id === currentValue);
  if (!currentInactive) {
    return activeOptions;
  }

  return [{ ...currentInactive, inactiveCurrent: true }, ...activeOptions];
}

function bySortOrderThenLabel(
  left: ReferenceDataItem,
  right: ReferenceDataItem,
) {
  return (
    left.sortOrder - right.sortOrder || left.label.localeCompare(right.label)
  );
}

function referenceOptionLabel(option: SelectableReferenceDataItem) {
  return option.inactiveCurrent ? `${option.label} (inactive)` : option.label;
}

function referenceSelectTitle(
  options: SelectableReferenceDataItem[],
  currentValue: string,
) {
  const current = options.find((option) => option.id === currentValue);
  return current ? referenceOptionLabel(current) : "";
}

function defaultCompareRows(left: LocalRow, right: LocalRow) {
  return (
    compareBooleanDesc(left.selected, right.selected) ||
    compareText(rowNickname(left), rowNickname(right)) ||
    compareText(
      left.sectorLabel || left.sectorId,
      right.sectorLabel || right.sectorId,
    ) ||
    compareText(
      left.locationLabel || left.locationId,
      right.locationLabel || right.locationId,
    ) ||
    compareText(left.taskLabel || left.taskId, right.taskLabel || right.taskId)
  );
}

function compareForKey(left: LocalRow, right: LocalRow, key: SortKey) {
  switch (key) {
    case "selected":
      return (
        compareBooleanDesc(left.selected, right.selected) ||
        defaultCompareRows(left, right)
      );
    case "nickname":
      return compareText(rowNickname(left), rowNickname(right));
    case "availability":
      return compareText(
        availabilityLabel(left.planningAvailability),
        availabilityLabel(right.planningAvailability),
      );
    case "sector":
      return compareText(
        left.sectorLabel || left.sectorId,
        right.sectorLabel || right.sectorId,
      );
    case "location":
      return compareText(
        left.locationLabel || left.locationId,
        right.locationLabel || right.locationId,
      );
    case "task":
      return compareText(
        left.taskLabel || left.taskId,
        right.taskLabel || right.taskId,
      );
  }
}

function compareBooleanDesc(left: boolean, right: boolean) {
  if (left === right) return 0;
  return left ? -1 : 1;
}

function compareText(left: string | undefined, right: string | undefined) {
  return (left || "").localeCompare(right || "", undefined, {
    sensitivity: "base",
  });
}

function rowNickname(row: LocalRow) {
  return row.collaboratorNickname || row.collaboratorName || row.collaboratorId;
}

function normalizePlanningAvailability(
  value: string | undefined,
): PlanningAvailability {
  switch (value) {
    case "DAY_OFF":
    case "LEAVE_OF_ABSENCE":
    case "ACTIVE":
      return value;
    default:
      return "ACTIVE";
  }
}

function availabilityLabel(value: string | undefined) {
  switch (normalizePlanningAvailability(value)) {
    case "DAY_OFF":
      return "D — Day Off";
    case "LEAVE_OF_ABSENCE":
      return "L — Leave of Absence";
    case "ACTIVE":
      return "A — Active";
  }
}

function labelFor(options: ReferenceDataItem[], id: string) {
  return options.find((option) => option.id === id)?.label ?? id;
}
