/*
 * Bite 30G + 30G.1/2/3 manual-promotion DevTools helper.
 * Default fixture batch: manual30g
 *
 * Paste into DevTools Console after signing in. The helper uses the current
 * authenticated session and explicit X-Tenant-ID. It never spoofs X-Actor-*.
 */
(() => {
  const IDS = Object.freeze({
    password: "Manual-30C-Password!",
    operatorLogin: "manual30g.operator@example.test",
    identityALogin: "manual30g.identity-a@example.test",
    identityBLogin: "manual30g.identity-b@example.test",
    identityCLogin: "manual30g.identity-c@example.test",
    identityMLogin: "manual30g.identity-m@example.test",
    identityHLogin: "manual30g.identity-h@example.test",
    identityRLogin: "manual30g.identity-r@example.test",
    earningsOperatorLogin: "manual30g.identity-earnings@example.test",

    personA: "manual30g-global-person-a",
    personB: "manual30g-global-person-b",
    personC: "manual30g-global-person-c",
    personM: "manual30g-global-person-m",
    personH: "manual30g-global-person-h",
    personR: "manual30g-global-person-r",

    membershipA_TenantA: "manual30g-membership-a-tenant-a",
    membershipA_TenantB: "manual30g-membership-a-tenant-b",
    membershipB: "manual30g-membership-b-tenant-a",
    membershipC: "manual30g-membership-c-tenant-a",
    membershipM: "manual30g-membership-m-tenant-a",
    membershipH: "manual30g-membership-h-tenant-a",
    membershipR: "manual30g-membership-r-tenant-a",

    journeyA1Closed: "manual30g-journey-a1-closed",
    journeyA2Open: "manual30g-journey-a2-open",
    journeyA_TenantB: "manual30g-journey-a-tenant-b-open",
    journeyB1Positive: "manual30g-journey-b1-positive",
    journeyC1Negative: "manual30g-journey-c1-negative",
    journeyM1Mixed: "manual30g-journey-m1-mixed",
    journeyH1Closed: "manual30g-journey-h1-closed",
    journeyR1Open: "manual30g-journey-r1-open",

    workPeriodA: "manual30g-work-period-tenant-a",
    workPeriodB: "manual30g-work-period-tenant-b",
  });

  const unwrap = (json) =>
    json && typeof json === "object" && Object.prototype.hasOwnProperty.call(json, "data")
      ? json.data
      : json;

  async function api(path, { method = "GET", tenantId, body, headers = {} } = {}) {
    const requestHeaders = { "Content-Type": "application/json", ...headers };
    if (tenantId) requestHeaders["X-Tenant-ID"] = tenantId;
    const res = await fetch(`/api/v1${path}`, {
      method,
      credentials: "same-origin",
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let raw = null;
    try { raw = text ? JSON.parse(text) : null; } catch { raw = text; }
    const result = {
      ok: res.ok,
      status: res.status,
      url: res.url,
      data: unwrap(raw),
      error: raw?.error ?? null,
      raw,
    };
    console.log(`${method} ${path} -> ${res.status}`, result);
    return result;
  }

  function apiFailureMessage(result, path) {
    if (result.status === 502) {
      return [
        `Backend API is unavailable through the Vite proxy while calling ${path}.`,
        "HTTP 502 from localhost:5173 means Vite could not reach the backend target (normally 127.0.0.1:8080).",
        "Start or restart the backend from the project root with: make local-backend",
        "Then rerun the helper call. This is not a Tenant eligibility failure.",
      ].join(" ");
    }
    if (result.status === 401) {
      return `Authentication is required before calling ${path}. Sign in with the intended manual-test identity and retry.`;
    }
    const detail = result.error?.message ?? result.error?.code ?? result.raw ?? "no response body";
    return `${path} failed with HTTP ${result.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
  }

  async function tenantOptions() {
    const result = await api("/auth/tenant-options");
    if (!result.ok) {
      throw new Error(apiFailureMessage(result, "/auth/tenant-options"));
    }
    const options = Array.isArray(result.data) ? result.data : (result.data?.items ?? []);
    console.table(options.map((x) => ({
      id: x.id, code: x.code, name: x.name,
      roles: (x.roleCodes ?? []).join(","), actor: x.actorRecordId ?? "",
    })));
    return options;
  }

  async function tenants() {
    const options = await tenantOptions();
    const tenantA = options.find((x) => /byte 28a manual test|bite 28a manual test/i.test(x.name))
      ?? options.find((x) => /MANUAL30G/i.test(x.code));
    const tenantB = options.find((x) => x.id === "default" || /^default$/i.test(x.code));
    if (!tenantA) throw new Error("Tenant A (Byte 28A Manual Test) is not available to this account");
    if (!tenantB) throw new Error("Tenant B (default) is not available to this account");
    return { tenantA, tenantB };
  }

  async function useTenant(which) {
    const { tenantA, tenantB } = await tenants();
    const t = String(which).toUpperCase() === "A" ? tenantA : tenantB;
    localStorage.setItem("ers.auth.selectedTenantId", t.id);
    console.log(`Selected ${String(which).toUpperCase()} -> ${t.name} [${t.id}]. Reloading...`);
    location.reload();
  }

  async function reference(type, code, tenantId) {
    const result = await api(`/reference-data/${encodeURIComponent(type)}`, { tenantId });
    if (!result.ok) return null;
    const rows = Array.isArray(result.data) ? result.data : [];
    const found = rows.find((x) => String(x.code).toUpperCase() === String(code).toUpperCase());
    if (!found) throw new Error(`Reference ${type}/${code} was not found in tenant ${tenantId}`);
    return found;
  }

  const currentAccount = (collaboratorId, tenantId) =>
    api(`/collaborators/${encodeURIComponent(collaboratorId)}/current-account?page=1&pageSize=200`, { tenantId });

  const projection = (collaboratorId, tenantId) =>
    api(`/collaborators/${encodeURIComponent(collaboratorId)}/financial-projection`, { tenantId });

  const settlementPreview = (collaboratorId, tenantId) =>
    api(`/collaborators/${encodeURIComponent(collaboratorId)}/settlement-preview`, { tenantId });

  const selfJourneys = (tenantId) => api("/collaborators/self", { tenantId });
  const selfJourney = (collaboratorId, tenantId) => api(`/collaborators/self/${encodeURIComponent(collaboratorId)}`, { tenantId });
  const selfService = () => api("/auth/self-service");

  const receipt = (ledgerEntryId, tenantId, selfServiceRead = false) =>
    api(`/ledger-entries/${encodeURIComponent(ledgerEntryId)}/receipt${selfServiceRead ? "/self" : ""}`, { tenantId });

  const acceptReceipt = (ledgerEntryId, tenantId, notes = "Bite 30G manual promotion acceptance") =>
    api(`/ledger-entries/${encodeURIComponent(ledgerEntryId)}/receipt/accept`, {
      method: "POST", tenantId, body: { confirm: true, notes },
    });

  async function createExpense({ collaboratorId, amount, description, tenantId }) {
    const [category, unit] = await Promise.all([
      reference("expense_category", "OTHER", tenantId),
      reference("value_unit", "BRL", tenantId),
    ]);
    const result = await api("/expenses", {
      method: "POST",
      tenantId,
      body: {
        collaboratorId,
        expenseCategoryId: category.id,
        valueUnitId: unit.id,
        amount,
        expenseDate: new Date().toISOString().slice(0, 10),
        description,
      },
    });
    if (result.ok) {
      window.ERS30G_LAST_EXPENSE = result.data;
      console.log("Saved as window.ERS30G_LAST_EXPENSE", result.data);
    }
    return result;
  }

  async function updateExpense(expense, collaboratorId, description, tenantId) {
    const source = typeof expense === "string"
      ? (await api(`/expenses/${encodeURIComponent(expense)}`, { tenantId })).data
      : expense;
    if (!source?.id) throw new Error("Pass an Expense object or Expense ID");
    const result = await api(`/expenses/${encodeURIComponent(source.id)}`, {
      method: "PUT",
      tenantId,
      body: {
        collaboratorId,
        expenseCategoryId: source.expenseCategoryId,
        valueUnitId: source.valueUnitId,
        amount: source.amount,
        expenseDate: source.expenseDate,
        description,
      },
    });
    if (result.ok) {
      window.ERS30G_LAST_EXPENSE = result.data;
      console.log("Updated window.ERS30G_LAST_EXPENSE", result.data);
    }
    return result;
  }

  async function createAccrual(workPeriodId, tenantId, notes) {
    const result = await api(`/work-periods/${encodeURIComponent(workPeriodId)}/accrual-runs`, {
      method: "POST", tenantId, body: { notes },
    });
    if (result.ok) {
      window.ERS30G_LAST_ACCRUAL_RUN = result.data;
      console.log("Saved as window.ERS30G_LAST_ACCRUAL_RUN", result.data);
    }
    return result;
  }

  async function postAccrual(runId, tenantId) {
    const id = runId ?? window.ERS30G_LAST_ACCRUAL_RUN?.id;
    if (!id) throw new Error("Run ID is required (or call createAccrual first)");
    return api(`/accrual-runs/${encodeURIComponent(id)}/post`, { method: "POST", tenantId, body: {} });
  }

  const extendJourney = (collaboratorId, additionalDays, tenantId) =>
    api(`/collaborators/${encodeURIComponent(collaboratorId)}/extend`, {
      method: "POST", tenantId, body: { additionalDays },
    });

  async function createJourneyB2(tenantId) {
    const [method, sector, locationRef, task, status] = await Promise.all([
      reference("method", "DAILY_WAGES", tenantId),
      reference("sector", "MANUAL30G", tenantId),
      reference("location", "MANUAL30G", tenantId),
      reference("task", "MANUAL30G", tenantId),
      reference("collaborator_status", "ACTIVE", tenantId),
    ]);
    const result = await api("/collaborators", {
      method: "POST",
      tenantId,
      body: {
        membershipId: IDS.membershipB,
        journeyStartDate: new Date().toISOString().slice(0, 10),
        paymentMethodId: method.id,
        paymentValue: 45,
        dailyBrlAmount: 45,
        planningAvailability: "ACTIVE",
        sectorId: sector.id,
        locationId: locationRef.id,
        taskId: task.id,
        statusId: status.id,
        notes: "30G B2 after fully settled B1",
      },
    });
    if (result.ok) {
      window.ERS30G_JOURNEY_B2 = result.data;
      console.log("Saved as window.ERS30G_JOURNEY_B2", result.data);
    }
    return result;
  }

  async function snapshot() {
    const { tenantA, tenantB } = await tenants();
    const [aA, aB, aProjection, bPreview, cPreview, mPreview] = await Promise.all([
      currentAccount(IDS.journeyA2Open, tenantA.id),
      currentAccount(IDS.journeyA_TenantB, tenantB.id),
      projection(IDS.journeyA2Open, tenantA.id),
      settlementPreview(IDS.journeyB1Positive, tenantA.id),
      settlementPreview(IDS.journeyC1Negative, tenantA.id),
      settlementPreview(IDS.journeyM1Mixed, tenantA.id),
    ]);
    return { tenants: { tenantA, tenantB }, aTenantA: aA, aTenantB: aB, aProjection, bPreview, cPreview, mPreview };
  }

  window.ERS30G = Object.freeze({
    IDS, api, tenantOptions, tenants, useTenant, reference, apiFailureMessage,
    currentAccount, projection, settlementPreview,
    selfJourneys, selfJourney, selfService,
    receipt, acceptReceipt,
    createExpense, updateExpense, createAccrual, postAccrual,
    extendJourney, createJourneyB2, snapshot,
  });

  console.log("ERS30G final helper installed as window.ERS30G");
  console.log("Start with: await ERS30G.tenants() or await ERS30G.snapshot()");
})();
