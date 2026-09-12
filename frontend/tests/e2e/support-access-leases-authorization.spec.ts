import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import {
  E2E_APPLICATION_ADMIN_ACTOR_ID,
  applicationAdminHeaders,
  authzHeaders,
  e2eApiUrl,
  newApplicationAdminApi,
  newTenantAdminApi,
} from "./support/authz";

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string>;
  };
};

type CurrentActor = {
  actorKey: string;
  actorRecordId: string;
  tenantId: string;
  scope: string;
  personId?: string;
  globalPersonId?: string;
  membershipId?: string;
  collaboratorId?: string;
  roleCodes: string[];
  permissions: string[];
  delegatedPermissions: string[];
  intrinsicPermissions: string[];
  supportLeaseId?: string;
  supportLeaseExpiresAt?: string;
  supportLeasePermissions?: string[];
};

type SupportAccessLease = {
  id: string;
  tenantId: string;
  applicationActorId: string;
  requestedByActorId: string;
  requestedAt: string;
  expiresAt: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "TERMINATED";
  effectiveStatus: "PENDING" | "APPROVED" | "TERMINATED" | "EXPIRED";
  permissions: string[];
  approvedAt?: string;
  approvedByActorId?: string;
  terminatedAt?: string;
  terminatedByActorId?: string;
  terminationReason?: string;
};

type Permission = {
  code: string;
  label: string;
  description: string;
};

type AuditLog = {
  id: string;
  accountId?: string;
  actorId?: string;
  actorRecordId?: string;
  actorScope?: string;
  personId?: string;
  membershipId?: string;
  tenantId?: string;
  sessionId?: string;
  correlationId?: string;
  permissionCode?: string;
  authorizationSource?: string;
  authorizationSourceId?: string;
  authorizationRoleCode?: string;
  supportLeaseId?: string;
  operation: string;
  targetType?: string;
  targetId?: string;
  decision: string;
  requestMethod?: string;
  requestPath?: string;
};

const SUPPORT_TENANT_ID = "e2e-support-lease-tenant";
const OTHER_TENANT_ID = "e2e-support-lease-other-tenant";
const EXPIRED_TENANT_ID = "e2e-support-lease-expired-tenant";

