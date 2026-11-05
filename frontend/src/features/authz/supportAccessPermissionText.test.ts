import { describe, expect, it } from "vitest";
import { supportAccessPermissionText } from "./supportAccessPermissionText";

const example = { code: "people.read", label: "Read people", description: "Read tenant person records." };

describe("Support Access permission localization", () => {
  it("renders Brazilian Portuguese labels and explanations for server-supplied permission codes", () => {
    expect(supportAccessPermissionText("pt-BR", example)).toEqual({
      label: "Consultar Pessoas", description: "Consultar os registros de Pessoas da Entidade.",
    });
    expect(supportAccessPermissionText("pt-BR", { code: "journey.settlements.final_tenant_payment", label: "Final Tenant payment", description: "Post the full positive Journey balance owed by the Tenant to the Collaborator." })).toEqual({
      label: "Pagamento final da Entidade", description: "Registrar o pagamento do saldo positivo integral da Jornada devido pela Entidade ao Colaborador.",
    });
  });

  it("preserves backend text in English and for future unknown codes", () => {
    expect(supportAccessPermissionText("en-US", example)).toEqual({ label: example.label, description: example.description });
    const unknown = { code: "future.permission", label: "Future permission", description: "Future explanation" };
    expect(supportAccessPermissionText("pt-BR", unknown)).toEqual({ label: unknown.label, description: unknown.description });
  });
});
