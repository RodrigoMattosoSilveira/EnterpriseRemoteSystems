import { apiFetch } from "./client";
import type {
  ActualStatus,
  SaveWorkPeriodAssignmentInput,
  WorkPeriodAssignment,
  WorkPeriodAssignmentListResponse,
} from "../types/planning";

export function listWorkPeriodAssignments(
  workPeriodId: string,
): Promise<WorkPeriodAssignmentListResponse> {
  return apiFetch<WorkPeriodAssignmentListResponse>(
    `/work-periods/${encodeURIComponent(workPeriodId)}/assignments?pageSize=200`,
  );
}

export function createWorkPeriodAssignment(
  workPeriodId: string,
  input: SaveWorkPeriodAssignmentInput,
): Promise<WorkPeriodAssignment> {
  return apiFetch<WorkPeriodAssignment>(
    `/work-periods/${encodeURIComponent(workPeriodId)}/assignments`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function updateWorkPeriodAssignment(
  assignmentId: string,
  input: SaveWorkPeriodAssignmentInput,
): Promise<WorkPeriodAssignment> {
  return apiFetch<WorkPeriodAssignment>(
    `/work-period-assignments/${encodeURIComponent(assignmentId)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function markWorkPeriodAssignmentOutcome(
  assignmentId: string,
  actualStatus: ActualStatus,
): Promise<WorkPeriodAssignment> {
  return apiFetch<WorkPeriodAssignment>(
    `/work-period-assignments/${encodeURIComponent(assignmentId)}/outcome`,
    { method: "PATCH", body: JSON.stringify({ actualStatus }) },
  );
}

export function deactivateWorkPeriodAssignment(
  assignmentId: string,
): Promise<WorkPeriodAssignment> {
  return apiFetch<WorkPeriodAssignment>(
    `/work-period-assignments/${encodeURIComponent(assignmentId)}/deactivate`,
    { method: "PATCH" },
  );
}
