import { describe, expect, it } from "vitest";
import { enUSMessages, messagesByLocale, ptBRMessages } from "./resources";

describe("ERS translation resources", () => {
  it("keeps pt-BR and en-US on the same key contract", () => {
    expect(Object.keys(ptBRMessages).sort()).toEqual(Object.keys(enUSMessages).sort());
  });

  it("provides foundation labels in both supported locales", () => {
    expect(messagesByLocale["en-US"]["locale.selectorLabel"]).toBe("Language");
    expect(messagesByLocale["pt-BR"]["locale.selectorLabel"]).toBe("Idioma");
  });

  it("describes actual Journey closure dates distinctly from projected end dates", () => {
    expect(messagesByLocale["en-US"]["collaborator.startedEnded"]).toBe(
      "Started {start} · Ended on {end}",
    );
    expect(messagesByLocale["pt-BR"]["collaborator.startedEnded"]).toBe(
      "Iniciada {start} · encerrada em {end}",
    );
  });

  it("provides Work and Credit Evidence labels in both supported locales", () => {
    expect(messagesByLocale["en-US"]["workCredit.title"]).toBe(
      "Work and Credit Evidence",
    );
    expect(messagesByLocale["pt-BR"]["workCredit.title"]).toBe(
      "Demonstrativo de Trabalho e Crédito",
    );
    expect(messagesByLocale["en-US"]["workCredit.amountEarned"]).toBe(
      "Amount earned",
    );
    expect(messagesByLocale["pt-BR"]["workCredit.amountEarned"]).toBe(
      "Valor ganho",
    );
    expect(messagesByLocale["en-US"]["workCredit.creditPosted"]).toBe(
      "Credit posted",
    );
    expect(messagesByLocale["pt-BR"]["workCredit.creditPosted"]).toBe(
      "Crédito lançado",
    );
  });

  it("describes Bite 32.4 cross-Tenant Role eligibility without disclosing Tenant or Role identity", () => {
    expect(messagesByLocale["en-US"]["authz.tenantRoleDelegation.crossTenantAuthorityBadge"]).toBe(
      "Role in another Tenant",
    );
    expect(messagesByLocale["en-US"]["authz.tenantRoleDelegation.crossTenantConflict"]).toBe(
      "This Person has one or more Roles in another Tenant. They must work with that Tenant to have every Role other than Membership and Collaborator removed before a Role can be assigned here.",
    );
    expect(messagesByLocale["pt-BR"]["authz.tenantRoleDelegation.crossTenantAuthorityBadge"]).toBe(
      "Função em outra Entidade",
    );
    expect(messagesByLocale["pt-BR"]["authz.tenantRoleDelegation.crossTenantConflict"]).toBe(
      "Esta Pessoa possui uma ou mais Funções em outra Entidade. Ela deve trabalhar com essa Entidade para que todas as Funções, exceto Vínculo e Colaborador, sejam removidas antes que uma Função possa ser atribuída aqui.",
    );
  });

  it("uses Entidade terminology only in pt-BR while preserving English Tenant terminology", () => {
    expect(messagesByLocale["en-US"]["common.tenant"]).toBe("Tenant");
    expect(messagesByLocale["en-US"]["common.tenants"]).toBe("Tenants");
    expect(messagesByLocale["pt-BR"]["common.tenant"]).toBe("Entidade");
    expect(messagesByLocale["pt-BR"]["common.tenants"]).toBe("Entidades");

    const portugueseCopy = Object.values(messagesByLocale["pt-BR"]).join("\n");
    expect(portugueseCopy).not.toMatch(/locatári[oa]s?/iu);
  });
});