test.describe("Tenant Support Access Lease authorization", () => {
  test("Application Administrator remains GLOBAL-only until an exact-Tenant support lease is approved", async () => {
    const applicationAdminApi = await newApplicationAdminApi();
    const tenantAdminApi = await newTenantAdminApi(SUPPORT_TENANT_ID);

    try {
      await closeOpenLeases(applicationAdminApi, tenantAdminApi, SUPPORT_TENANT_ID);

      const applicationAccountID = await getAuthenticatedAccountID(
        applicationAdminApi,
        "Application Administrator",
      );
      expect(applicationAccountID).toBeTruthy();

      const globalBefore = await getCurrentActor(
        applicationAdminApi,
        applicationTenantHeaders("*"),
      );
      expect(globalBefore.actorKey).toBe(E2E_APPLICATION_ADMIN_ACTOR_ID);
      expect(globalBefore.scope).toBe("APPLICATION");
      expect(globalBefore.tenantId).toBe("*");
      expect(globalBefore.roleCodes).toContain("APPLICATION_ADMIN");
      expect(globalBefore.supportLeaseId).toBeFalsy();
      expect(globalBefore.personId).toBeFalsy();
      expect(globalBefore.globalPersonId).toBeFalsy();
      expect(globalBefore.membershipId).toBeFalsy();
      expect(globalBefore.collaboratorId).toBeFalsy();

      const controlPlaneResponse = await applicationAdminApi.get(
        e2eApiUrl("/api/v1/authz/roles"),
        { headers: applicationTenantHeaders("*") },
      );
      await expectStatus(
        controlPlaneResponse,
        200,
        "GLOBAL Application Administrator may use the authorization control plane",
      );

      const tenantActorResponse = await applicationAdminApi.get(
        e2eApiUrl("/api/v1/authz/current-actor"),
        { headers: applicationTenantHeaders(SUPPORT_TENANT_ID) },
      );
      await expectStatus(
        tenantActorResponse,
        403,
        "Application Administrator must not acquire Tenant identity without an approved support lease",
      );
      await expectErrorCode(tenantActorResponse, "tenant_actor_unavailable");

      const tenantPeopleResponse = await applicationAdminApi.get(
        e2eApiUrl("/api/v1/people?page=1&pageSize=1"),
        { headers: applicationTenantHeaders(SUPPORT_TENANT_ID) },
      );
      await expectStatus(
        tenantPeopleResponse,
        403,
        "GLOBAL Application Administrator must not read Tenant People without an approved support lease",
      );

      const globalAfter = await getCurrentActor(
        applicationAdminApi,
        applicationTenantHeaders("*"),
      );
      expect(globalAfter.actorKey).toBe(globalBefore.actorKey);
      expect(globalAfter.actorRecordId).toBe(globalBefore.actorRecordId);
      expect(globalAfter.scope).toBe("APPLICATION");
      expect(globalAfter.tenantId).toBe("*");
      expect(globalAfter.roleCodes).toEqual(globalBefore.roleCodes);
      expect(globalAfter.supportLeaseId).toBeFalsy();
      expect(globalAfter.personId).toBeFalsy();
      expect(globalAfter.globalPersonId).toBeFalsy();
      expect(globalAfter.membershipId).toBeFalsy();
      expect(globalAfter.collaboratorId).toBeFalsy();
    } finally {
      await closeOpenLeases(applicationAdminApi, tenantAdminApi, SUPPORT_TENANT_ID).catch(
        (error) => {
          console.warn(`Unable to clean an open E2E support lease: ${String(error)}`);
        },
      );
      await tenantAdminApi.dispose();
      await applicationAdminApi.dispose();
    }
  });

  test("approved support lease expires, removes Tenant authority, and preserves exact Account/Actor/Tenant/Lease audit attribution", async () => {
    const applicationAdminApi = await newApplicationAdminApi();
    const expiredTenantAdminApi = await newTenantAdminApi(EXPIRED_TENANT_ID);

    try {
      await closeOpenLeases(
        applicationAdminApi,
        expiredTenantAdminApi,
        EXPIRED_TENANT_ID,
      );

      const applicationAccountID = await getAuthenticatedAccountID(
        applicationAdminApi,
        "Application Administrator",
      );
      const tenantAdminAccountID = await getAuthenticatedAccountID(
        expiredTenantAdminApi,
        "expired-fixture Tenant Administrator",
      );

      const applicationActor = await getCurrentActor(
        applicationAdminApi,
        applicationTenantHeaders("*"),
      );
      expect(applicationActor.actorKey).toBe(E2E_APPLICATION_ADMIN_ACTOR_ID);
      expect(applicationActor.scope).toBe("APPLICATION");
      expect(applicationActor.tenantId).toBe("*");
      expect(applicationActor.roleCodes).toContain("APPLICATION_ADMIN");
      expect(applicationActor.supportLeaseId).toBeFalsy();
      expect(applicationActor.personId).toBeFalsy();
      expect(applicationActor.globalPersonId).toBeFalsy();
      expect(applicationActor.membershipId).toBeFalsy();
      expect(applicationActor.collaboratorId).toBeFalsy();

      const expiredTenantActor = await getCurrentActor(
        expiredTenantAdminApi,
        authzHeaders(EXPIRED_TENANT_ID),
      );
      expect(expiredTenantActor.scope).toBe("TENANT");
      expect(expiredTenantActor.tenantId).toBe(EXPIRED_TENANT_ID);
      expect(expiredTenantActor.roleCodes).toContain("TENANT_ADMIN");
      expect(expiredTenantActor.globalPersonId).toBeTruthy();
      expect(expiredTenantActor.membershipId).toBeTruthy();

      const requestedExpiration = futureTimestampSeconds(8);
      const requestResponse = await applicationAdminApi.post(
        e2eApiUrl("/api/v1/authz/support-access-leases"),
        {
          headers: applicationTenantHeaders("*"),
          data: {
            tenantId: EXPIRED_TENANT_ID,
            expiresAt: requestedExpiration,
            reason: "30L.3 approved support lease expiry verification",
            permissions: ["people.read"],
          },
        },
      );
      await expectStatus(
        requestResponse,
        201,
        "request a short-lived Tenant Support Access Lease",
      );
      const requestCorrelationID = responseCorrelationID(requestResponse);
      const requestedLease = await responseData<SupportAccessLease>(
        requestResponse,
        "request a short-lived Tenant Support Access Lease",
      );
      expect(requestedLease.status).toBe("PENDING");
      expect(requestedLease.effectiveStatus).toBe("PENDING");
      expect(requestedLease.applicationActorId).toBe(applicationActor.actorRecordId);
      expect(requestedLease.requestedByActorId).toBe(applicationActor.actorRecordId);
      expect(requestedLease.expiresAt).toBe(requestedExpiration);
      expect(requestedLease.permissions).toEqual(["people.read"]);

      const approvalResponse = await expiredTenantAdminApi.post(
        e2eApiUrl(
          `/api/v1/authz/support-access-leases/${encodeURIComponent(requestedLease.id)}/approve`,
        ),
        { headers: authzHeaders(EXPIRED_TENANT_ID) },
      );
      await expectStatus(
        approvalResponse,
        200,
        "approve the short-lived Tenant Support Access Lease",
      );
      const approvalCorrelationID = responseCorrelationID(approvalResponse);
      const approvedLease = await responseData<SupportAccessLease>(
        approvalResponse,
        "approve the short-lived Tenant Support Access Lease",
      );
      expect(approvedLease.status).toBe("APPROVED");
      expect(approvedLease.effectiveStatus).toBe("APPROVED");
      expect(approvedLease.approvedByActorId).toBe(expiredTenantActor.actorRecordId);
      expect(approvedLease.expiresAt).toBe(requestedExpiration);

      const leasedActor = await getCurrentActor(
        applicationAdminApi,
        applicationTenantHeaders(EXPIRED_TENANT_ID),
      );
      expect(leasedActor.actorKey).toBe(applicationActor.actorKey);
      expect(leasedActor.actorRecordId).toBe(applicationActor.actorRecordId);
      expect(leasedActor.scope).toBe("APPLICATION");
      expect(leasedActor.tenantId).toBe(EXPIRED_TENANT_ID);
      expect(leasedActor.supportLeaseId).toBe(requestedLease.id);
      expect(leasedActor.supportLeaseExpiresAt).toBe(requestedExpiration);
      expect(leasedActor.supportLeasePermissions).toEqual(["people.read"]);
      expect(leasedActor.personId).toBeFalsy();
      expect(leasedActor.globalPersonId).toBeFalsy();
      expect(leasedActor.membershipId).toBeFalsy();
      expect(leasedActor.collaboratorId).toBeFalsy();

      const auditResponse = await expiredTenantAdminApi.get(
        e2eApiUrl(
          `/api/v1/authz/support-access-leases/${encodeURIComponent(requestedLease.id)}/audit-logs`,
        ),
        { headers: authzHeaders(EXPIRED_TENANT_ID) },
      );
      await expectStatus(
        auditResponse,
        200,
        "read short-lived support lease audit history",
      );
      const auditLogs = await responseData<AuditLog[]>(
        auditResponse,
        "read short-lived support lease audit history",
      );

      const requestAudit = expectLeaseAudit(
        auditLogs,
        requestedLease.id,
        "support_access_leases.request",
        "support_access_leases.request",
        "AUTHORIZED",
        undefined,
        undefined,
        EXPIRED_TENANT_ID,
      );
      expectAuditIdentity(requestAudit, {
        accountId: applicationAccountID,
        actorId: applicationActor.actorKey,
        actorRecordId: applicationActor.actorRecordId,
        actorScope: "APPLICATION",
        tenantId: EXPIRED_TENANT_ID,
        supportLeaseId: requestedLease.id,
        correlationId: requestCorrelationID,
        authorizationSource: "GLOBAL_CONTROL_PLANE",
        authorizationRoleCode: "APPLICATION_ADMIN",
        requireSourceId: true,
        requireSession: true,
      });

      const approvalAudit = expectLeaseAudit(
        auditLogs,
        requestedLease.id,
        "support_access_leases.approve",
        "support_access_leases.approve",
        "AUTHORIZED",
        undefined,
        undefined,
        EXPIRED_TENANT_ID,
      );
      expectAuditIdentity(approvalAudit, {
        accountId: tenantAdminAccountID,
        actorId: expiredTenantActor.actorKey,
        actorRecordId: expiredTenantActor.actorRecordId,
        actorScope: "TENANT",
        personId: expiredTenantActor.globalPersonId,
        membershipId: expiredTenantActor.membershipId,
        tenantId: EXPIRED_TENANT_ID,
        supportLeaseId: requestedLease.id,
        correlationId: approvalCorrelationID,
        authorizationSource: "ROLE_GRANT",
        authorizationRoleCode: "TENANT_ADMIN",
        requireSourceId: true,
        requireSession: true,
      });

      await expect
        .poll(
          async () => {
            const expired = await listLeases(applicationAdminApi, {
              tenantId: EXPIRED_TENANT_ID,
              status: "EXPIRED",
            });
            return expired.find((lease) => lease.id === requestedLease.id)?.effectiveStatus;
          },
          { timeout: 15_000 },
        )
        .toBe("EXPIRED");

      const expired = await listLeases(applicationAdminApi, {
        tenantId: EXPIRED_TENANT_ID,
        status: "EXPIRED",
      });
      const expiredLease = expired.find((lease) => lease.id === requestedLease.id);
      expect(expiredLease).toBeDefined();
      expect(expiredLease?.status).toBe("APPROVED");
      expect(expiredLease?.effectiveStatus).toBe("EXPIRED");
      expect(expiredLease?.expiresAt).toBe(requestedExpiration);
      expect(expiredLease?.permissions).toEqual(["people.read"]);

      const afterExpiryResponse = await applicationAdminApi.get(
        e2eApiUrl("/api/v1/authz/current-actor"),
        { headers: applicationTenantHeaders(EXPIRED_TENANT_ID) },
      );
      await expectStatus(
        afterExpiryResponse,
        403,
        "expired approved support lease must immediately remove Tenant authority",
      );
      await expectErrorCode(afterExpiryResponse, "tenant_actor_unavailable");

      const terminateExpiredResponse = await expiredTenantAdminApi.post(
        e2eApiUrl(
          `/api/v1/authz/support-access-leases/${encodeURIComponent(requestedLease.id)}/terminate`,
        ),
        {
          headers: authzHeaders(EXPIRED_TENANT_ID),
          data: { reason: "Expired leases are already ineffective" },
        },
      );
      await expectStatus(
        terminateExpiredResponse,
        409,
        "an expired approved lease cannot be terminated as though it were still active",
      );
      await expectErrorCode(terminateExpiredResponse, "support_access_lease_expired");

      const finalAuditResponse = await expiredTenantAdminApi.get(
        e2eApiUrl(
          `/api/v1/authz/support-access-leases/${encodeURIComponent(requestedLease.id)}/audit-logs`,
        ),
        { headers: authzHeaders(EXPIRED_TENANT_ID) },
      );
      await expectStatus(
        finalAuditResponse,
        200,
        "read expired support lease audit history",
      );
      const finalAuditLogs = await responseData<AuditLog[]>(
        finalAuditResponse,
        "read expired support lease audit history",
      );
      expect(
        finalAuditLogs.some(
          (entry) =>
            entry.supportLeaseId === requestedLease.id &&
            entry.operation === "support_access_leases.terminate",
        ),
      ).toBe(false);

      // Expiration is an effective state derived from expiresAt. It has no
      // synthetic actor and therefore must not fabricate an actor-attributed
      // lifecycle event. The immutable request and approval audit rows remain
      // the provenance for who created and approved the lease.
      expect(
        finalAuditLogs.some(
          (entry) =>
            entry.supportLeaseId === requestedLease.id &&
            entry.operation === "support_access_leases.request",
        ),
      ).toBe(true);
      expect(
        finalAuditLogs.some(
          (entry) =>
            entry.supportLeaseId === requestedLease.id &&
            entry.operation === "support_access_leases.approve",
        ),
      ).toBe(true);

      const globalAfter = await getCurrentActor(
        applicationAdminApi,
        applicationTenantHeaders("*"),
      );
      expect(globalAfter.actorKey).toBe(applicationActor.actorKey);
      expect(globalAfter.actorRecordId).toBe(applicationActor.actorRecordId);
      expect(globalAfter.scope).toBe("APPLICATION");
      expect(globalAfter.tenantId).toBe("*");
      expect(globalAfter.supportLeaseId).toBeFalsy();
      expect(globalAfter.personId).toBeFalsy();
      expect(globalAfter.globalPersonId).toBeFalsy();
      expect(globalAfter.membershipId).toBeFalsy();
      expect(globalAfter.collaboratorId).toBeFalsy();
    } finally {
      await expiredTenantAdminApi.dispose();
      await applicationAdminApi.dispose();
    }
  });

  test("request through termination enforces lease allowlist, Tenant isolation, control-plane denial, audit attribution, and identity non-mutation", async () => {
    const applicationAdminApi = await newApplicationAdminApi();
    const tenantAdminApi = await newTenantAdminApi(SUPPORT_TENANT_ID);
    const otherTenantAdminApi = await newTenantAdminApi(OTHER_TENANT_ID);

    try {
      await closeOpenLeases(applicationAdminApi, tenantAdminApi, SUPPORT_TENANT_ID);

      const applicationAccountID = await getAuthenticatedAccountID(
        applicationAdminApi,
        "Application Administrator",
      );
      const tenantAdminAccountID = await getAuthenticatedAccountID(
        tenantAdminApi,
        "support-Tenant Administrator",
      );

      const globalBefore = await getCurrentActor(
        applicationAdminApi,
        applicationTenantHeaders("*"),
      );
      expect(globalBefore.actorKey).toBe(E2E_APPLICATION_ADMIN_ACTOR_ID);
      expect(globalBefore.scope).toBe("APPLICATION");
      expect(globalBefore.tenantId).toBe("*");
      expect(globalBefore.roleCodes).toContain("APPLICATION_ADMIN");
      expect(globalBefore.personId).toBeFalsy();
      expect(globalBefore.globalPersonId).toBeFalsy();
      expect(globalBefore.membershipId).toBeFalsy();
      expect(globalBefore.collaboratorId).toBeFalsy();

      const tenantAdminActor = await getCurrentActor(
        tenantAdminApi,
        authzHeaders(SUPPORT_TENANT_ID),
      );
      expect(tenantAdminActor.scope).toBe("TENANT");
      expect(tenantAdminActor.tenantId).toBe(SUPPORT_TENANT_ID);
      expect(tenantAdminActor.roleCodes).toContain("TENANT_ADMIN");
      expect(tenantAdminActor.globalPersonId).toBeTruthy();
      expect(tenantAdminActor.membershipId).toBeTruthy();

      const eligibleResponse = await applicationAdminApi.get(
        e2eApiUrl("/api/v1/authz/support-access-leases/eligible-permissions"),
        { headers: applicationTenantHeaders("*") },
      );
      await expectStatus(
        eligibleResponse,
        200,
        "list eligible Tenant Support Access Lease permissions",
      );
      const eligibleEnvelope = (await eligibleResponse.json()) as ApiEnvelope<Permission[]>;
      const eligibleCodes = (eligibleEnvelope.data ?? []).map((permission) => permission.code);
      expect(eligibleCodes).toContain("people.read");
      expect(eligibleCodes).not.toContain("authz.read");
      expect(eligibleCodes).not.toContain("authz.manage");
      expect(eligibleCodes).not.toContain("support_access_leases.approve");

      const invalidPermissionResponse = await applicationAdminApi.post(
        e2eApiUrl("/api/v1/authz/support-access-leases"),
        {
          headers: applicationTenantHeaders("*"),
          data: {
            tenantId: OTHER_TENANT_ID,
            expiresAt: futureTimestamp(15),
            reason: "E2E must reject application control-plane authority in a Tenant support lease",
            permissions: ["authz.read"],
          },
        },
      );
      await expectStatus(
        invalidPermissionResponse,
        400,
        "reject a control-plane permission from the Tenant support allowlist",
      );
      await expectValidationField(invalidPermissionResponse, "permissions");

      const requestedExpiration = futureTimestamp(15);
      const requestResponse = await applicationAdminApi.post(
        e2eApiUrl("/api/v1/authz/support-access-leases"),
        {
          headers: applicationTenantHeaders("*"),
          data: {
            tenantId: SUPPORT_TENANT_ID,
            expiresAt: requestedExpiration,
            reason: "E2E authorization coverage for exact-Tenant temporary support",
            permissions: ["people.read"],
          },
        },
      );
      await expectStatus(requestResponse, 201, "request Tenant support access");
      const requestCorrelationID = responseCorrelationID(requestResponse);
      const requestedLease = await responseData<SupportAccessLease>(
        requestResponse,
        "request Tenant support access",
      );
      expect(requestedLease.tenantId).toBe(SUPPORT_TENANT_ID);
      expect(requestedLease.status).toBe("PENDING");
      expect(requestedLease.effectiveStatus).toBe("PENDING");
      expect(requestedLease.permissions).toEqual(["people.read"]);
      expect(requestedLease.applicationActorId).toBe(globalBefore.actorRecordId);
      expect(requestedLease.requestedByActorId).toBe(globalBefore.actorRecordId);
      expect(requestedLease.expiresAt).toBe(requestedExpiration);

      const duplicateResponse = await applicationAdminApi.post(
        e2eApiUrl("/api/v1/authz/support-access-leases"),
        {
          headers: applicationTenantHeaders("*"),
          data: {
            tenantId: SUPPORT_TENANT_ID,
            expiresAt: futureTimestamp(20),
            reason: "Duplicate E2E request must be rejected",
            permissions: ["people.read"],
          },
        },
      );
      await expectStatus(duplicateResponse, 409, "reject duplicate open support request");
      await expectErrorCode(duplicateResponse, "support_access_lease_conflict");

      const applicationSelfApproval = await applicationAdminApi.post(
        e2eApiUrl(
          `/api/v1/authz/support-access-leases/${encodeURIComponent(requestedLease.id)}/approve`,
        ),
        { headers: applicationTenantHeaders("*") },
      );
      await expectStatus(
        applicationSelfApproval,
        403,
        "Application Administrator must not approve its own Tenant support request",
      );
      await expectErrorCode(applicationSelfApproval, "forbidden");

      const wrongTenantApproval = await otherTenantAdminApi.post(
        e2eApiUrl(
          `/api/v1/authz/support-access-leases/${encodeURIComponent(requestedLease.id)}/approve`,
        ),
        { headers: authzHeaders(OTHER_TENANT_ID) },
      );
      await expectStatus(
        wrongTenantApproval,
        403,
        "reject approval by a Tenant Administrator from another Tenant",
      );
      await expectErrorCode(wrongTenantApproval, "forbidden");

      const approvalResponse = await tenantAdminApi.post(
        e2eApiUrl(
          `/api/v1/authz/support-access-leases/${encodeURIComponent(requestedLease.id)}/approve`,
        ),
        { headers: authzHeaders(SUPPORT_TENANT_ID) },
      );
      await expectStatus(approvalResponse, 200, "approve support access in the exact Tenant");
      const approvalCorrelationID = responseCorrelationID(approvalResponse);
      const approvedLease = await responseData<SupportAccessLease>(
        approvalResponse,
        "approve support access in the exact Tenant",
      );
      expect(approvedLease.status).toBe("APPROVED");
      expect(approvedLease.effectiveStatus).toBe("APPROVED");
      expect(approvedLease.expiresAt).toBe(requestedExpiration);
      expect(approvedLease.permissions).toEqual(["people.read"]);

      const leasedActor = await getCurrentActor(
        applicationAdminApi,
        applicationTenantHeaders(SUPPORT_TENANT_ID),
      );
      expect(leasedActor.actorKey).toBe(globalBefore.actorKey);
      expect(leasedActor.actorRecordId).toBe(globalBefore.actorRecordId);
      expect(leasedActor.scope).toBe("APPLICATION");
      expect(leasedActor.tenantId).toBe(SUPPORT_TENANT_ID);
      expect(leasedActor.roleCodes).toContain("APPLICATION_ADMIN");
      expect(leasedActor.supportLeaseId).toBe(requestedLease.id);
      expect(leasedActor.supportLeaseExpiresAt).toBe(requestedExpiration);
      expect(leasedActor.supportLeasePermissions).toEqual(["people.read"]);
      expect(leasedActor.personId).toBeFalsy();
      expect(leasedActor.globalPersonId).toBeFalsy();
      expect(leasedActor.membershipId).toBeFalsy();
      expect(leasedActor.collaboratorId).toBeFalsy();

      const peopleResponse = await applicationAdminApi.get(
        e2eApiUrl("/api/v1/people?page=1&pageSize=1"),
        { headers: applicationTenantHeaders(SUPPORT_TENANT_ID) },
      );
      await expectStatus(
        peopleResponse,
        200,
        "lease-backed Application Administrator may use the leased people.read permission",
      );
      const peopleCorrelationID = responseCorrelationID(peopleResponse);

      const expensesResponse = await applicationAdminApi.get(
        e2eApiUrl("/api/v1/expenses?page=1&pageSize=1"),
        { headers: applicationTenantHeaders(SUPPORT_TENANT_ID) },
      );
      await expectStatus(
        expensesResponse,
        403,
        "lease-backed Application Administrator must not use an unleased Tenant permission",
      );
      await expectErrorCode(expensesResponse, "forbidden");
      const expensesCorrelationID = responseCorrelationID(expensesResponse);

      const controlPlaneResponse = await applicationAdminApi.get(
        e2eApiUrl("/api/v1/authz/roles"),
        { headers: applicationTenantHeaders(SUPPORT_TENANT_ID) },
      );
      await expectStatus(
        controlPlaneResponse,
        403,
        "lease-backed Application Administrator must not use global authorization administration",
      );
      await expectErrorCode(controlPlaneResponse, "forbidden");
      const controlPlaneCorrelationID = responseCorrelationID(controlPlaneResponse);

      const otherTenantResponse = await applicationAdminApi.get(
        e2eApiUrl("/api/v1/authz/current-actor"),
        { headers: applicationTenantHeaders(OTHER_TENANT_ID) },
      );
      await expectStatus(
        otherTenantResponse,
        403,
        "a lease for one Tenant must not resolve support authority in another Tenant",
      );
      await expectErrorCode(otherTenantResponse, "tenant_actor_unavailable");

      const auditResponse = await tenantAdminApi.get(
        e2eApiUrl(
          `/api/v1/authz/support-access-leases/${encodeURIComponent(requestedLease.id)}/audit-logs`,
        ),
        { headers: authzHeaders(SUPPORT_TENANT_ID) },
      );
      await expectStatus(
        auditResponse,
        200,
        "exact-Tenant Administrator may review lease-specific audit history",
      );
      const auditLogs = await responseData<AuditLog[]>(
        auditResponse,
        "read lease-specific support audit history",
      );
      const requestAudit = expectLeaseAudit(
        auditLogs,
        requestedLease.id,
        "support_access_leases.request",
        "support_access_leases.request",
        "AUTHORIZED",
      );
      expectAuditIdentity(requestAudit, {
        accountId: applicationAccountID,
        actorId: globalBefore.actorKey,
        actorRecordId: globalBefore.actorRecordId,
        actorScope: "APPLICATION",
        tenantId: SUPPORT_TENANT_ID,
        supportLeaseId: requestedLease.id,
        correlationId: requestCorrelationID,
        authorizationSource: "GLOBAL_CONTROL_PLANE",
        authorizationRoleCode: "APPLICATION_ADMIN",
        requireSourceId: true,
        requireSession: true,
      });
      expect(requestAudit.personId).toBeFalsy();
      expect(requestAudit.membershipId).toBeFalsy();

      const approvalAudit = expectLeaseAudit(
        auditLogs,
        requestedLease.id,
        "support_access_leases.approve",
        "support_access_leases.approve",
        "AUTHORIZED",
      );
      expectAuditIdentity(approvalAudit, {
        accountId: tenantAdminAccountID,
        actorId: tenantAdminActor.actorKey,
        actorRecordId: tenantAdminActor.actorRecordId,
        actorScope: "TENANT",
        personId: tenantAdminActor.globalPersonId,
        membershipId: tenantAdminActor.membershipId,
        tenantId: SUPPORT_TENANT_ID,
        supportLeaseId: requestedLease.id,
        correlationId: approvalCorrelationID,
        authorizationSource: "ROLE_GRANT",
        authorizationRoleCode: "TENANT_ADMIN",
        requireSourceId: true,
        requireSession: true,
      });

      const peopleAudit = expectLeaseAudit(
        auditLogs,
        requestedLease.id,
        "support_access.use",
        "people.read",
        "AUTHORIZED",
        "GET",
        "/api/v1/people",
      );
      expectAuditIdentity(peopleAudit, {
        accountId: applicationAccountID,
        actorId: globalBefore.actorKey,
        actorRecordId: globalBefore.actorRecordId,
        actorScope: "APPLICATION",
        tenantId: SUPPORT_TENANT_ID,
        supportLeaseId: requestedLease.id,
        correlationId: peopleCorrelationID,
        authorizationSource: "SUPPORT_LEASE",
        authorizationSourceId: requestedLease.id,
        requireSession: true,
      });
      expect(peopleAudit.accountId).toBe(requestAudit.accountId);
      expect(peopleAudit.sessionId).toBe(requestAudit.sessionId);

      const expensesAudit = expectLeaseAudit(
        auditLogs,
        requestedLease.id,
        "support_access.use",
        "expenses.read",
        "DENIED",
        "GET",
        "/api/v1/expenses",
      );
      expectAuditIdentity(expensesAudit, {
        accountId: applicationAccountID,
        actorId: globalBefore.actorKey,
        actorRecordId: globalBefore.actorRecordId,
        actorScope: "APPLICATION",
        tenantId: SUPPORT_TENANT_ID,
        supportLeaseId: requestedLease.id,
        correlationId: expensesCorrelationID,
        authorizationSource: "NONE",
        requireSession: true,
      });

      const controlPlaneAudit = expectLeaseAudit(
        auditLogs,
        requestedLease.id,
        "support_access.use",
        "authz.read",
        "DENIED",
        "GET",
        "/api/v1/authz/roles",
      );
      expectAuditIdentity(controlPlaneAudit, {
        accountId: applicationAccountID,
        actorId: globalBefore.actorKey,
        actorRecordId: globalBefore.actorRecordId,
        actorScope: "APPLICATION",
        tenantId: SUPPORT_TENANT_ID,
        supportLeaseId: requestedLease.id,
        correlationId: controlPlaneCorrelationID,
        authorizationSource: "GLOBAL_CONTROL_PLANE",
        authorizationRoleCode: "APPLICATION_ADMIN",
        requireSourceId: true,
        requireSession: true,
      });

      const terminationResponse = await tenantAdminApi.post(
        e2eApiUrl(
          `/api/v1/authz/support-access-leases/${encodeURIComponent(requestedLease.id)}/terminate`,
        ),
        {
          headers: authzHeaders(SUPPORT_TENANT_ID),
          data: { reason: "E2E authorization lifecycle complete" },
        },
      );
      await expectStatus(terminationResponse, 200, "terminate the approved support lease");
      const terminationCorrelationID = responseCorrelationID(terminationResponse);
      const terminatedLease = await responseData<SupportAccessLease>(
        terminationResponse,
        "terminate the approved support lease",
      );
      expect(terminatedLease.status).toBe("TERMINATED");
      expect(terminatedLease.effectiveStatus).toBe("TERMINATED");
      expect(terminatedLease.expiresAt).toBe(requestedExpiration);

      const finalAuditResponse = await tenantAdminApi.get(
        e2eApiUrl(
          `/api/v1/authz/support-access-leases/${encodeURIComponent(requestedLease.id)}/audit-logs`,
        ),
        { headers: authzHeaders(SUPPORT_TENANT_ID) },
      );
      await expectStatus(finalAuditResponse, 200, "read terminated lease audit history");
      const finalAuditLogs = await responseData<AuditLog[]>(
        finalAuditResponse,
        "read terminated lease audit history",
      );
      const terminationAudit = expectLeaseAudit(
        finalAuditLogs,
        requestedLease.id,
        "support_access_leases.terminate",
        "support_access_leases.terminate",
        "AUTHORIZED",
      );
      expectAuditIdentity(terminationAudit, {
        accountId: tenantAdminAccountID,
        actorId: tenantAdminActor.actorKey,
        actorRecordId: tenantAdminActor.actorRecordId,
        actorScope: "TENANT",
        personId: tenantAdminActor.globalPersonId,
        membershipId: tenantAdminActor.membershipId,
        tenantId: SUPPORT_TENANT_ID,
        supportLeaseId: requestedLease.id,
        correlationId: terminationCorrelationID,
        authorizationSource: "ROLE_GRANT",
        authorizationRoleCode: "TENANT_ADMIN",
        requireSourceId: true,
        requireSession: true,
      });
      expect(terminationAudit.accountId).toBe(approvalAudit.accountId);
      expect(terminationAudit.sessionId).toBe(approvalAudit.sessionId);

      const applicationAttributedAudit = await listAuditLogs(applicationAdminApi, {
        accountId: applicationAccountID,
        actorId: globalBefore.actorKey,
        tenantId: SUPPORT_TENANT_ID,
        supportLeaseId: requestedLease.id,
      });
      expect(applicationAttributedAudit.length).toBeGreaterThanOrEqual(4);
      expect(
        applicationAttributedAudit.every(
          (entry) =>
            entry.accountId === applicationAccountID &&
            entry.actorId === globalBefore.actorKey &&
            entry.tenantId === SUPPORT_TENANT_ID &&
            entry.supportLeaseId === requestedLease.id,
        ),
      ).toBe(true);
      expect(
        applicationAttributedAudit.some(
          (entry) =>
            entry.operation === "support_access_leases.request" &&
            entry.decision === "AUTHORIZED",
        ),
      ).toBe(true);
      expect(
        applicationAttributedAudit.some(
          (entry) =>
            entry.operation === "support_access.use" &&
            entry.permissionCode === "people.read" &&
            entry.decision === "AUTHORIZED",
        ),
      ).toBe(true);
      expect(
        applicationAttributedAudit.some(
          (entry) =>
            entry.operation === "support_access.use" &&
            entry.permissionCode === "expenses.read" &&
            entry.decision === "DENIED",
        ),
      ).toBe(true);

      const tenantAdminAttributedAudit = await listAuditLogs(applicationAdminApi, {
        accountId: tenantAdminAccountID,
        actorId: tenantAdminActor.actorKey,
        tenantId: SUPPORT_TENANT_ID,
        supportLeaseId: requestedLease.id,
      });
      expect(tenantAdminAttributedAudit.length).toBeGreaterThanOrEqual(2);
      expect(
        tenantAdminAttributedAudit.every(
          (entry) =>
            entry.accountId === tenantAdminAccountID &&
            entry.actorId === tenantAdminActor.actorKey &&
            entry.tenantId === SUPPORT_TENANT_ID &&
            entry.supportLeaseId === requestedLease.id,
        ),
      ).toBe(true);
      expect(
        tenantAdminAttributedAudit.some(
          (entry) =>
            entry.operation === "support_access_leases.approve" &&
            entry.decision === "AUTHORIZED",
        ),
      ).toBe(true);
      expect(
        tenantAdminAttributedAudit.some(
          (entry) =>
            entry.operation === "support_access_leases.terminate" &&
            entry.decision === "AUTHORIZED",
        ),
      ).toBe(true);

      const afterTerminationResponse = await applicationAdminApi.get(
        e2eApiUrl("/api/v1/authz/current-actor"),
        { headers: applicationTenantHeaders(SUPPORT_TENANT_ID) },
      );
      await expectStatus(
        afterTerminationResponse,
        403,
        "terminated support lease must immediately remove Tenant authority",
      );
      await expectErrorCode(afterTerminationResponse, "tenant_actor_unavailable");

      const globalAfter = await getCurrentActor(
        applicationAdminApi,
        applicationTenantHeaders("*"),
      );
      expect(globalAfter.actorKey).toBe(globalBefore.actorKey);
      expect(globalAfter.actorRecordId).toBe(globalBefore.actorRecordId);
      expect(globalAfter.scope).toBe("APPLICATION");
      expect(globalAfter.tenantId).toBe("*");
      expect(globalAfter.roleCodes).toEqual(globalBefore.roleCodes);
      expect(globalAfter.personId).toBeFalsy();
      expect(globalAfter.globalPersonId).toBeFalsy();
      expect(globalAfter.membershipId).toBeFalsy();
      expect(globalAfter.collaboratorId).toBeFalsy();
      expect(globalAfter.supportLeaseId).toBeFalsy();
    } finally {
      await closeOpenLeases(applicationAdminApi, tenantAdminApi, SUPPORT_TENANT_ID).catch(
        (error) => {
          console.warn(`Unable to clean an open E2E support lease: ${String(error)}`);
        },
      );
      await otherTenantAdminApi.dispose();
      await tenantAdminApi.dispose();
      await applicationAdminApi.dispose();
    }
  });
});

