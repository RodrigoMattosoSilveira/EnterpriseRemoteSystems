import { apiFetch } from "./client";
import type {
  CreatePersonInput,
  CreatePersonMembershipInput,
  GlobalPeopleSearchResponse,
  PeopleListFilter,
  PeopleListResponse,
  Person,
  UpdatePersonInput,
} from "../types/people";

export async function listPeople(
  filter: PeopleListFilter = {},
): Promise<Person[]> {
  const response = await listPeoplePage(filter);
  return response.items;
}

export async function listPeoplePage(
  filter: PeopleListFilter = {},
): Promise<PeopleListResponse> {
  const searchParams = peopleListSearchParams(filter);
  const queryString = searchParams.toString();
  const response = await apiFetch<PeopleListResponse | Person[]>(
    queryString ? `/people?${queryString}` : "/people",
  );

  if (Array.isArray(response)) {
    return { items: response, total: response.length };
  }

  return {
    items: response.items ?? [],
    total: Number(response.total ?? response.items?.length ?? 0),
  };
}

export function getPerson(id: string): Promise<Person> {
  return apiFetch<Person>(`/people/${id}`);
}

export function createPerson(input: CreatePersonInput): Promise<Person> {
  return apiFetch<Person>("/people", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updatePerson(
  id: string,
  input: UpdatePersonInput,
): Promise<Person> {
  return apiFetch<Person>(`/people/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

function peopleListSearchParams(filter: PeopleListFilter) {
  const searchParams = new URLSearchParams();

  if (filter.search) {
    searchParams.set("search", filter.search);
  }
  if (filter.statusId) {
    searchParams.set("statusId", filter.statusId);
  }
  if (filter.profileCompletionStatus) {
    searchParams.set(
      "profileCompletionStatus",
      filter.profileCompletionStatus,
    );
  }
  if (filter.canCreateCollaborator !== undefined) {
    searchParams.set(
      "canCreateCollaborator",
      String(filter.canCreateCollaborator),
    );
  }
  if (filter.page !== undefined) {
    searchParams.set("page", String(filter.page));
  }
  if (filter.pageSize !== undefined) {
    searchParams.set("pageSize", String(filter.pageSize));
  }

  return searchParams;
}


export function searchGlobalPeople(search: string): Promise<GlobalPeopleSearchResponse> {
  const params = new URLSearchParams({ search: search.trim(), page: "1", pageSize: "25" });
  return apiFetch<GlobalPeopleSearchResponse>(`/people/global?${params.toString()}`);
}

export function createPersonMembership(input: CreatePersonMembershipInput): Promise<Person> {
  return apiFetch<Person>("/people/memberships", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
