import { useEffect, useMemo, useState } from "react";
import { JourneyDaysRemaining } from "../../components/JourneyDaysRemaining";
import type { ReferenceDataItem } from "../../types/referenceData";
import type {
  BulkPlanWorkPeriodAssignmentsInput,
  WorkPeriodPlanningTemplate,
  WorkPeriodPlanningTemplateRow,
} from "../../types/planning";

type SortKey = "selected" | "nickname" | "sector" | "location" | "task";
type SortDirection = "asc" | "desc";

type LocalRow = WorkPeriodPlanningTemplateRow;

export function PlanTab(props: {
  template?: WorkPeriodPlanningTemplate;
  sectors: ReferenceDataItem[];
  locations: ReferenceDataItem[];
  tasks: ReferenceDataItem[];
  editable: boolean;
  loading: boolean;
  pending: boolean;
  onBulkPlan: (input: BulkPlanWorkPeriodAssignmentsInput) => void;
}) {
  const [rows, setRows] = useState<LocalRow[]>([]);
  const [sort, setSort] = useState<{
    key: SortKey;
    direction: SortDirection;
  } | null>(null);

  useEffect(() => {
    setRows(props.template?.rows ?? []);
  }, [props.template]);

  const selectedCount = rows.filter((row) => row.selected).length;
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
        .filter((row) => row.selected)
        .map((row) => ({
          collaboratorId: row.collaboratorId,
          selected: true,
          sectorId: row.sectorId,
          locationId: row.locationId,
          taskId: row.taskId,
        })),
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Plan Assignments</h2>
          <p className="text-sm text-gray-500">
            Select collaborators for this Work Period. New plans start from the
            most recent Work Period with the same period code. Saving applies
            the selected rows only; unselected rows are ignored.
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
              props.loading ||
              selectedCount === 0
            }
            className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:bg-gray-400"
          >
            {props.pending
              ? "Saving plan..."
              : `Plan selected collaborators (${selectedCount})`}
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
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <SortableHeader
                    label="Selected"
                    active={sort?.key === "selected"}
                    direction={sort?.direction}
                    onClick={() => toggleSort("selected")}
                  />
                  <SortableHeader
                    label="Nickname"
                    active={sort?.key === "nickname"}
                    direction={sort?.direction}
                    onClick={() => toggleSort("nickname")}
                  />
                  <th className="px-4 py-3">Projected Journey End</th>
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
                    <td className="px-4 py-3 align-top">
                      <label className="inline-flex items-center gap-2 font-medium text-gray-700">
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
                        {row.selected ? "Selected" : "Not selected"}
                      </label>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="font-semibold text-gray-950">
                        {row.collaboratorNickname ||
                          row.collaboratorName ||
                          row.collaboratorId}
                      </div>
                      {row.collaboratorName &&
                        row.collaboratorName !== row.collaboratorNickname && (
                          <div className="text-xs text-gray-500">
                            {row.collaboratorName}
                          </div>
                        )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <JourneyDaysRemaining
                        projectedEndDate={row.projectedEndDate || ""}
                        className="text-xs"
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <ReferenceSelect
                        label={`Sector for ${row.collaboratorNickname || row.collaboratorName || row.collaboratorId}`}
                        value={row.sectorId}
                        options={props.sectors}
                        disabled={
                          !props.editable || props.pending || !row.selected
                        }
                        onChange={(sectorId) =>
                          updateRow(row.collaboratorId, { sectorId })
                        }
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <ReferenceSelect
                        label={`Local for ${row.collaboratorNickname || row.collaboratorName || row.collaboratorId}`}
                        value={row.locationId}
                        options={props.locations}
                        disabled={
                          !props.editable || props.pending || !row.selected
                        }
                        onChange={(locationId) =>
                          updateRow(row.collaboratorId, { locationId })
                        }
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <ReferenceSelect
                        label={`Task for ${row.collaboratorNickname || row.collaboratorName || row.collaboratorId}`}
                        value={row.taskId}
                        options={props.tasks}
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
    </section>
  );
}

function SortableHeader(props: {
  label: string;
  active: boolean;
  direction?: SortDirection;
  onClick: () => void;
}) {
  return (
    <th className="px-4 py-3">
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

function ReferenceSelect(props: {
  label: string;
  value: string;
  options: ReferenceDataItem[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="sr-only">{props.label}</span>
      <select
        aria-label={props.label}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
        className="w-44 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm disabled:bg-gray-100 disabled:text-gray-500"
      >
        {props.options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
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
