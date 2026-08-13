import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPerson,
  createPersonMembership,
  getPerson,
  listPeople,
  listPeoplePage,
  searchGlobalPeople,
  updatePerson,
} from "../../api/people.api";
import type { CreatePersonMembershipInput, PeopleListFilter, PersonInput } from "../../types/people";

export function usePeople(filter: PeopleListFilter = {}) {
  return useQuery({
    queryKey: ["people", filter],
    queryFn: () => listPeople(filter),
  });
}

export function usePeoplePage(filter: PeopleListFilter = {}) {
  return useQuery({
    queryKey: ["people", "page", filter],
    queryFn: () => listPeoplePage(filter),
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
      queryClient.invalidateQueries({
        queryKey: ["collaborators", "candidates"],
      });
    },
  });
}

export function useUpdatePerson(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PersonInput) => updatePerson(id, input),
    onSuccess: (updatedPerson) => {
      queryClient.setQueryData(["people", id], updatedPerson);
      queryClient.invalidateQueries({
        predicate: (query) => {
          const [resource, scope] = query.queryKey;
          return (
            resource === "people" &&
            (scope === "page" || (typeof scope === "object" && scope !== null))
          );
        },
      });
      queryClient.invalidateQueries({
        queryKey: ["collaborators", "candidates"],
      });
    },
  });
}


export function useGlobalPeopleSearch(search: string) {
  const normalized = search.trim();
  return useQuery({
    queryKey: ["people", "global-search", normalized],
    queryFn: () => searchGlobalPeople(normalized),
    enabled: normalized.length >= 3,
  });
}

export function useCreatePersonMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePersonMembershipInput) => createPersonMembership(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people"] });
      queryClient.invalidateQueries({ queryKey: ["collaborators", "candidates"] });
    },
  });
}
