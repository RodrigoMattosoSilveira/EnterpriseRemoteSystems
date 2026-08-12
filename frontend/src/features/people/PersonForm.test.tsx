import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Person, UpdatePersonInput } from "../../types/people";
import { PersonForm } from "./PersonForm";

const existingPerson: Person = {
  id: "person-123",
  firstName: "Maria",
  lastName: "Silva",
  nickname: "Mari",
  cpf: "93541134780",
  rg: "RG-000001",
  cellular: "11987654321",
  email: "maria@example.com",
  street1: "Rua Um 123",
  street2: "Apto 4",
  state: "SP",
  cep: "01001000",
  city: "Sao Paulo",
  country: "Brasil",
  bankName: "Banco Teste",
  bankNumber: "001",
  checkingAccount: "12345-6",
  pixKey: "maria@example.com",
  emergencyName: "Joao Silva",
  emergencyCellular: "11912345678",
  emergencyEmail: "joao@example.com",
  profileCompletionStatus: "COMPLETE",
  canCreateCollaborator: true,
  missingSections: [],
  statusId: "ref-person-status-active",
  statusLabel: "Active",
  notes: "Original notes",
};

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
  }
  document.body.removeChild(container);
});

describe("PersonForm edit submission state", () => {
  it("enables Save Changes only when a meaningful valid edit is ready", async () => {
    const onSubmit = vi.fn(async (_input: UpdatePersonInput) => {});
    renderForm(onSubmit);

    expect(saveButton().disabled).toBe(true);

    await changeInput("First Name", " Maria ");
    expect(saveButton().disabled).toBe(true);

    await changeInput("First Name", "Mariana");
    expect(saveButton().disabled).toBe(false);

    await changeInput("Email", "not-an-email");
    expect(saveButton().disabled).toBe(true);

    await changeInput("Email", "maria@example.com");
    expect(saveButton().disabled).toBe(false);

    await changeInput("CPF", "11111111111");
    expect(saveButton().disabled).toBe(true);

    await changeInput("CPF", "935.411.347-80");
    expect(saveButton().disabled).toBe(false);
  });

  it("disables Save Changes after a successful submission", async () => {
    const onSubmit = vi.fn(async (_input: UpdatePersonInput) => {});
    renderForm(onSubmit);

    await changeInput("First Name", "Mariana");
    expect(saveButton().disabled).toBe(false);

    await clickSave();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ firstName: "Mariana" });
    expect(saveButton().disabled).toBe(true);
  });

  it("keeps Save Changes enabled after a failed submission so the edit can be retried", async () => {
    const onSubmit = vi.fn(async (_input: UpdatePersonInput) => {
      throw new Error("update failed");
    });
    renderForm(onSubmit);

    await changeInput("First Name", "Mariana");
    expect(saveButton().disabled).toBe(false);

    await clickSave();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(saveButton().disabled).toBe(false);
  });
});

function renderForm(onSubmit: (input: UpdatePersonInput) => Promise<void>) {
  act(() => {
    root?.render(
      <PersonForm
        initial={existingPerson}
        defaultStatusId="ref-person-status-active"
        onSubmit={onSubmit}
      />
    );
  });
}

function saveButton(): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === "Save Changes"
  );
  if (!button) throw new Error("Could not find Save Changes button");
  return button;
}

function inputByLabel(labelText: string): HTMLInputElement {
  const label = Array.from(container.querySelectorAll("label")).find((node) =>
    node.textContent?.includes(labelText)
  );
  const input = label?.querySelector("input");
  if (!input) throw new Error(`Could not find input for ${labelText}`);
  return input;
}

async function changeInput(labelText: string, value: string) {
  const input = inputByLabel(labelText);
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;

  await act(async () => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function clickSave() {
  await act(async () => {
    saveButton().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}
