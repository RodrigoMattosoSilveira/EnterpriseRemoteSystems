import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import { describeApiError } from "./apiErrors";
import { translateForLocale, type Translate } from "./translateResource";

const tFor = (locale: "en-US" | "pt-BR"): Translate => (key, parameters) =>
  translateForLocale(locale, key, parameters);

const priceListValidationError = () =>
  new ApiError({
    status: 400,
    code: "validation_failed",
    message: "Validation failed",
    fields: {
      unitPriceBrl: "Unit price in BRL must be greater than zero",
      code: "An active price-list item already uses this code for this category",
      legacyField: "Legacy English message",
    },
    fieldCodes: {
      unitPriceBrl: "must_be_positive",
      code: "duplicate_active_code",
    },
  });

describe("describeApiError", () => {
  it("keeps the server's own English text in en-US", () => {
    const described = describeApiError(priceListValidationError(), "en-US", tFor("en-US"));

    expect(described.message).toBe("Validation failed");
    expect(described.fields).toContainEqual({
      field: "unitPriceBrl",
      label: "unitPriceBrl",
      message: "Unit price in BRL must be greater than zero",
    });
  });

  it("translates the error code, field labels and rule codes in pt-BR", () => {
    const described = describeApiError(priceListValidationError(), "pt-BR", tFor("pt-BR"));

    expect(described.message).toBe("Alguns campos precisam de correção.");
    expect(described.fields).toContainEqual({
      field: "unitPriceBrl",
      label: "Preço unitário em BRL",
      message: "Deve ser maior que zero",
    });
    expect(described.fields).toContainEqual({
      field: "code",
      label: "Código",
      message: "Um item ativo já usa este código nesta categoria",
    });
  });

  it("falls back to the server text for fields without a rule code", () => {
    const described = describeApiError(priceListValidationError(), "pt-BR", tFor("pt-BR"));

    expect(described.fields).toContainEqual({
      field: "legacyField",
      label: "legacyField",
      message: "Legacy English message",
    });
  });

  it("falls back to the server message for codes without a translation", () => {
    const error = new ApiError({ status: 409, code: "some_future_code", message: "Server detail" });

    expect(describeApiError(error, "pt-BR", tFor("pt-BR")).message).toBe("Server detail");
  });

  it("translates client-side network and status failures in pt-BR", () => {
    const network = new ApiError({ message: "Network request failed" });
    const status = new ApiError({ status: 502, message: "API request failed with status 502" });

    expect(describeApiError(network, "pt-BR", tFor("pt-BR")).message).toBe(
      "Falha de rede. Verifique sua conexão e tente novamente.",
    );
    expect(describeApiError(status, "pt-BR", tFor("pt-BR")).message).toBe(
      "A solicitação falhou (status 502).",
    );
  });

  it("labels indexed batch fields with the item position in pt-BR", () => {
    const error = new ApiError({
      status: 400,
      code: "validation_failed",
      message: "Validation failed",
      fields: { "items.1.priceListItemId": "Only active Canteen price-list items may be recorded in a Canteen batch" },
      fieldCodes: { "items.1.priceListItemId": "canteen_item_required" },
    });

    expect(describeApiError(error, "pt-BR", tFor("pt-BR")).fields).toEqual([
      {
        field: "items.1.priceListItemId",
        label: "Item 2 — Item da lista de preços",
        message:
          "Somente itens ativos da Cantina na lista de preços podem ser registrados em um lote da Cantina",
      },
    ]);
  });

  it("labels bulk-planning row fields with the row position in pt-BR", () => {
    const error = new ApiError({
      status: 400,
      code: "validation_failed",
      message: "Validation failed",
      fields: { "rows[0].collaboratorId": "Collaborator can only appear once" },
      fieldCodes: { "rows[0].collaboratorId": "duplicate_collaborator" },
    });

    expect(describeApiError(error, "pt-BR", tFor("pt-BR")).fields).toEqual([
      {
        field: "rows[0].collaboratorId",
        label: "Item 1 — Colaborador",
        message: "Este Colaborador aparece mais de uma vez",
      },
    ]);
  });

  it("describes non-API errors without inventing a translation", () => {
    expect(describeApiError(new Error("Boom"), "en-US", tFor("en-US")).message).toBe("Boom");
    // Client-side Error text is English, so other locales get a translated generic message.
    expect(describeApiError(new Error("Boom"), "pt-BR", tFor("pt-BR")).message).toBe("Erro inesperado");
    expect(describeApiError("not an error", "pt-BR", tFor("pt-BR")).message).toBe("Erro inesperado");
  });
});
