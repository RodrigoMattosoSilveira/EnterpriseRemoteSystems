import { apiFetch } from "./client";
import type {
  CreatePersonInput,
  PeopleListFilter,
  PeopleListResponse,
  Person,
  UpdatePersonInput,
} from "../types/people";

export async function listPeople(
  filter: PeopleListFilter = {},
): Promise<Person[]> {
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

  const queryString = searchParams.toString();
  const response = await apiFetch<PeopleListResponse | Person[]>(
    queryString ? `/people?${queryString}` : "/people",
  );

  if (Array.isArray(response)) {
    return response;
  }

  return response.items ?? [];
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
  input: UpdatePersonInput
): Promise<Person> {
  return apiFetch<Person>(`/people/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}