function applicationTenantHeaders(tenantId: string): Record<string, string> {
  return {
    ...applicationAdminHeaders(),
    "X-Tenant-ID": tenantId,
  };
}

function futureTimestamp(minutes: number): string {
  return futureTimestampSeconds(minutes * 60);
}

function futureTimestampSeconds(seconds: number): string {
  const nowToSecond = Math.floor(Date.now() / 1000) * 1000;
  return new Date(nowToSecond + seconds * 1_000).toISOString().replace(".000Z", "Z");
}

async function getCurrentActor(
  api: APIRequestContext,
  headers: Record<string, string>,
): Promise<CurrentActor> {
  const response = await api.get(e2eApiUrl("/api/v1/authz/current-actor"), { headers });
  await expectStatus(response, 200, "resolve current authorization actor");
  return responseData<CurrentActor>(response, "resolve current authorization actor");
}

async function getAuthenticatedAccountID(
  api: APIRequestContext,
  context: string,
): Promise<string> {
  const response = await api.get(e2eApiUrl("/api/v1/auth/session"));
  await expectStatus(response, 200, `resolve ${context} Authentication Account`);
  const session = await responseData<{ accountId?: string }>(
    response,
    `resolve ${context} Authentication Account`,
  );
  const accountID = session.accountId?.trim() ?? "";
  expect(accountID, `${context} session must expose its Authentication Account ID`).not.toBe("");
  return accountID;
}

