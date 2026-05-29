import { apiFetch } from "./client";
import type { ReferenceDataInput, ReferenceDataItem } from "../types/referenceData";

export function listReferenceDataByType(type: string): Promise<ReferenceDataItem[]> {
  return apiFetch<ReferenceDataItem[]>(`/reference-data/${encodeURIComponent(type)}`);
}

export function createReferenceDataItem(
  type: string,
  input: ReferenceDataInput
): Promise<ReferenceDataItem> {
  return apiFetch<ReferenceDataItem>(`/reference-data/${encodeURIComponent(type)}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateReferenceDataItem(
  type: string,
  id: string,
  input: ReferenceDataInput
): Promise<ReferenceDataItem> {
  return apiFetch<ReferenceDataItem>(
    `/reference-data/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    }
  );
}

export function deactivateReferenceDataItem(
  type: string,
  id: string
): Promise<ReferenceDataItem> {
  return apiFetch<ReferenceDataItem>(
    `/reference-data/${encodeURIComponent(type)}/${encodeURIComponent(id)}/deactivate`,
    { method: "PATCH" }
  );
}

export function reactivateReferenceDataItem(
  type: string,
  id: string
): Promise<ReferenceDataItem> {
  return apiFetch<ReferenceDataItem>(
    `/reference-data/${encodeURIComponent(type)}/${encodeURIComponent(id)}/reactivate`,
    { method: "PATCH" }
  );
}
