import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPerson,
  getPerson,
  listPeople,
  updatePerson,
} from "../../api/people.api";
import type { PeopleListFilter, PersonInput } from "../../types/people";

export function usePeople(filter: PeopleListFilter = {}) {
  return useQuery({
    queryKey: ["people", filter],
    queryFn: () => listPeople(filter),
  });
}

export function usePerson(id: string) {
  return useQuery({
    queryKey: ["people", id],
    queryFn: () => getPerson(id),
    enabled: Boolean(id),
  });
}

export function useCreatePerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PersonInput) => createPerson(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people"] });
    },
  });
}

export function useUpdatePerson(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PersonInput) => updatePerson(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people"] });
      queryClient.invalidateQueries({ queryKey: ["people", id] });
    },
  });
}