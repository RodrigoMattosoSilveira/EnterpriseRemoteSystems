export const REFERENCE_DATA_TYPES = [
  { value: "person_status", label: "Person Statuses" },
  { value: "collaborator_status", label: "Collaborator Statuses" },
  { value: "method", label: "Payment Methods" },
  { value: "sector", label: "Sectors" },
  { value: "location", label: "Locations" },
  { value: "task", label: "Tasks" },
] as const;

export type ReferenceDataType = (typeof REFERENCE_DATA_TYPES)[number]["value"];

export type ReferenceDataItem = {
  id: string;
  tenantId: string;
  type: string;
  code: string;
  label: string;
  description?: string;
  active: boolean;
  sortOrder: number;
  metadataJson?: string;
};

export type ReferenceDataInput = {
  code: string;
  label: string;
  description?: string;
  active?: boolean;
  sortOrder: number;
  metadataJson?: string;
};

export function referenceDataTypeLabel(type: string) {
  return REFERENCE_DATA_TYPES.find((option) => option.value === type)?.label ?? type;
}
