import { useI18n } from "../../i18n";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import {
  authorizationRequestContext,
  readSelectedTenantId,
} from "../../api/tenantSelection";
import type { CreateGoldPriceInput, GoldPrice } from "../../types/goldPrices";
import { GoldPriceForm } from "./GoldPriceForm";
import { useCurrentAuthzActor } from "../authz/useAuthzAdmin";
import {
  useCreateGoldPrice,
  useDeactivateGoldPrice,
  useGoldPrices,
  useLatestGoldPrice,
} from "./useGoldPrices";
import { PageTitle } from "../../components/layout/PageHeading";


export function GoldPricesPage() {
  const { t, formatCurrency } = useI18n();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [form, setForm] = useState<CreateGoldPriceInput>(() => emptyForm());
  const [formResetToken, setFormResetToken] = useState(0);
  const [tenantId] = useState(() =>
    typeof window === "undefined" ? "default" : readSelectedTenantId(window.localStorage),
  );
  const requestActor = useMemo(() => authorizationRequestContext(tenantId), [tenantId]);
  const currentActorQuery = useCurrentAuthzActor(requestActor);
  const canManage = Boolean(currentActorQuery.data?.permissions.includes("*") || currentActorQuery.data?.permissions.includes("gold_prices.manage"));

  const goldPricesQuery = useGoldPrices(includeInactive);
  const latestGoldPriceQuery = useLatestGoldPrice();
  const createMutation = useCreateGoldPrice(includeInactive);
  const deactivateMutation = useDeactivateGoldPrice(includeInactive);

  const rows = useMemo(
    () => [...(goldPricesQuery.data ?? [])].sort(byPriceDateThenCreatedAt),
    [goldPricesQuery.data],
  );
  const actionError = createMutation.error ?? deactivateMutation.error;
  const queryError = goldPricesQuery.error ?? currentActorQuery.error;
  const latestError = latestGoldPriceQuery.error;

  useEffect(() => {
    const actorKey = currentActorQuery.data?.actorKey?.trim();
    if (!actorKey) return;
    setForm((current) =>
      current.recordedBy === actorKey ? current : { ...current, recordedBy: actorKey },
    );
  }, [currentActorQuery.data?.actorKey]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage("");
    createMutation.reset();

    try {
      const created = await createMutation.mutateAsync({
        priceDate: form.priceDate,
        brlPerGram: form.brlPerGram,
        recordedBy: currentActorQuery.data?.actorKey?.trim() || form.recordedBy.trim(),
        notes: form.notes?.trim() ?? "",
      });
      setForm(emptyForm());
      setFormResetToken((current) => current + 1);
      setSuccessMessage(created.supersededGoldPriceId
        ? t("byte352.gold.replaced", { date: created.priceDate })
        : t("byte352.gold.recorded", { date: created.priceDate }));
    } catch {
      // Existing mutation error state is rendered by ApiErrorPanel.
    }
  }

  async function handleDeactivate(row: GoldPrice) {
    setSuccessMessage("");
    deactivateMutation.reset();

    try {
      const updated = await deactivateMutation.mutateAsync(row.id);
      setSuccessMessage(t("byte352.gold.deactivated", { date: updated.priceDate }));
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
              {t("gold.page.administration_b8be3d")}
            </p>
            <PageTitle>{t("gold.page.gold.prices_d529be")}</PageTitle>
            <p className="text-sm text-gray-500">
              {t("gold.page.record.the.tenant.gold.price.source.used.when.brl.price.list.expe_c7f462")}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/authorization">
              {t("gold.page.authorization_5e25ce")}
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/reference-data">
              {t("gold.page.reference.data_3d3f15")}
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/price-list-items">
              {t("gold.page.price.list_760d09")}
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/people">
              {t("gold.page.back.to.people_59f4cb")}
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

        <ApiErrorPanel error={queryError ?? actionError} translate={t} />

        {latestError && !latestGoldPriceQuery.data && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">{t("gold.page.no.active.gold.price.source.yet_a0c252")}</p>
            <p className="mt-1">
              {t("gold.page.gold.gram.expense.conversion.will.be.blocked.until.an.administrat_6acc8f")}
            </p>
          </div>
        )}

        <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <LatestGoldPriceCard goldPrice={latestGoldPriceQuery.data} isLoading={latestGoldPriceQuery.isLoading} />
          {canManage ? <GoldPriceForm
            value={form}
            resetToken={formResetToken}
            isPending={createMutation.isPending}
            onChange={setForm}
            onSubmit={handleCreate}
          /> : null}
        </section>

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">{t("gold.page.gold.price.history_6e7a9c")}</h2>
              <p className="text-sm text-gray-500">
                {t("gold.page.the.latest.active.date.is.selected.automatically.for.new.gold.gra_c84d13")}
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <input
                checked={includeInactive}
                type="checkbox"
                onChange={(event) => setIncludeInactive(event.target.checked)}
              />
              {t("gold.page.include.inactive_1ccb27")}
            </label>
          </div>

          {goldPricesQuery.isLoading && <p className="mt-4 text-sm text-gray-500">{t("gold.page.loading.gold.prices_d80cc6")}</p>}

          {!goldPricesQuery.isLoading && rows.length === 0 && (
            <p className="mt-4 rounded-xl border border-dashed p-4 text-center text-sm text-gray-500">
              {t("gold.page.no.gold.prices.found_595788")}
            </p>
          )}

          {!goldPricesQuery.isLoading && rows.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-xl border">
              <table className="w-full text-left text-sm" data-testid="gold-prices-table">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="p-3">{t("gold.page.date_eb9a4b")}</th>
                    <th className="p-3">{t("gold.page.brl.per.gram_fc2286")}</th>
                    <th className="p-3">{t("gold.page.recorded.by_b19313")}</th>
                    <th className="p-3">{t("gold.page.notes_704400")}</th>
                    <th className="p-3">{t("gold.page.status_bae7d5")}</th>
                    <th className="p-3 text-right">{t("gold.page.actions_c3cd63")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr key={row.id} className={!row.active ? "bg-gray-50 text-gray-500" : undefined}>
                      <td className="p-3 font-medium text-gray-900">{row.priceDate}</td>
                      <td className="p-3 text-gray-700">{formatCurrency(row.brlPerGram, "BRL", { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-gray-700">{row.recordedBy}</td>
                      <td className="p-3 text-gray-600">{row.notes || "—"}</td>
                      <td className="p-3">
                        <span className={row.active ? "rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700" : "rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700"}>
                          {row.active ? t("gold.page.active_a733b8") : t("byte352.common.inactive")}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        {row.active && canManage ? (
                          <button
                            className="rounded-xl border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-800 disabled:opacity-60"
                            disabled={deactivateMutation.isPending}
                            type="button"
                            onClick={() => handleDeactivate(row)}
                          >
                            {t("gold.page.deactivate_d65ded")}
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
  const { t, formatCurrency, formatNumber } = useI18n();
  if (isLoading) {
    return (
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-950">{t("gold.page.current.conversion.source_da29a2")}</h2>
        <p className="mt-4 text-sm text-gray-500">{t("gold.page.loading.latest.gold.price_2605fd")}</p>
      </section>
    );
  }

  if (!goldPrice) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-amber-950">{t("gold.page.current.conversion.source_da29a2")}</h2>
        <p className="mt-2 text-sm text-amber-900">
          {t("gold.page.no.active.brl.per.gram.price.has.been.recorded.gold.gram.expenses_aea726")}
        </p>
      </section>
    );
  }

  const gramsPerBrl = 1 / goldPrice.brlPerGram;

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">{t("gold.page.current.conversion.source_da29a2")}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {t("gold.page.latest.active.administrator.recorded.gold.price_166be0")}
          </p>
        </div>
        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
          {t("gold.page.active_a733b8")}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        <div className="rounded-xl bg-gray-50 p-3">
          <dt className="font-semibold text-gray-700">{t("gold.page.price.date_353d32")}</dt>
          <dd className="mt-1 text-gray-900">{goldPrice.priceDate}</dd>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <dt className="font-semibold text-gray-700">{t("gold.page.brl.per.gram_b8fa59")}</dt>
          <dd className="mt-1 text-gray-900">{formatCurrency(goldPrice.brlPerGram, "BRL", { minimumFractionDigits: 2 })}</dd>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <dt className="font-semibold text-gray-700">{t("gold.page.recorded.by_664aa7")}</dt>
          <dd className="mt-1 text-gray-900">{goldPrice.recordedBy}</dd>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <dt className="font-semibold text-gray-700">{t("gold.page.conversion.rule_21d123")}</dt>
          <dd className="mt-1 text-gray-900">BRL ÷ {formatNumber(goldPrice.brlPerGram, { maximumFractionDigits: 4 })} = {t("byte352.gold.grams")}</dd>
        </div>
      </dl>

      <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        {t("byte352.gold.example", { grams: formatNumber(gramsPerBrl, { maximumFractionDigits: 6 }) })}
      </p>
    </section>
  );
}

function emptyForm(): CreateGoldPriceInput {
  return {
    priceDate: todayISODate(),
    brlPerGram: 0,
    recordedBy: "",
    notes: "",
  };
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function byPriceDateThenCreatedAt(a: GoldPrice, b: GoldPrice) {
  const dateCompare = b.priceDate.localeCompare(a.priceDate);
  if (dateCompare !== 0) return dateCompare;
  return b.createdAt.localeCompare(a.createdAt);
}
