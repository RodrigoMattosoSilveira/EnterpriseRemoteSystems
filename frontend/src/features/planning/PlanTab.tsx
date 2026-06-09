import { useState } from "react";
import { JourneyDaysRemaining } from "../../components/JourneyDaysRemaining";
import type { Collaborator } from "../../types/collaborators";
import type { ReferenceDataItem } from "../../types/referenceData";
import type {
  SaveWorkPeriodAssignmentInput,
  WorkPeriodAssignment,
} from "../../types/planning";
import { PlanItemEditor } from "./PlanItemEditor";
import { humanizePlanningCode } from "./planningSchemas";

export function PlanTab(props: {
  assignments: WorkPeriodAssignment[];
  collaborators: Collaborator[];
  sectors: ReferenceDataItem[];
  locations: ReferenceDataItem[];
  tasks: ReferenceDataItem[];
  editable: boolean;
  pending: boolean;
  onCreate: (input: SaveWorkPeriodAssignmentInput) => void;
  onUpdate: (id: string, input: SaveWorkPeriodAssignmentInput) => void;
  onDeactivate: (id: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Plan Assignments</h2>
        <p className="text-sm text-gray-500">
          Include or exclude collaborators and assign their sector, local, and
          task.
        </p>
      </div>
      {props.editable && (
        <PlanItemEditor
          collaborators={props.collaborators}
          assignments={props.assignments}
          sectors={props.sectors}
          locations={props.locations}
          tasks={props.tasks}
          pending={props.pending}
          onSave={props.onCreate}
        />
      )}
      {props.assignments.length === 0 && (
        <div className="rounded-2xl border bg-white p-6 text-center text-sm text-gray-500">
          No assignments yet.
        </div>
      )}
      <div className="space-y-3">
        {props.assignments.map((row) =>
          editing === row.id ? (
            <PlanItemEditor
              key={row.id}
              assignment={row}
              collaborators={props.collaborators}
              assignments={props.assignments}
              sectors={props.sectors}
              locations={props.locations}
              tasks={props.tasks}
              pending={props.pending}
              onCancel={() => setEditing(null)}
              onSave={(input) => {
                props.onUpdate(row.id, input);
                setEditing(null);
              }}
            />
          ) : (
            <article
              key={row.id}
              className="rounded-2xl border bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-semibold text-gray-950">
                    {row.collaboratorName ||
                      row.collaboratorNickname ||
                      row.collaboratorId}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {row.sectorLabel} · {row.locationLabel} · {row.taskLabel}
                  </p>
                  {(() => {
                    const collaborator = props.collaborators.find(
                      (item) => item.id === row.collaboratorId,
                    );
                    return collaborator ? (
                      <JourneyDaysRemaining
                        projectedEndDate={collaborator.projectedEndDate}
                        className="mt-1 block text-xs"
                      />
                    ) : null;
                  })()}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold">
                      {humanizePlanningCode(row.plannedStatus)}
                    </span>
                    {row.replacementForAssignmentId && (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                        Replacement
                      </span>
                    )}
                  </div>
                </div>
                {props.editable && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditing(row.id)}
                      className="rounded-xl border px-3 py-2 text-sm font-semibold"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => props.onDeactivate(row.id)}
                      className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </article>
          ),
        )}
      </div>
    </section>
  );
}