async function listLeases(
  api: APIRequestContext,
  filter: { tenantId?: string; status?: string },
): Promise<SupportAccessLease[]> {
  const query = new URLSearchParams();
  if (filter.tenantId) query.set("tenantId", filter.tenantId);
  if (filter.status) query.set("status", filter.status);
  const response = await api.get(
    e2eApiUrl(`/api/v1/authz/support-access-leases?${query.toString()}`),
    { headers: applicationTenantHeaders("*") },
  );
  await expectStatus(response, 200, "list Tenant Support Access Leases");
  return responseArray<SupportAccessLease>(response, "list Tenant Support Access Leases");
}

async function listAuditLogs(
  api: APIRequestContext,
  filter: {
    accountId?: string;
    actorId?: string;
    tenantId?: string;
    supportLeaseId?: string;
  },
): Promise<AuditLog[]> {
  const query = new URLSearchParams();
  if (filter.accountId) query.set("accountId", filter.accountId);
  if (filter.actorId) query.set("actorId", filter.actorId);
  if (filter.tenantId) query.set("tenantId", filter.tenantId);
  if (filter.supportLeaseId) query.set("supportLeaseId", filter.supportLeaseId);

  const response = await api.get(
    e2eApiUrl(`/api/v1/authz/audit-logs?${query.toString()}`),
    { headers: applicationTenantHeaders("*") },
  );
  await expectStatus(response, 200, "list authorization audit logs by attribution");
  return responseArray<AuditLog>(response, "list authorization audit logs by attribution");
}

