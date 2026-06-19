export type SecondPersonApprovalPolicy = {
  tenantId: string;
  required: boolean;
  updatedBy?: string;
  updatedAt?: string;
};

export type UpdateSecondPersonApprovalPolicyInput = {
  required: boolean;
};
