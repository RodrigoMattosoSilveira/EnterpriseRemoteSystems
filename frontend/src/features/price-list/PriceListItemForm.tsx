import type { FormEvent } from "react";

type PriceListFormItemType = "CANTEEN" | "ADMINISTRATIVE";
type PriceListItemFormLayout = "standard" | "wide";

export type PriceListItemFormValue = {
  itemType: PriceListFormItemType;
  code: string;
  description: string;
  unitPriceBrl: string;
  sortOrder: string;
};

export const emptyPriceListItemFormValue: PriceListItemFormValue = {
  itemType: "CANTEEN",
  code: "",
  description: "",
  unitPriceBrl: "",
  sortOrder: "0",
};

export function PriceListItemForm({
  title,
  description,
  value,
  isPending,
  isSubmitDisabled = false,
  submitLabel,
  pendingLabel,
  onChange,
  onSubmit,
  onCancel,
  layout = "standard",
}: {
  title: string;
  description: string;
  value: PriceListItemFormValue;
  isPending: boolean;
  isSubmitDisabled?: boolean;
  submitLabel: string;
  pendingLabel: string;
  onChange: (value: PriceListItemFormValue) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
  layout?: PriceListItemFormLayout;
}) {
  const isWide = layout === "wide";
  const submitDisabled = isPending || isSubmitDisabled;
  const submitClassName = [
    "mt-4 rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
    isWide ? "" : "w-full",
    submitDisabled
      ? "cursor-not-allowed bg-gray-200 text-gray-500"
      : "bg-gray-950 text-white hover:bg-gray-800",
  ]
    .filter(Boolean)
    .join(" ");
  const fieldGridClassName = isWide
    ? "mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-6"
    : "mt-4 grid gap-3 sm:grid-cols-2";
  const categoryClassName = isWide
    ? "block text-sm font-semibold text-gray-700 lg:col-span-2"
    : "block text-sm font-semibold text-gray-700";
  const codeClassName = isWide
    ? "block text-sm font-semibold text-gray-700 lg:col-span-2"
    : "block text-sm font-semibold text-gray-700";
  const descriptionClassName = isWide
    ? "block text-sm font-semibold text-gray-700 sm:col-span-2 lg:col-span-3"
    : "block text-sm font-semibold text-gray-700 sm:col-span-2";
  const unitPriceClassName = isWide
    ? "block text-sm font-semibold text-gray-700 lg:col-span-2"
    : "block text-sm font-semibold text-gray-700";
  const sortOrderClassName = isWide
    ? "block text-sm font-semibold text-gray-700 lg:col-span-1"
    : "block text-sm font-semibold text-gray-700";

  return (
    <form className="rounded-2xl border bg-white p-5 shadow-sm" onSubmit={onSubmit}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">{title}</h2>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>
        {onCancel && (
          <button
            className="rounded-lg border px-3 py-1 text-xs font-semibold text-gray-700"
            onClick={onCancel}
            type="button"
          >
            {isWide ? "Dismiss" : "Cancel"}
          </button>
        )}
      </div>

      <div className={fieldGridClassName}>
        <label className={categoryClassName}>
          Category
          <select
            className="mt-1 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
            required
            value={value.itemType}
            onChange={(event) =>
              onChange({ ...value, itemType: event.target.value as PriceListFormItemType })
            }
          >
            <option value="CANTEEN">Canteen</option>
            <option value="ADMINISTRATIVE">Administrative</option>
          </select>
        </label>

        <label className={codeClassName}>
          Code
          <input
            className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            required
            value={value.code}
            onChange={(event) => onChange({ ...value, code: event.target.value })}
            placeholder="CANTEEN_SNACK"
          />
        </label>

        <label className={descriptionClassName}>
          Description
          <input
            className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            required
            value={value.description}
            onChange={(event) => onChange({ ...value, description: event.target.value })}
            placeholder="Snack"
          />
        </label>

        <label className={unitPriceClassName}>
          BRL Unit Price
          <input
            className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            min="0.01"
            required
            step="0.01"
            type="number"
            value={value.unitPriceBrl}
            onChange={(event) => onChange({ ...value, unitPriceBrl: event.target.value })}
            placeholder="10.00"
          />
        </label>

        <label className={sortOrderClassName}>
          Sort Order
          <input
            className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            step="1"
            type="number"
            value={value.sortOrder}
            onChange={(event) => onChange({ ...value, sortOrder: event.target.value })}
          />
        </label>
      </div>

      <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-950">
        Price-list prices are stored in BRL. Grams-of-gold expenses convert this BRL price by using the latest active gold price at expense creation time.
      </p>

      <button
        className={submitClassName}
        disabled={submitDisabled}
        type="submit"
      >
        {isPending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
