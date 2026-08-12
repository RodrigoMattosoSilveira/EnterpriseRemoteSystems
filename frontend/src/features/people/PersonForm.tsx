import { useMemo, useState } from "react";
import type {
  CreatePersonInput,
  Person,
  UpdatePersonInput,
} from "../../types/people";
import {
  isValidUpdatePersonInput,
  updatePersonFingerprint,
} from "./peopleSchemas";

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
  const isCreate = !initial;
  const [activeTab, setActiveTab] = useState<Tab>("personal");

  const initialForm = useMemo(
    () => buildInitialForm(initial, defaultStatusId),
    [initial, defaultStatusId]
  );
  const [form, setForm] = useState<UpdatePersonInput>(() => initialForm);
  const [savedFingerprint, setSavedFingerprint] = useState(() =>
    updatePersonFingerprint(initialForm)
  );

  const currentFingerprint = updatePersonFingerprint(form);
  const hasValidChange =
    isCreate ||
    (currentFingerprint !== savedFingerprint && isValidUpdatePersonInput(form));

  const missingSections = initial?.missingSections ?? [];

  const completionLabel = useMemo(() => {
    if (!initial) return "New record";
    return initial.canCreateCollaborator ? "Complete" : "Incomplete";
  }, [initial]);

  function update<K extends keyof UpdatePersonInput>(
    key: K,
    value: UpdatePersonInput[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting || (!isCreate && !hasValidChange)) return;

    try {
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
      setSavedFingerprint(currentFingerprint);
    } catch {
      // The owning page renders the mutation error. Keep the edit dirty so the
      // user can correct or retry the submission.
    }
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
            label="Personal"
            required
            onClick={() => setActiveTab("personal")}
          />
          <TabButton
            active={activeTab === "address"}
            label="Address"
            disabled={isCreate}
            missing={missingSections.includes("Address")}
            onClick={() => setActiveTab("address")}
          />
          <TabButton
            active={activeTab === "bank"}
            label="Bank"
            disabled={isCreate}
            missing={missingSections.includes("Bank")}
            onClick={() => setActiveTab("bank")}
          />
          <TabButton
            active={activeTab === "emergency"}
            label="Emergency"
            disabled={isCreate}
            missing={missingSections.includes("Emergency")}
            onClick={() => setActiveTab("emergency")}
          />
          <TabButton
            active={activeTab === "notes"}
            label="Notes"
            onClick={() => setActiveTab("notes")}
          />
        </div>
      </div>

      {isCreate && activeTab !== "personal" && (
        <InfoBox>
          Save the required Personal section first. Address, Bank, and Emergency
          sections can be completed after the Person record exists.
        </InfoBox>
      )}

      {activeTab === "personal" && (
        <Section
          title="Personal"
          description="Required before the Person record can be created."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="First Name"
              required
              value={form.firstName}
              onChange={(value) => update("firstName", value)}
            />
            <Input
              label="Last Name"
              required
              value={form.lastName}
              onChange={(value) => update("lastName", value)}
            />
          </div>

          <Input
            label="Nickname"
            required
            value={form.nickname}
            onChange={(value) => update("nickname", value)}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="CPF"
              required
              value={form.cpf}
              placeholder="000.000.000-00"
              onChange={(value) => update("cpf", value)}
            />
            <Input
              label="RG"
              required
              value={form.rg}
              onChange={(value) => update("rg", value)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Cellular"
              required
              value={form.cellular}
              placeholder="(11) 99999-9999"
              onChange={(value) => update("cellular", value)}
            />
            <Input
              label="Email"
              required
              type="email"
              value={form.email}
              onChange={(value) => update("email", value)}
            />
          </div>

          <Select
            label="Status"
            required
            value={form.statusId}
            onChange={(value) => update("statusId", value)}
            options={[
              { value: "ref-person-status-active", label: "Active" },
              { value: "ref-person-status-inactive", label: "Inactive" },
              {
                value: "ref-person-status-discontinued",
                label: "Discontinued",
              },
            ]}
          />
        </Section>
      )}

      {activeTab === "address" && !isCreate && (
        <Section
          title="Address"
          description="Required before this person can become a collaborator."
        >
          <Input
            label="Street 1"
            required
            value={form.street1 ?? ""}
            onChange={(value) => update("street1", value)}
          />

          <Input
            label="Street 2"
            value={form.street2 ?? ""}
            onChange={(value) => update("street2", value)}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="State"
              required
              value={form.state ?? ""}
              placeholder="Pará"
              onChange={(value) => update("state", value)}
            />
            <Input
              label="City"
              required
              value={form.city ?? ""}
              onChange={(value) => update("city", value)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="CEP"
              required
              value={form.cep ?? ""}
              placeholder="00000-000"
              onChange={(value) => update("cep", value)}
            />
            <Input
              label="Country"
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
          title="Bank"
          description="Required before this person can become a collaborator."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Bank Name"
              required
              value={form.bankName ?? ""}
              onChange={(value) => update("bankName", value)}
            />
            <Input
              label="Bank Number"
              required
              value={form.bankNumber ?? ""}
              onChange={(value) => update("bankNumber", value)}
            />
          </div>

          <Input
            label="Checking Account"
            required
            value={form.checkingAccount ?? ""}
            onChange={(value) => update("checkingAccount", value)}
          />

          <Input
            label="PIX"
            required
            value={form.pixKey ?? ""}
            onChange={(value) => update("pixKey", value)}
          />
        </Section>
      )}

      {activeTab === "emergency" && !isCreate && (
        <Section
          title="Emergency"
          description="Required before this person can become a collaborator."
        >
          <Input
            label="Emergency Contact Name"
            required
            value={form.emergencyName ?? ""}
            onChange={(value) => update("emergencyName", value)}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Emergency Cellular"
              required
              value={form.emergencyCellular ?? ""}
              placeholder="(11) 99999-9999"
              onChange={(value) => update("emergencyCellular", value)}
            />
            <Input
              label="Emergency Email"
              required
              type="email"
              value={form.emergencyEmail ?? ""}
              onChange={(value) => update("emergencyEmail", value)}
            />
          </div>
        </Section>
      )}

      {activeTab === "notes" && (
        <Section title="Notes" description="Internal notes and observations.">
          <TextArea
            label="Notes"
            value={form.notes ?? ""}
            onChange={(value) => update("notes", value)}
          />
        </Section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-white p-4 shadow-2xl md:sticky md:rounded-2xl md:border">
        <button
          type="submit"
          disabled={submitting || (!isCreate && !hasValidChange)}
          className="w-full rounded-xl bg-gray-950 px-5 py-4 text-base font-semibold text-white shadow-sm disabled:opacity-50"
        >
          {submitting ? "Saving..." : isCreate ? "Create Person" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

function buildInitialForm(
  initial: Person | undefined,
  defaultStatusId: string
): UpdatePersonInput {
  return {
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
  };
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
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">
            Profile Status
          </h2>
          <p className="text-sm text-gray-600">
            {isCreate
              ? "Complete the Personal section to create this Person record."
              : canCreateCollaborator
                ? "This person is eligible to become a collaborator."
                : "This person cannot become a collaborator until all required sections are complete."}
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
              Missing: {section}
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
      aria-pressed={active}
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