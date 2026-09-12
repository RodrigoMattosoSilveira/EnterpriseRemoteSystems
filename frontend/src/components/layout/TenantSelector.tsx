import { useEffect, useMemo, useRef, useState } from "react";

import type { AuthTenantOption } from "../../types/auth";

export function TenantSelector({
  tenants,
  selectedTenantId,
  onTenantChange,
  onRefreshTenants,
}: {
  tenants: AuthTenantOption[];
  selectedTenantId: string;
  onTenantChange: (tenantId: string) => void;
  onRefreshTenants?: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId);
  const globalAdministration = tenants.some((tenant) => tenant.id === "*");
  const contextNoun = globalAdministration ? "context" : "tenant";
  const contextNounPlural = globalAdministration ? "contexts" : "tenants";
  const selectorLabel = globalAdministration ? "Administration context" : "Tenant";
  const currentContextLabel = globalAdministration
    ? "Current administration context"
    : "Current tenant";
  const filterLabel = globalAdministration ? "Filter contexts" : "Filter tenants";
  const filteredTenants = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query.trim());
    if (!normalizedQuery) return tenants;

    return tenants.filter((tenant) =>
      normalizeSearchText(
        `${tenant.name} ${tenant.code} ${tenant.id} ${tenant.actorKey ?? ""} ${tenant.membershipId ?? ""}`,
      ).includes(normalizedQuery),
    );
  }, [query, tenants]);

  useEffect(() => {
    if (!open) return;
    filterRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeDropdown();
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  async function openDropdown() {
    setQuery("");
    setActiveIndex(Math.max(0, tenants.findIndex((tenant) => tenant.id === selectedTenantId)));
    setOpen(true);

    if (!onRefreshTenants) return;

    // The Actor/Membership catalog can change in another administrator session.
    // Never expose the cached option list as authoritative when the user opens
    // the selector; refresh it before enabling selection.
    setRefreshing(true);
    try {
      await onRefreshTenants();
    } finally {
      setRefreshing(false);
    }
  }

  function closeDropdown({ restoreFocus = false } = {}) {
    setOpen(false);
    setQuery("");
    if (restoreFocus) triggerRef.current?.focus();
  }

  function chooseTenant(tenant: AuthTenantOption) {
    closeDropdown({ restoreFocus: true });
    if (tenant.id !== selectedTenantId) onTenantChange(tenant.id);
  }

  function handleFilterKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) =>
        filteredTenants.length === 0 ? 0 : (current + 1) % filteredTenants.length,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        filteredTenants.length === 0
          ? 0
          : (current - 1 + filteredTenants.length) % filteredTenants.length,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const tenant = filteredTenants[activeIndex];
      if (tenant) chooseTenant(tenant);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeDropdown({ restoreFocus: true });
    }
  }

  const selectedLabel = selectedTenant
    ? `${selectedTenant.name} (${selectedTenant.code})`
    : `Choose ${contextNoun}`;

  return (
    <div ref={rootRef} className="relative">
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-600">
        {selectorLabel}
      </p>
      <button
        ref={triggerRef}
        type="button"
        aria-label={currentContextLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-selected-tenant-id={selectedTenantId}
        onClick={() => (open ? closeDropdown() : void openDropdown())}
        className="flex min-w-[18rem] items-center justify-between gap-4 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-left shadow-sm transition hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500"
      >
        <span className="min-w-0">
          <span className="block truncate text-base font-bold text-slate-950">
            {selectedTenant?.name ?? `Choose ${contextNoun}`}
          </span>
          <span className="block truncate text-sm font-semibold text-slate-600">
            {selectedTenant?.code ?? `No active ${contextNoun}`}
          </span>
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={`h-5 w-5 shrink-0 text-slate-600 transition ${open ? "rotate-180" : ""}`}
        >
          <path
            d="m5 7.5 5 5 5-5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      </button>

      {open && (
        <section
          aria-label={`${selectorLabel} selection`}
          className="absolute right-0 z-50 mt-2 w-[28rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-xl"
        >
          <div className="border-b border-slate-200 p-3">
            <label className="grid gap-1.5 text-sm font-bold text-slate-800">
              {filterLabel}
              <input
                ref={filterRef}
                type="search"
                role="combobox"
                aria-label={filterLabel}
                aria-autocomplete="list"
                aria-controls="tenant-options"
                aria-expanded="true"
                aria-activedescendant={
                  filteredTenants[activeIndex]
                    ? tenantOptionId(filteredTenants[activeIndex].id)
                    : undefined
                }
                value={query}
                disabled={refreshing}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleFilterKeyDown}
                placeholder={selectedLabel}
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-base text-slate-950 shadow-sm outline-none placeholder:text-slate-500 focus:border-slate-500 focus:ring-2 focus:ring-slate-300"
              />
            </label>
            <p className="mt-2 text-sm font-medium text-slate-600" aria-live="polite">
              {refreshing
                ? `Refreshing available ${contextNounPlural}…`
                : `${filteredTenants.length} of ${tenants.length} ${contextNounPlural}`}
            </p>
            {!globalAdministration && (
              <p className="mt-1 text-xs font-medium text-slate-500">
                Each tenant below is available through a separate active Actor and Membership owned by this Authentication Account.
              </p>
            )}
          </div>

          <div id="tenant-options" role="listbox" className="max-h-80 overflow-y-auto p-2">
            {refreshing ? (
              <p
                role="status"
                className="px-3 py-6 text-center text-base font-medium text-slate-600"
              >
                Refreshing your available {contextNounPlural}…
              </p>
            ) : filteredTenants.length === 0 ? (
              <p className="px-3 py-6 text-center text-base font-medium text-slate-600">
                No {contextNounPlural} match “{query}”.
              </p>
            ) : (
              filteredTenants.map((tenant, index) => {
                const selected = tenant.id === selectedTenantId;
                const active = index === activeIndex;

                return (
                  <button
                    key={tenant.id}
                    id={tenantOptionId(tenant.id)}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    data-tenant-id={tenant.id}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => chooseTenant(tenant)}
                    className={`flex w-full items-center justify-between gap-4 rounded-xl px-3 py-3 text-left transition ${
                      active ? "bg-slate-100" : "hover:bg-slate-50"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-base font-bold text-slate-950">
                        {tenant.name}
                      </span>
                      <span className="block truncate text-sm font-semibold text-slate-600">
                        {tenant.code}
                      </span>
                      {tenant.actorScope === "TENANT" && tenant.actorKey && tenant.membershipId && (
                        <span className="mt-1 block text-xs font-medium text-slate-500">
                          <span className="block truncate">Actor: {tenant.actorKey}</span>
                          <span className="block truncate">Membership: {tenant.membershipId}</span>
                        </span>
                      )}
                    </span>
                    {selected && (
                      <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-bold text-white">
                        Selected
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

function tenantOptionId(tenantId: string) {
  return `tenant-option-${tenantId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}