async function closeOpenLeases(
  applicationAdminApi: APIRequestContext,
  tenantAdminApi: APIRequestContext,
  tenantId: string,
): Promise<void> {
  const leases = await listLeases(applicationAdminApi, { tenantId });
  for (const lease of leases) {
    if (lease.effectiveStatus !== "PENDING" && lease.effectiveStatus !== "APPROVED") {
      continue;
    }

    if (lease.effectiveStatus === "PENDING") {
      const approval = await tenantAdminApi.post(
        e2eApiUrl(
          `/api/v1/authz/support-access-leases/${encodeURIComponent(lease.id)}/approve`,
        ),
        { headers: authzHeaders(tenantId) },
      );
      if (approval.status() === 409) {
        continue;
      }
      await expectStatus(approval, 200, `clean up pending support lease ${lease.id}`);
    }

    const termination = await tenantAdminApi.post(
      e2eApiUrl(
        `/api/v1/authz/support-access-leases/${encodeURIComponent(lease.id)}/terminate`,
      ),
      {
        headers: authzHeaders(tenantId),
        data: { reason: "Playwright deterministic fixture cleanup" },
      },
    );
    if (termination.status() === 409) {
      continue;
    }
    await expectStatus(termination, 200, `clean up approved support lease ${lease.id}`);
  }
}

