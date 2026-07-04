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
  | "selected"
  | "replacementCandidate"
  | "temporaryReplacement"
  | "nickname"
  | "availability"
  | "sector"
  | "location"
  | "task";
type SortDirection = "asc" | "desc";
type SelectionFilter = "ALL" | "SELECTED" | "UNSELECTED";
type PlanningAvailabilityFilter = "ALL" | PlanningAvailability;
type ReplacementCandidateFilter = "ALL" | "CANDIDATES" | "NON_CANDIDATES";
type PlanningTableFilters = {
  search: string;
  selection: SelectionFilter;
  availability: PlanningAvailabilityFilter;
  replacementCandidate: ReplacementCandidateFilter;
  sectorId: string;
  locationId: string;
  taskId: string;
};

const emptyPlanningTableFilters: PlanningTableFilters = {
  search: "",
  selection: "ALL",
  availability: "ALL",
  replacementCandidate: "ALL",
  sectorId: "",
  locationId: "",
  taskId: "",
};

type SelectableReferenceDataItem = ReferenceDataItem & {
  inactiveCurrent?: boolean;
};

type LocalRow = WorkPeriodPlanningTemplateRow & {
  planningOrder: number;
  originalPlanningAvailability?: PlanningAvailability;
  availabilityChanged?: boolean;
  replacementCandidate?: boolean;
  temporaryReplacementForCollaboratorId?: string;
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
  const [filters, setFilters] = useState<PlanningTableFilters>(
    emptyPlanningTableFilters,
  );
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
    const nextRows = (props.template?.rows ?? []).map((row, planningOrder) => {
      const planningAvailability = normalizePlanningAvailability(
        row.planningAvailability,
      );
      return {
        ...row,
        planningOrder,
        planningAvailability,
        originalPlanningAvailability: planningAvailability,
        availabilityChanged: false,
        replacementCandidate: Boolean(row.replacementForAssignmentId),
        temporaryReplacementForCollaboratorId: "",
      };
    });
    const collaboratorByAssignmentId = new Map(
      nextRows
        .filter((row) => row.assignmentId)
        .map((row) => [row.assignmentId, row.collaboratorId]),
    );
    setRows(
      nextRows.map((row) => ({
        ...row,
        temporaryReplacementForCollaboratorId:
          collaboratorByAssignmentId.get(row.replacementForAssignmentId) ?? "",
      })),
    );
  }, [props.template]);

  const selectedCount = rows.filter((row) => row.selected).length;
  const availabilityChangeCount = rows.filter(
    (row) => row.availabilityChanged,
  ).length;
  const replacementCandidateCount = rows.filter(
    (row) => row.replacementCandidate,
  ).length;
  const temporaryReplacementCount = rows.filter(
    (row) => row.temporaryReplacementForCollaboratorId,
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
  const filteredRows = useMemo(
    () => sortedRows.filter((row) => rowMatchesFilters(row, filters)),
    [sortedRows, filters],
  );
  const filtersActive = !planningFiltersAreEmpty(filters);

  function updateRow(collaboratorId: string, patch: Partial<LocalRow>) {
    setRows((current) =>
      current.map((row) =>
        row.collaboratorId === collaboratorId ? { ...row, ...patch } : row,
      ),
    );
  }

  function updatePlanningAvailability(
    collaboratorId: string,
    planningAvailability: PlanningAvailability,
  ) {
    setRows((current) =>
      current.map((row) => {
        if (row.collaboratorId === collaboratorId) {
          return {
            ...row,
            planningAvailability,
            availabilityChanged:
              planningAvailability !== row.originalPlanningAvailability,
          };
        }

        if (
          row.temporaryReplacementForCollaboratorId === collaboratorId &&
          !isTemporaryReplacementTargetAvailability(planningAvailability)
        ) {
          return {
            ...row,
            temporaryReplacementForCollaboratorId: "",
          };
        }

        return row;
      }),
    );
  }

  function updateFilters(patch: Partial<PlanningTableFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  function toggleSort(key: SortKey) {
    setSort((current) => {
      if (!current || current.key !== key)
        return { key, direction: key === "selected" ? "desc" : "asc" };
      return { key, direction: current.direction === "asc" ? "desc" : "asc" };
    });
  }

  function submitPlan() {
    const temporaryReplacementTargetIds = new Set(
      rows
        .map((row) => row.temporaryReplacementForCollaboratorId?.trim())
        .filter(Boolean),
    );

    props.onBulkPlan({
      rows: rows
        .filter(
          (row) =>
            row.selected ||
            row.availabilityChanged ||
            Boolean(row.temporaryReplacementForCollaboratorId) ||
            temporaryReplacementTargetIds.has(row.collaboratorId),
        )
        .map((row) => {
          const payload = {
            collaboratorId: row.collaboratorId,
            selected: row.selected,
            sectorId: row.sectorId,
            locationId: row.locationId,
            taskId: row.taskId,
            planningAvailability: normalizePlanningAvailability(
              row.planningAvailability,
            ),
            availabilityChanged: Boolean(row.availabilityChanged),
          };
          return row.temporaryReplacementForCollaboratorId
            ? {
                ...payload,
                temporaryReplacementForCollaboratorId:
                  row.temporaryReplacementForCollaboratorId,
              }
            : payload;
        }),
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
            and task before saving the Work Period plan. Use Cand. and Repl.
            to mark temporary replacements for this Work Period only. Future
            defaults are updated only when explicitly selected in that
            refinement workflow.
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
              selectedCount === 0 &&
              availabilityChangeCount === 0 &&
              temporaryReplacementCount === 0
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
          <PlanningTableFiltersPanel
            filters={filters}
            sectors={props.sectors}
            locations={props.locations}
            tasks={props.tasks}
            visibleCount={filteredRows.length}
            totalCount={rows.length}
            selectedCount={selectedCount}
            replacementCandidateCount={replacementCandidateCount}
            temporaryReplacementCount={temporaryReplacementCount}
            disabled={props.loading || props.pending}
            filtersActive={filtersActive}
            onChange={updateFilters}
            onClear={() => setFilters(emptyPlanningTableFilters)}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[50rem] table-fixed divide-y divide-gray-200 text-sm">
              <colgroup>
                <col className="w-12" />
                <col className="w-14" />
                <col className="w-40" />
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
                    label="Cand."
                    title="Replacement candidate"
                    active={sort?.key === "replacementCandidate"}
                    direction={sort?.direction}
                    onClick={() => toggleSort("replacementCandidate")}
                    className="px-1 text-center whitespace-nowrap"
                  />
                  <SortableHeader
                    label="Repl."
                    title="Temporary replacement target"
                    active={sort?.key === "temporaryReplacement"}
                    direction={sort?.direction}
                    onClick={() => toggleSort("temporaryReplacement")}
                    className="px-1 text-center whitespace-nowrap"
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
                {filteredRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-8 text-center text-sm text-gray-500"
                    >
                      No collaborators match the current planning filters.
                    </td>
                  </tr>
                )}
                {filteredRows.map((row) => (
                  <tr
                    key={row.collaboratorId}
                    className={
                      row.replacementCandidate
                        ? "bg-amber-50"
                        : row.selected
                          ? "bg-white"
                          : "bg-gray-50/70"
                    }
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
                    <td className="px-1 py-3 text-center align-top">
                      <ReplacementCandidateToggle
                        label={`Replacement candidate for ${row.collaboratorNickname || row.collaboratorName || row.collaboratorId}`}
                        checked={Boolean(row.replacementCandidate)}
                        disabled={!props.editable || props.pending}
                        onChange={(replacementCandidate) =>
                          updateRow(row.collaboratorId, {
                            replacementCandidate,
                            temporaryReplacementForCollaboratorId:
                              replacementCandidate
                                ? row.temporaryReplacementForCollaboratorId
                                : "",
                          })
                        }
                      />
                    </td>
                    <td className="px-1 py-3 align-top">
                      <TemporaryReplacementSelect
                        label={`Temporary replacement target for ${row.collaboratorNickname || row.collaboratorName || row.collaboratorId}`}
                        value={row.temporaryReplacementForCollaboratorId || ""}
                        row={row}
                        rows={rows}
                        disabled={
                          !props.editable ||
                          props.pending ||
                          !row.replacementCandidate
                        }
                        onChange={(temporaryReplacementForCollaboratorId) =>
                          updateRow(row.collaboratorId, {
                            temporaryReplacementForCollaboratorId,
                            replacementCandidate:
                              Boolean(temporaryReplacementForCollaboratorId) ||
                              Boolean(row.replacementCandidate),
                            selected:
                              row.selected ||
                              Boolean(temporaryReplacementForCollaboratorId),
                          })
                        }
                      />
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
                      {row.replacementCandidate && (
                        <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                          Candidate
                        </span>
                      )}
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
                          updatePlanningAvailability(
                            row.collaboratorId,
                            planningAvailability,
                          )
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

function PlanningTableFiltersPanel(props: {
  filters: PlanningTableFilters;
  sectors: ReferenceDataItem[];
  locations: ReferenceDataItem[];
  tasks: ReferenceDataItem[];
  visibleCount: number;
  totalCount: number;
  selectedCount: number;
  replacementCandidateCount: number;
  temporaryReplacementCount: number;
  disabled: boolean;
  filtersActive: boolean;
  onChange: (patch: Partial<PlanningTableFilters>) => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-3 border-b bg-gray-50/80 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-950">
            Planning table filters
          </h3>
          <p className="text-xs text-gray-500">
            Filters only change which rows are visible. Temporary replacement
            choices are saved only for this Work Period; they do not update
            future planning defaults.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-gray-600">
          <span>
            Showing {props.visibleCount} of {props.totalCount}
          </span>
          <span>·</span>
          <span>{props.selectedCount} selected</span>
          <span>·</span>
          <span>{props.replacementCandidateCount} candidate</span>
          <span>·</span>
          <span>{props.temporaryReplacementCount} temporary replacement</span>
          <button
            type="button"
            onClick={props.onClear}
            disabled={props.disabled || !props.filtersActive}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1 font-semibold text-gray-700 shadow-sm disabled:bg-gray-100 disabled:text-gray-400"
          >
            Clear filters
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 md:col-span-3 xl:col-span-1">
          Search collaborators
          <input
            type="search"
            value={props.filters.search}
            disabled={props.disabled}
            onChange={(event) => props.onChange({ search: event.target.value })}
            placeholder="Nick or name"
            className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-gray-900 shadow-sm disabled:bg-gray-100 disabled:text-gray-500"
          />
        </label>

        <FilterSelect
          label="Selection"
          value={props.filters.selection}
          disabled={props.disabled}
          onChange={(selection) =>
            props.onChange({ selection: selection as SelectionFilter })
          }
          options={[
            { value: "ALL", label: "All rows" },
            { value: "SELECTED", label: "Selected only" },
            { value: "UNSELECTED", label: "Unselected only" },
          ]}
        />

        <FilterSelect
          label="Avail."
          value={props.filters.availability}
          disabled={props.disabled}
          onChange={(availability) =>
            props.onChange({
              availability: availability as PlanningAvailabilityFilter,
            })
          }
          options={[
            { value: "ALL", label: "All availability" },
            { value: "ACTIVE", label: "A" },
            { value: "DAY_OFF", label: "D" },
            { value: "LEAVE_OF_ABSENCE", label: "L" },
          ]}
        />

        <FilterSelect
          label="Candidate"
          value={props.filters.replacementCandidate}
          disabled={props.disabled}
          onChange={(replacementCandidate) =>
            props.onChange({
              replacementCandidate:
                replacementCandidate as ReplacementCandidateFilter,
            })
          }
          options={[
            { value: "ALL", label: "All rows" },
            { value: "CANDIDATES", label: "Candidates only" },
            { value: "NON_CANDIDATES", label: "Non-candidates only" },
          ]}
        />

        <FilterSelect
          label="Sector"
          value={props.filters.sectorId}
          disabled={props.disabled}
          onChange={(sectorId) => props.onChange({ sectorId })}
          options={referenceFilterOptions(props.sectors, "All sectors")}
        />

        <FilterSelect
          label="Local"
          value={props.filters.locationId}
          disabled={props.disabled}
          onChange={(locationId) => props.onChange({ locationId })}
          options={referenceFilterOptions(props.locations, "All locals")}
        />

        <FilterSelect
          label="Task"
          value={props.filters.taskId}
          disabled={props.disabled}
          onChange={(taskId) => props.onChange({ taskId })}
          options={referenceFilterOptions(props.tasks, "All tasks")}
        />
      </div>
    </div>
  );
}

function FilterSelect(props: {
  label: string;
  value: string;
  disabled: boolean;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
      {props.label}
      <select
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-gray-900 shadow-sm disabled:bg-gray-100 disabled:text-gray-500"
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
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

function ReplacementCandidateToggle(props: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className="inline-flex items-center justify-center"
      title={
        props.checked
          ? "Marked as a replacement candidate for this Work Period."
          : "Mark as a replacement candidate for this Work Period."
      }
    >
      <span className="sr-only">{props.label}</span>
      <input
        type="checkbox"
        aria-label={props.label}
        checked={props.checked}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-gray-950 disabled:bg-gray-100"
      />
    </label>
  );
}

function TemporaryReplacementSelect(props: {
  label: string;
  value: string;
  row: LocalRow;
  rows: LocalRow[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const options = props.rows
    .filter((row) =>
      isTemporaryReplacementTargetAvailableForRow(
        row,
        props.rows,
        props.row.collaboratorId,
      ),
    )
    .sort(defaultCompareRows);

  return (
    <label>
      <span className="sr-only">{props.label}</span>
      <select
        aria-label={props.label}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
        title={temporaryReplacementTargetTitle(props.value, props.rows)}
        className="w-40 rounded-xl border border-gray-300 bg-white px-2 py-2 text-xs text-gray-900 shadow-sm disabled:bg-gray-100 disabled:text-gray-500"
      >
        <option value="">No temporary replacement</option>
        {options.map((option) => (
          <option key={option.collaboratorId} value={option.collaboratorId}>
            {temporaryReplacementOptionLabel(option)}
          </option>
        ))}
      </select>
    </label>
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
        <option value="ACTIVE" title="A — Active">
          A
        </option>
        <option value="DAY_OFF" title="D — Day Off">
          D
        </option>
        <option value="LEAVE_OF_ABSENCE" title="L — Leave of Absence">
          L
        </option>
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

function referenceFilterOptions(
  options: ReferenceDataItem[],
  allLabel: string,
): { value: string; label: string }[] {
  return [
    { value: "", label: allLabel },
    ...options
      .filter((option) => option.active)
      .sort(bySortOrderThenLabel)
      .map((option) => ({ value: option.id, label: option.label })),
  ];
}

function planningFiltersAreEmpty(filters: PlanningTableFilters) {
  return (
    filters.search.trim() === "" &&
    filters.selection === "ALL" &&
    filters.availability === "ALL" &&
    filters.replacementCandidate === "ALL" &&
    filters.sectorId === "" &&
    filters.locationId === "" &&
    filters.taskId === ""
  );
}

function rowMatchesFilters(row: LocalRow, filters: PlanningTableFilters) {
  const search = filters.search.trim().toLocaleLowerCase();
  if (search) {
    const haystack = [
      row.collaboratorNickname,
      row.collaboratorName,
      row.collaboratorId,
      row.sectorLabel,
      row.locationLabel,
      row.taskLabel,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    if (!haystack.includes(search)) return false;
  }

  if (filters.selection === "SELECTED" && !row.selected) return false;
  if (filters.selection === "UNSELECTED" && row.selected) return false;

  if (
    filters.availability !== "ALL" &&
    normalizePlanningAvailability(row.planningAvailability) !==
      filters.availability
  ) {
    return false;
  }

  if (
    filters.replacementCandidate === "CANDIDATES" &&
    !row.replacementCandidate
  ) {
    return false;
  }
  if (
    filters.replacementCandidate === "NON_CANDIDATES" &&
    row.replacementCandidate
  ) {
    return false;
  }

  if (filters.sectorId && row.sectorId !== filters.sectorId) return false;
  if (filters.locationId && row.locationId !== filters.locationId) return false;
  if (filters.taskId && row.taskId !== filters.taskId) return false;

  return true;
}

function defaultCompareRows(left: LocalRow, right: LocalRow) {
  return (
    compareNumber(left.planningOrder, right.planningOrder) ||
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
    case "replacementCandidate":
      return (
        compareBooleanDesc(
          Boolean(left.replacementCandidate),
          Boolean(right.replacementCandidate),
        ) || defaultCompareRows(left, right)
      );
    case "temporaryReplacement":
      return (
        compareText(
          temporaryReplacementTargetLabel(left),
          temporaryReplacementTargetLabel(right),
        ) || defaultCompareRows(left, right)
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

function compareNumber(left: number | undefined, right: number | undefined) {
  return (left ?? 0) - (right ?? 0);
}

function compareText(left: string | undefined, right: string | undefined) {
  return (left || "").localeCompare(right || "", undefined, {
    sensitivity: "base",
  });
}

function rowNickname(row: LocalRow) {
  return row.collaboratorNickname || row.collaboratorName || row.collaboratorId;
}

function temporaryReplacementTargetLabel(row: LocalRow) {
  return row.temporaryReplacementForCollaboratorId || "";
}

function isTemporaryReplacementTargetAvailableForRow(
  candidate: LocalRow,
  rows: LocalRow[],
  replacementCollaboratorId: string,
) {
  if (candidate.collaboratorId === replacementCollaboratorId) {
    return false;
  }
  if (!isTemporaryReplacementTargetCandidate(candidate)) {
    return false;
  }

  return !rows.some(
    (row) =>
      row.collaboratorId !== replacementCollaboratorId &&
      row.temporaryReplacementForCollaboratorId === candidate.collaboratorId,
  );
}

function isTemporaryReplacementTargetCandidate(row: LocalRow) {
  return isTemporaryReplacementTargetAvailability(row.planningAvailability);
}

function isTemporaryReplacementTargetAvailability(
  value: string | undefined,
): boolean {
  const availability = normalizePlanningAvailability(value);
  return availability === "DAY_OFF" || availability === "LEAVE_OF_ABSENCE";
}

function temporaryReplacementOptionLabel(row: LocalRow) {
  const availability = availabilityLabel(row.planningAvailability).slice(0, 1);
  const selection = row.selected ? "selected" : "not selected";
  return `${rowNickname(row)} · ${availability} · ${selection}`;
}

function temporaryReplacementTargetTitle(value: string, rows: LocalRow[]) {
  const target = rows.find((row) => row.collaboratorId === value);
  return target
    ? `Temporarily replacing ${temporaryReplacementOptionLabel(target)}`
    : "";
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
