import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createWorkPeriod,
  getWorkPeriod,
  getWorkPlanRoster,
  informWorkPeriod,
  listWorkPeriods,
} from "../../api/workPeriods.api";
import {
  bulkPlanWorkPeriodAssignments,
  createWorkPeriodAssignment,
  deactivateWorkPeriodAssignment,
  getWorkPeriodPlanningTemplate,
  listWorkPeriodAssignments,
  markWorkPeriodAssignmentOutcome,
  refineWorkPeriodPlanAssignment,
  updateWorkPeriodAssignment,
} from "../../api/planning.api";
import type {
  ActualStatus,
  BulkPlanWorkPeriodAssignmentsInput,
  CreateWorkPeriodInput,
  PlanAssignmentRefinementInput,
  SaveWorkPeriodAssignmentInput,
  WorkPeriodListFilter,
} from "../../types/planning";

export const workPeriodKeys = {
  all: ["work-periods"] as const,
  list: (filter: WorkPeriodListFilter = {}) =>
    ["work-periods", "list", filter] as const,
  detail: (id: string) => ["work-periods", "detail", id] as const,
  assignments: (id: string) => ["work-periods", id, "assignments"] as const,
  roster: (id: string) => ["work-periods", id, "roster"] as const,
  planningTemplate: (id: string) =>
    ["work-periods", id, "planning-template"] as const,
};

export function useWorkPeriods(filter: WorkPeriodListFilter = {}) {
  return useQuery({
    queryKey: workPeriodKeys.list(filter),
    queryFn: () => listWorkPeriods(filter),
  });
}

export function useWorkPeriod(id: string) {
  return useQuery({
    queryKey: workPeriodKeys.detail(id),
    queryFn: () => getWorkPeriod(id),
    enabled: Boolean(id),
  });
}

export function useCreateWorkPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkPeriodInput) => createWorkPeriod(input),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: workPeriodKeys.all });
      queryClient.setQueryData(workPeriodKeys.detail(row.id), row);
    },
  });
}

export function useAssignments(workPeriodId: string) {
  return useQuery({
    queryKey: workPeriodKeys.assignments(workPeriodId),
    queryFn: () => listWorkPeriodAssignments(workPeriodId),
    enabled: Boolean(workPeriodId),
  });
}

export function usePlanningTemplate(workPeriodId: string) {
  return useQuery({
    queryKey: workPeriodKeys.planningTemplate(workPeriodId),
    queryFn: () => getWorkPeriodPlanningTemplate(workPeriodId),
    enabled: Boolean(workPeriodId),
  });
}

export function useBulkPlanAssignments(workPeriodId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkPlanWorkPeriodAssignmentsInput) =>
      bulkPlanWorkPeriodAssignments(workPeriodId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: workPeriodKeys.assignments(workPeriodId),
      });
      queryClient.invalidateQueries({
        queryKey: workPeriodKeys.planningTemplate(workPeriodId),
      });
      queryClient.invalidateQueries({
        queryKey: workPeriodKeys.roster(workPeriodId),
      });
    },
  });
}

export function useRefinePlanAssignment(workPeriodId: string) {
  return useMutation({
    mutationFn: (input: PlanAssignmentRefinementInput) =>
      refineWorkPeriodPlanAssignment(workPeriodId, input),
  });
}

export function useCreateAssignment(workPeriodId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveWorkPeriodAssignmentInput) =>
      createWorkPeriodAssignment(workPeriodId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: workPeriodKeys.assignments(workPeriodId),
      }),
  });
}

export function useUpdateAssignment(workPeriodId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      assignmentId,
      input,
    }: {
      assignmentId: string;
      input: SaveWorkPeriodAssignmentInput;
    }) => updateWorkPeriodAssignment(assignmentId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: workPeriodKeys.assignments(workPeriodId),
      });
      queryClient.invalidateQueries({
        queryKey: workPeriodKeys.roster(workPeriodId),
      });
    },
  });
}

export function useDeactivateAssignment(workPeriodId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deactivateWorkPeriodAssignment,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: workPeriodKeys.assignments(workPeriodId),
      }),
  });
}

export function useMarkOutcome(workPeriodId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      assignmentId,
      actualStatus,
    }: {
      assignmentId: string;
      actualStatus: ActualStatus;
    }) => markWorkPeriodAssignmentOutcome(assignmentId, actualStatus),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: workPeriodKeys.assignments(workPeriodId),
      }),
  });
}

export function useInformWorkPeriod(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => informWorkPeriod(id),
    onSuccess: (row) => {
      queryClient.setQueryData(workPeriodKeys.detail(id), row);
      queryClient.invalidateQueries({ queryKey: workPeriodKeys.all });
      queryClient.invalidateQueries({ queryKey: workPeriodKeys.roster(id) });
    },
  });
}

export function useWorkPlanRoster(id: string, enabled = true) {
  return useQuery({
    queryKey: workPeriodKeys.roster(id),
    queryFn: () => getWorkPlanRoster(id),
    enabled: Boolean(id) && enabled,
  });
}