function expectLeaseAudit(
  logs: AuditLog[],
  leaseId: string,
  operation: string,
  permissionCode: string,
  decision: string,
  requestMethod?: string,
  requestPath?: string,
  expectedTenantId = SUPPORT_TENANT_ID,
): AuditLog {
  const entry = logs.find(
    (candidate) =>
      candidate.supportLeaseId === leaseId &&
      candidate.operation === operation &&
      candidate.permissionCode === permissionCode &&
      candidate.decision === decision &&
      (!requestMethod || candidate.requestMethod === requestMethod) &&
      (!requestPath || candidate.requestPath === requestPath),
  );
  expect(
    entry,
    `expected ${decision} ${operation} audit for ${permissionCode} on lease ${leaseId}`,
  ).toBeDefined();
  expect(entry?.tenantId).toBe(expectedTenantId);
  return entry as AuditLog;
}

type AuditIdentityExpectation = {
  accountId: string;
  actorId: string;
  actorRecordId: string;
  actorScope: string;
  personId?: string;
  membershipId?: string;
  tenantId: string;
  supportLeaseId: string;
  correlationId: string;
  authorizationSource: string;
  authorizationSourceId?: string;
  authorizationRoleCode?: string;
  requireSourceId?: boolean;
  requireSession?: boolean;
};

