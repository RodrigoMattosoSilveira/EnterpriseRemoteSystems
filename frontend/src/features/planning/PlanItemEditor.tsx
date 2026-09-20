import { FormEvent, useMemo, useState } from "react";
import { JourneyDaysRemaining } from "../../components/JourneyDaysRemaining";
import type { Collaborator } from "../../types/collaborators";
import type { ReferenceDataItem } from "../../types/referenceData";
import { useI18n } from "../../i18n";
import type {
  PlannedStatus,
  SaveWorkPeriodAssignmentInput,
  WorkPeriodAssignment,
} from "../../types/planning";

export function PlanItemEditor(props: {
  assignment?: WorkPeriodAssignment;
  collaborators: Collaborator[];
  assignments: WorkPeriodAssignment[];
  sectors: ReferenceDataItem[];
  locations: ReferenceDataItem[];
  tasks: ReferenceDataItem[];
  disabled?: boolean;
  pending?: boolean;
  onSave: (input: SaveWorkPeriodAssignmentInput) => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const { assignment } = props;
  const [form, setForm] = useState<SaveWorkPeriodAssignmentInput>({
    collaboratorId: assignment?.collaboratorId ?? "",
    plannedStatus: assignment?.plannedStatus ?? "INCLUDED",
    replacementForAssignmentId: assignment?.replacementForAssignmentId ?? "",
    sectorId: assignment?.sectorId ?? "",
    locationId: assignment?.locationId ?? "",
    taskId: assignment?.taskId ?? "",
  });
  const [error, setError] = useState("");
  const selectedCollaborator = props.collaborators.find(
    (row) => row.id === form.collaboratorId,
  );
  const availableCollaborators = useMemo(() => {
    const assigned = new Set(
      props.assignments
        .filter((row) => row.active && row.id !== assignment?.id)
        .map((row) => row.collaboratorId),
    );
    return props.collaborators.filter((row) => !assigned.has(row.id));
  }, [props.assignments, props.collaborators, assignment?.id]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (
      !form.collaboratorId ||
      !form.sectorId ||
      !form.locationId ||
      !form.taskId
    ) {
      setError(t("planning.editor.validation.required"));
      return;
    }
    props.onSave(form);
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl border bg-gray-50 p-4"
    >
      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <Select
          label={t("planning.editor.collaboratorRequired")}
          value={form.collaboratorId}
          onChange={(value) => setForm({ ...form, collaboratorId: value })}
          disabled={props.disabled}
        >
          <option value="">{t("planning.editor.selectCollaborator")}</option>
          {availableCollaborators.map((row) => (
            <option key={row.id} value={row.id}>
              {collaboratorLabel(row)}
            </option>
          ))}
        </Select>
        <Select
          label={t("planning.editor.plannedStatusRequired")}
          value={form.plannedStatus}
          onChange={(value) =>
            setForm({ ...form, plannedStatus: value as PlannedStatus })
          }
          disabled={props.disabled}
        >
          <option value="INCLUDED">{t("planning.code.INCLUDED")}</option>
          <option value="EXCLUDED">{t("planning.code.EXCLUDED")}</option>
        </Select>
        <Select
          label={t("planning.editor.replacementFor")}
          value={form.replacementForAssignmentId ?? ""}
          onChange={(value) =>
            setForm({ ...form, replacementForAssignmentId: value })
          }
          disabled={props.disabled}
        >
          <option value="">{t("planning.editor.notReplacement")}</option>
          {props.assignments
            .filter((row) => row.active && row.id !== assignment?.id)
            .map((row) => (
              <option key={row.id} value={row.id}>
                {row.collaboratorName ||
                  row.collaboratorNickname ||
                  row.collaboratorId}
              </option>
            ))}
        </Select>
        <Select
          label={t("planning.editor.sectorRequired")}
          value={form.sectorId}
          onChange={(value) => setForm({ ...form, sectorId: value })}
          disabled={props.disabled}
        >
          <option value="">{t("collaborator.selectSector")}</option>
          {active(props.sectors).map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </Select>
        <Select
          label={t("planning.editor.localRequired")}
          value={form.locationId}
          onChange={(value) => setForm({ ...form, locationId: value })}
          disabled={props.disabled}
        >
          <option value="">{t("planning.editor.selectLocal")}</option>
          {active(props.locations).map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </Select>
        <Select
          label={t("planning.editor.taskRequired")}
          value={form.taskId}
          onChange={(value) => setForm({ ...form, taskId: value })}
          disabled={props.disabled}
        >
          <option value="">{t("collaborator.selectTask")}</option>
          {active(props.tasks).map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </Select>
      </div>
      {selectedCollaborator && (
        <JourneyDaysRemaining
          projectedEndDate={selectedCollaborator.projectedEndDate}
          className="block text-sm"
        />
      )}
      <div className="flex justify-end gap-2">
        {props.onCancel && (
          <button
            type="button"
            onClick={props.onCancel}
            className="rounded-xl border px-4 py-2 text-sm font-semibold"
          >
            {t("common.cancel")}
          </button>
        )}
        <button
          disabled={props.disabled || props.pending}
          className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:bg-gray-400"
        >
          {props.pending
            ? t("common.saving")
            : assignment
              ? t("planning.editor.saveAssignment")
              : t("planning.editor.addAssignment")}
        </button>
      </div>
    </form>
  );
}

function Select(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="text-sm font-medium text-gray-700">
      {props.label}
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        disabled={props.disabled}
        className="mt-1 w-full rounded-xl border bg-white px-3 py-2 disabled:bg-gray-100"
      >
        {props.children}
      </select>
    </label>
  );
}
function active(rows: ReferenceDataItem[]) {
  return rows
    .filter((row) => row.active)
    .sort(
      (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
    );
}
function collaboratorLabel(row: Collaborator) {
  return row.personName
    ? `${row.personName}${row.personNickname ? ` (${row.personNickname})` : ""}`
    : row.personNickname || row.id;
}
