import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import type { CreateGoldPriceInput, GoldPrice } from "../../types/goldPrices";
import { GoldPriceForm } from "./GoldPriceForm";
import {
  useCreateGoldPrice,
  useDeactivateGoldPrice,
  useGoldPrices,
  useLatestGoldPrice,
} from "./useGoldPrices";

const AUTHZ_REQUEST_ACTOR_STORAGE_KEY = "ers.authzAdmin.requestActor";

export function GoldPricesPage() {
  const [includeInactive, setIncludeInactive] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [form, setForm] = useState<CreateGoldPriceInput>(() => emptyForm());

  const goldPricesQuery = useGoldPrices(includeInactive);
  const latestGoldPriceQuery = useLatestGoldPrice();
  const createMutation = useCreateGoldPrice(includeInactive);
  const deactivateMutation = useDeactivateGoldPrice(includeInactive);

  const rows = useMemo(
    () => [...(goldPricesQuery.data ?? [])].sort(byPriceDateThenCreatedAt),
    [goldPricesQuery.data],
  );
  const actionError = createMutation.error ?? deactivateMutation.error;
  const queryError = goldPricesQuery.error;
  const latestError = latestGoldPriceQuery.error;

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage("");
    createMutation.reset();

    try {
      const created = await createMutation.mutateAsync({
        priceDate: form.priceDate,
        brlPerGram: form.brlPerGram,
        recordedBy: form.recordedBy.trim(),
        notes: form.notes?.trim() ?? "",
      });
      setForm(emptyForm());
      setSuccessMessage(created.supersededGoldPriceId
        ? `Gold price for ${created.priceDate} replaced. Previous value was deactivated and retained for audit history.`
        : `Gold price for ${created.priceDate} recorded.`);
    } catch {
      // Existing mutation error state is rendered by ApiErrorPanel.
    }
  }

  async function handleDeactivate(row: GoldPrice) {
    setSuccessMessage("");
    deactivateMutation.reset();

    try {
      const updated = await deactivateMutation.mutateAsync(row.id);
      setSuccessMessage(`Gold price for ${updated.priceDate} deactivated.`);
    } catch {
      // Existing mutation error state is rendered by ApiErrorPanel.
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Administration
            </p>
            <h1 className="text-xl font-bold text-gray-950">Gold Prices</h1>
            <p className="text-sm text-gray-500">
              Record the tenant gold-price source used when BRL price-list expenses are converted to grams of gold.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/authorization">
              Authorization
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/reference-data">
              Reference Data
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/people">
              Back to People
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl space-y-4 p-4">
        {successMessage && (
          <div role="status" className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800">
            {successMessage}
          </div>
        )}

        <ApiErrorPanel error={queryError ?? actionError} />

        {latestError && !latestGoldPriceQuery.data && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">No active gold price source yet</p>
            <p className="mt-1">
              Gold-gram expense conversion will be blocked until an administrator records an active BRL-per-gram price.
            </p>
          </div>
        )}

        <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <LatestGoldPriceCard goldPrice={latestGoldPriceQuery.data} isLoading={latestGoldPriceQuery.isLoading} />
          <GoldPriceForm
            value={form}
            isPending={createMutation.isPending}
            onChange={setForm}
            onSubmit={handleCreate}
          />
        </section>

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">Gold Price History</h2>
              <p className="text-sm text-gray-500">
                The latest active date is selected automatically for new GOLD_GRAM expense conversions and stored on the expense for auditability.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <input
                checked={includeInactive}
                type="checkbox"
                onChange={(event) => setIncludeInactive(event.target.checked)}
              />
              Include inactive
            </label>
          </div>

          {goldPricesQuery.isLoading && <p className="mt-4 text-sm text-gray-500">Loading gold prices...</p>}

          {!goldPricesQuery.isLoading && rows.length === 0 && (
            <p className="mt-4 rounded-xl border border-dashed p-4 text-center text-sm text-gray-500">
              No gold prices found.
            </p>
          )}

          {!goldPricesQuery.isLoading && rows.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-xl border">
              <table className="w-full text-left text-sm" data-testid="gold-prices-table">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">BRL per Gram</th>
                    <th className="p-3">Recorded By</th>
                    <th className="p-3">Notes</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr key={row.id} className={!row.active ? "bg-gray-50 text-gray-500" : undefined}>
                      <td className="p-3 font-medium text-gray-900">{row.priceDate}</td>
                      <td className="p-3 text-gray-700">{formatBRL(row.brlPerGram)}</td>
                      <td className="p-3 text-gray-700">{row.recordedBy}</td>
                      <td className="p-3 text-gray-600">{row.notes || "—"}</td>
                      <td className="p-3">
                        <span className={row.active ? "rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700" : "rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700"}>
                          {row.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        {row.active ? (
                          <button
                            className="rounded-xl border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-800 disabled:opacity-60"
                            disabled={deactivateMutation.isPending}
                            type="button"
                            onClick={() => handleDeactivate(row)}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function LatestGoldPriceCard({ goldPrice, isLoading }: { goldPrice?: GoldPrice; isLoading: boolean }) {
  if (isLoading) {
    return (
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-950">Current Conversion Source</h2>
        <p className="mt-4 text-sm text-gray-500">Loading latest gold price...</p>
      </section>
    );
  }

  if (!goldPrice) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-amber-950">Current Conversion Source</h2>
        <p className="mt-2 text-sm text-amber-900">
          No active BRL-per-gram price has been recorded. GOLD_GRAM expenses cannot be calculated yet.
        </p>
      </section>
    );
  }

  const gramsPerBrl = 1 / goldPrice.brlPerGram;

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">Current Conversion Source</h2>
          <p className="mt-1 text-sm text-gray-500">
            Latest active administrator-recorded gold price.
          </p>
        </div>
        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
          Active
        </span>
      </div>

      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        <div className="rounded-xl bg-gray-50 p-3">
          <dt className="font-semibold text-gray-700">Price date</dt>
          <dd className="mt-1 text-gray-900">{goldPrice.priceDate}</dd>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <dt className="font-semibold text-gray-700">BRL per gram</dt>
          <dd className="mt-1 text-gray-900">{formatBRL(goldPrice.brlPerGram)}</dd>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <dt className="font-semibold text-gray-700">Recorded by</dt>
          <dd className="mt-1 text-gray-900">{goldPrice.recordedBy}</dd>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <dt className="font-semibold text-gray-700">Conversion rule</dt>
          <dd className="mt-1 text-gray-900">BRL ÷ {formatDecimal(goldPrice.brlPerGram)} = grams</dd>
        </div>
      </dl>

      <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        Example: R$ 1.00 converts to {formatDecimal(gramsPerBrl, 6)} g using this source.
      </p>
    </section>
  );
}

function emptyForm(): CreateGoldPriceInput {
  return {
    priceDate: todayISODate(),
    brlPerGram: 0,
    recordedBy: currentActorId(),
    notes: "",
  };
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function currentActorId() {
  if (typeof window === "undefined") return "bootstrap-admin";
  const stored = window.localStorage.getItem(AUTHZ_REQUEST_ACTOR_STORAGE_KEY);
  if (!stored) return "bootstrap-admin";
  try {
    const parsed = JSON.parse(stored) as { actorId?: string };
    return parsed.actorId?.trim() || "bootstrap-admin";
  } catch {
    return "bootstrap-admin";
  }
}

function byPriceDateThenCreatedAt(a: GoldPrice, b: GoldPrice) {
  const dateCompare = b.priceDate.localeCompare(a.priceDate);
  if (dateCompare !== 0) return dateCompare;
  return b.createdAt.localeCompare(a.createdAt);
}

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDecimal(value: number, maximumFractionDigits = 4) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}