function expectAuditIdentity(entry: AuditLog, expected: AuditIdentityExpectation): void {
  expect(entry.accountId).toBe(expected.accountId);
  expect(entry.actorId).toBe(expected.actorId);
  expect(entry.actorRecordId).toBe(expected.actorRecordId);
  expect(entry.actorScope).toBe(expected.actorScope);
  expect(entry.tenantId).toBe(expected.tenantId);
  expect(entry.supportLeaseId).toBe(expected.supportLeaseId);
  expect(entry.correlationId).toBe(expected.correlationId);
  expect(entry.authorizationSource).toBe(expected.authorizationSource);
  if (expected.personId !== undefined) expect(entry.personId).toBe(expected.personId);
  if (expected.membershipId !== undefined) expect(entry.membershipId).toBe(expected.membershipId);
  if (expected.authorizationSourceId !== undefined) {
    expect(entry.authorizationSourceId).toBe(expected.authorizationSourceId);
  }
  if (expected.authorizationRoleCode !== undefined) {
    expect(entry.authorizationRoleCode).toBe(expected.authorizationRoleCode);
  }
  if (expected.requireSourceId) expect(entry.authorizationSourceId).toBeTruthy();
  if (expected.requireSession) {
    expect(entry.sessionId).toBeTruthy();
  }
}

