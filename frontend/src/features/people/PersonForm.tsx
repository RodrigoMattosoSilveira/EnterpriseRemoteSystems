import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  CreatePersonInput,
  Person,
  UpdatePersonInput,
} from "../../types/people";

type Props = {
  initial?: Person;
  defaultStatusId: string;
  submitting?: boolean;
  onSubmit: (input: CreatePersonInput | UpdatePersonInput) => Promise<void>;
};

type Tab = "personal" | "address" | "bank" | "emergency" | "notes";

export function PersonForm({
  initial,
  defaultStatusId,
  submitting = false,
  onSubmit,
}: Props) {
  const { t } = useTranslation("people");
  const isCreate = !initial;
  const [activeTab, setActiveTab] = useState<Tab>("personal");

  const [form, setForm] = useState<UpdatePersonInput>({
    firstName: initial?.firstName ?? "",
    lastName: initial?.lastName ?? "",
    nickname: initial?.nickname ?? "",
    cpf: initial?.cpf ?? "",
    rg: initial?.rg ?? "",
    cellular: initial?.cellular ?? "",
    email: initial?.email ?? "",

    street1: initial?.street1 ?? "",
    street2: initial?.street2 ?? "",
    state: initial?.state ?? "",
    cep: initial?.cep ?? "",
    city: initial?.city ?? "",
    country: initial?.country ?? "Brasil",

    bankName: initial?.bankName ?? "",
    bankNumber: initial?.bankNumber ?? "",
    checkingAccount: initial?.checkingAccount ?? "",
    pixKey: initial?.pixKey ?? "",

    emergencyName: initial?.emergencyName ?? "",
    emergencyCellular: initial?.emergencyCellular ?? "",
    emergencyEmail: initial?.emergencyEmail ?? "",

    statusId: initial?.statusId ?? defaultStatusId,
    notes: initial?.notes ?? "",
  });

  const missingSections = initial?.missingSections ?? [];

  const completionLabel = useMemo(() => {
    if (!initial) return t("newRecord");
    return initial.canCreateCollaborator ? t("complete") : t("incomplete");
  }, [initial, t]);

  function update<K extends keyof UpdatePersonInput>(
    key: K,
    value: UpdatePersonInput[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isCreate) {
      await onSubmit({
        firstName: form.firstName,
        lastName: form.lastName,
        nickname: form.nickname,
        cpf: form.cpf,
        rg: form.rg,
        cellular: form.cellular,
        email: form.email,
        statusId: form.statusId,
        notes: form.notes,
      });
      return;
    }

    await onSubmit(form);
  }

  return (
    <form onSubmit={submit} className="space-y-5 pb-28">
      <ProfileStatusCard
        isCreate={isCreate}
        completionLabel={completionLabel}
        canCreateCollaborator={initial?.canCreateCollaborator ?? false}
        missingSections={missingSections}
      />

      <div className="overflow-x-auto rounded-2xl border bg-white p-2 shadow-sm">
        <div className="flex min-w-max gap-2">
          <TabButton
            active={activeTab === "personal"}
            label={t("tabPersonal")}
            required
            onClick={() => setActiveTab("personal")}
          />
          <TabButton
            active={activeTab === "address"}
            label={t("tabAddress")}
            disabled={isCreate}
            missing={missingSections.includes("Address")}
            onClick={() => setActiveTab("address")}
          />
          <TabButton
            active={activeTab === "bank"}
            label={t("tabBank")}
            disabled={isCreate}
            missing={missingSections.includes("Bank")}
            onClick={() => setActiveTab("bank")}
          />
          <TabButton
            active={activeTab === "emergency"}
            label={t("tabEmergency")}
            disabled={isCreate}
            missing={missingSections.includes("Emergency")}
            onClick={() => setActiveTab("emergency")}
          />
          <TabButton
            active={activeTab === "notes"}
            label={t("tabNotes")}
            onClick={() => setActiveTab("notes")}
          />
        </div>
      </div>

      {isCreate && activeTab !== "personal" && (
        <InfoBox>
          {t("savePersonalSectionHint")}
        </InfoBox>
      )}

      {activeTab === "personal" && (
        <Section
          title={t("tabPersonal")}
          description={t("personalSectionDescription")}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label={t("firstName")}
              required
              value={form.firstName}
              onChange={(value) => update("firstName", value)}
            />
            <Input
              label={t("lastName")}
              required
              value={form.lastName}
              onChange={(value) => update("lastName", value)}
            />
          </div>

          <Input
            label={t("nickname")}
            required
            value={form.nickname}
            onChange={(value) => update("nickname", value)}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label={t("cpf")}
              required
              value={form.cpf}
              placeholder={t("cpfPlaceholder")}
              onChange={(value) => update("cpf", value)}
            />
            <Input
              label={t("rg")}
              required
              value={form.rg}
              onChange={(value) => update("rg", value)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label={t("cellular")}
              required
              value={form.cellular}
              placeholder={t("cellularPlaceholder")}
              onChange={(value) => update("cellular", value)}
            />
            <Input
              label={t("email")}
              required
              type="email"
              value={form.email}
              onChange={(value) => update("email", value)}
            />
          </div>

          <Select
            label={t("status")}
            required
            value={form.statusId}
            onChange={(value) => update("statusId", value)}
            options={[
              {
                value: "ref-person-status-active",
                label: t("active"),
              },
              {
                value: "ref-person-status-inactive",
                label: t("inactive"),
              },
              {
                value: "ref-person-status-discontinued",
                label: t("statusDiscontinued"),
              },
            ]}
          />
        </Section>
      )}

      {activeTab === "address" && !isCreate && (
        <Section
          title={t("tabAddress")}
          description={t("addressSectionDescription")}
        >
          <Input
            label={t("street1")}
            required
            value={form.street1 ?? ""}
            onChange={(value) => update("street1", value)}
          />

          <Input
            label={t("street2")}
            value={form.street2 ?? ""}
            onChange={(value) => update("street2", value)}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label={t("state")}
              required
              value={form.state ?? ""}
              placeholder={t("statePlaceholder")}
              onChange={(value) => update("state", value)}
            />
            <Input
              label={t("city")}
              required
              value={form.city ?? ""}
              onChange={(value) => update("city", value)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label={t("cep")}
              required
              value={form.cep ?? ""}
              placeholder={t("cepPlaceholder")}
              onChange={(value) => update("cep", value)}
            />
            <Input
              label={t("country")}
              required
              value={form.country ?? "Brasil"}
              disabled
              onChange={() => update("country", "Brasil")}
            />
          </div>
        </Section>
      )}

      {activeTab === "bank" && !isCreate && (
        <Section
          title={t("tabBank")}
          description={t("bankSectionDescription")}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label={t("bankName")}
              required
              value={form.bankName ?? ""}
              onChange={(value) => update("bankName", value)}
            />
            <Input
              label={t("bankNumber")}
              required
              value={form.bankNumber ?? ""}
              onChange={(value) => update("bankNumber", value)}
            />
          </div>

          <Input
            label={t("checkingAccount")}
            required
            value={form.checkingAccount ?? ""}
            onChange={(value) => update("checkingAccount", value)}
          />

          <Input
            label={t("pix")}
            required
            value={form.pixKey ?? ""}
            onChange={(value) => update("pixKey", value)}
          />
        </Section>
      )}

      {activeTab === "emergency" && !isCreate && (
        <Section
          title={t("tabEmergency")}
          description={t("emergencySectionDescription")}
        >
          <Input
            label={t("emergencyContactName")}
            required
            value={form.emergencyName ?? ""}
            onChange={(value) => update("emergencyName", value)}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label={t("emergencyCellular")}
              required
              value={form.emergencyCellular ?? ""}
              placeholder={t("cellularPlaceholder")}
              onChange={(value) => update("emergencyCellular", value)}
            />
            <Input
              label={t("emergencyEmail")}
              required
              type="email"
              value={form.emergencyEmail ?? ""}
              onChange={(value) => update("emergencyEmail", value)}
            />
          </div>
        </Section>
      )}

      {activeTab === "notes" && (
        <Section
          title={t("tabNotes")}
          description={t("notesSectionDescription")}
        >
          <TextArea
            label={t("notes")}
            value={form.notes ?? ""}
            onChange={(value) => update("notes", value)}
          />
        </Section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-white p-4 shadow-2xl md:sticky md:rounded-2xl md:border">
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-gray-950 px-5 py-4 text-base font-semibold text-white shadow-sm disabled:opacity-50"
        >
          {submitting
            ? t("saving")
            : isCreate
            ? t("createPerson")
            : t("saveChangesButton")}
        </button>
      </div>
    </form>
  );
}

function ProfileStatusCard({
  isCreate,
  completionLabel,
  canCreateCollaborator,
  missingSections,
}: {
  isCreate: boolean;
  completionLabel: string;
  canCreateCollaborator: boolean;
  missingSections: string[];
}) {
  const { t } = useTranslation("people");

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">
            {t("profileStatusTitle")}
          </h2>
          <p className="text-sm text-gray-600">
            {isCreate
              ? t("profileStatusCreateDescription")
              : canCreateCollaborator
              ? t("profileStatusEligibleDescription")
              : t("profileStatusIneligibleDescription")}
          </p>
        </div>

        <span
          className={`w-fit rounded-full px-3 py-1 text-sm font-medium ${
            canCreateCollaborator
              ? "bg-green-100 text-green-800"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          {completionLabel}
        </span>
      </div>

      {!isCreate && missingSections.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {missingSections.map((section) => (
            <span
              key={section}
              className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700"
            >
              {t("missing", { section })}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-gray-950">{title}</h2>
        {description && <p className="text-sm text-gray-600">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function TabButton({
  label,
  active,
  required,
  missing,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  required?: boolean;
  missing?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-gray-950 text-white" : "bg-gray-100 text-gray-700"
      }`}
    >
      {label}
      {required && <span className="ml-1 text-xs">*</span>}
      {missing && <span className="ml-2 text-xs text-amber-600">●</span>}
    </button>
  );
}

function Input({
  label,
  value,
  onChange,
  required = false,
  disabled = false,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-800">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <input
        required={required}
        disabled={disabled}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-gray-300 bg-white p-3 text-base outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200 disabled:bg-gray-100"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-800">
        {label}
      </span>
      <textarea
        rows={4}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-gray-300 bg-white p-3 text-base outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  required = false,
}: {
  label: string;
  value: string;
  required?: boolean;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-800">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <select
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-gray-300 bg-white p-3 text-base outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
      {children}
    </div>
  );
}