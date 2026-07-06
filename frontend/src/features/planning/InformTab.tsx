import type {
  WorkPlanRoster,
  WorkPeriod,
  WorkPeriodAssignment,
} from "../../types/planning";
import { humanizePlanningCode } from "./planningSchemas";

export function InformTab(props: {
  workPeriod: WorkPeriod;
  roster?: WorkPlanRoster;
  loading: boolean;
  pending: boolean;
  unreplacedAbsentees?: WorkPeriodAssignment[];
  onInform: () => void;
}) {
  const canInform = props.workPeriod.status === "PLANNING";
  const unreplacedAbsentees = props.unreplacedAbsentees ?? [];
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Inform Collaborators</h2>
          <p className="text-sm text-gray-500">
            Review the included roster, then print and post it at the Canteen.
          </p>
        </div>
        <div className="flex gap-2">
          {canInform && (
            <button
              onClick={props.onInform}
              disabled={props.pending}
              className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:bg-gray-400"
            >
              {props.pending ? "Informing..." : "Mark as Informed"}
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="rounded-xl border px-4 py-2 text-sm font-semibold"
          >
            Print Work Plan
          </button>
        </div>
      </div>
      {unreplacedAbsentees.length > 0 && (
        <div
          className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 print:hidden"
          role="alert"
        >
          <p className="font-semibold">
            Warning: time-off collaborators without replacements
          </p>
          <p className="mt-1">
            Before informing or printing, review these Day Off / Leave of
            Absence collaborators that do not have a replacement in this Work
            Period:
          </p>
          <ul className="mt-2 list-disc pl-5">
            {unreplacedAbsentees.map((row) => (
              <li key={row.id}>
                {row.collaboratorNickname ||
                  row.collaboratorName ||
                  row.collaboratorId}{" "}
                — {humanizePlanningCode(row.planningAvailability)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="rounded-2xl border bg-white p-5 shadow-sm print:border-0 print:shadow-none">
        {props.loading ? (
          <p>Loading roster...</p>
        ) : (
          <>
            <div className="border-b pb-4 text-center">
              <h3 className="text-2xl font-bold">
                {props.roster?.title ?? "Work Plan"}
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                {props.roster?.subtitle ??
                  `${props.workPeriod.workDate} — ${props.workPeriod.name}`}
              </p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {humanizePlanningCode(props.workPeriod.status)}
              </p>
            </div>
            <table className="mt-4 w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">Name</th>
                  <th className="py-2">Sector</th>
                  <th className="py-2">Local</th>
                  <th className="py-2">Task</th>
                </tr>
              </thead>
              <tbody>
                {(props.roster?.rows ?? []).map((row) => (
                  <tr key={row.assignmentId} className="border-b last:border-0">
                    <td className="py-3 font-medium">
                      {row.name}
                      {row.nickname ? ` (${row.nickname})` : ""}
                    </td>
                    <td>{row.sectorLabel}</td>
                    <td>{row.locationLabel}</td>
                    <td>{row.taskLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(props.roster?.rows.length ?? 0) === 0 && (
              <p className="py-8 text-center text-sm text-gray-500">
                No included collaborators.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
