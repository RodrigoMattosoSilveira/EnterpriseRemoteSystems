export type ProfileCompletionStatus =
  | "PERSONAL_ONLY"
  | "INCOMPLETE"
  | "COMPLETE";

export type Person = {
  id: string;
  globalPersonId?: string;
  membershipId?: string;
  tenantId?: string;

  firstName: string;
  lastName: string;
  nickname: string;

  cpf: string;
  rg: string;
  cellular: string;
  email: string;

  street1?: string;
  street2?: string;
  state?: string;
  cep?: string;
  city?: string;
  country: "Brasil";

  bankName?: string;
  bankNumber?: string;
  checkingAccount?: string;
  pixKey?: string;

  emergencyName?: string;
  emergencyCellular?: string;
  emergencyEmail?: string;

  profileCompletionStatus: ProfileCompletionStatus;
  canCreateCollaborator: boolean;
  missingSections?: string[];

  statusId: string;
  statusLabel?: string;
  notes?: string;

  createdAt?: string;
  updatedAt?: string;
};

export type CreatePersonInput = {
  firstName: string;
  lastName: string;
  nickname: string;

  cpf: string;
  rg: string;
  cellular: string;
  email: string;

  statusId: string;
  notes?: string;
};

export type UpdatePersonInput = {
  firstName: string;
  lastName: string;
  nickname: string;

  cpf: string;
  rg: string;
  cellular: string;
  email: string;

  street1?: string;
  street2?: string;
  state?: string;
  cep?: string;
  city?: string;
  country?: "Brasil";

  bankName?: string;
  bankNumber?: string;
  checkingAccount?: string;
  pixKey?: string;

  emergencyName?: string;
  emergencyCellular?: string;
  emergencyEmail?: string;

  statusId: string;
  notes?: string;
};

export type PersonInput = CreatePersonInput | UpdatePersonInput;

export type PeopleListResponse = {
  items: Person[];
  total: number;
};

export type PeopleListFilter = {
  search?: string;
  statusId?: string;
  profileCompletionStatus?: ProfileCompletionStatus;
  canCreateCollaborator?: boolean;
  page?: number;
  pageSize?: number;
};
export type GlobalPersonSearchResult = {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string;
  cpf: string;
  rg: string;
  cellular: string;
  email: string;
};

export type GlobalPeopleSearchResponse = {
  items: GlobalPersonSearchResult[];
  total: number;
};

export type CreatePersonMembershipInput = {
  personId: string;
  statusId: string;
  notes?: string;
};