function responseCorrelationID(response: APIResponse): string {
  const correlationID = response.headers()["x-correlation-id"]?.trim() ?? "";
  expect(correlationID, "expected server-generated X-Correlation-ID response header").not.toBe("");
  return correlationID;
}

async function responseArray<T>(
  response: APIResponse,
  context: string,
): Promise<T[]> {
  const payload = (await response.json()) as unknown;
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const candidate of [record.data, record.items, record.leases]) {
      if (Array.isArray(candidate)) {
        return candidate as T[];
      }
    }
    if (!record.error) {
      // The generic Go response currently uses `omitempty` for data, so a
      // successful empty slice is serialized as {}. Match the production
      // frontend normalizer and preserve the endpoint's logical [] contract.
      return [];
    }
  }
  throw new Error(`${context}: response did not contain a lease array`);
}

async function responseData<T>(response: APIResponse, context: string): Promise<T> {
  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (envelope.data === undefined) {
    throw new Error(`${context}: response did not include data`);
  }
  return envelope.data;
}

async function expectStatus(
  response: APIResponse,
  expectedStatus: number,
  context: string,
): Promise<void> {
  if (response.status() !== expectedStatus) {
    throw new Error(
      `${context}: expected HTTP ${expectedStatus}, got ${response.status()} ${await response.text()}`,
    );
  }
}

async function expectErrorCode(response: APIResponse, expectedCode: string): Promise<void> {
  const body = (await response.json()) as ApiEnvelope<unknown>;
  expect(body.error?.code).toBe(expectedCode);
}

async function expectValidationField(response: APIResponse, fieldName: string): Promise<void> {
  const body = (await response.json()) as ApiEnvelope<unknown>;
  expect(body.error?.fields?.[fieldName]).toBeTruthy();
}
