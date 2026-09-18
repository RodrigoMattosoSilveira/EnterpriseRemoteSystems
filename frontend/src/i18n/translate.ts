export type TranslationParameters = Record<string, string | number>;

export function interpolateMessage(
  message: string,
  parameters?: TranslationParameters,
): string {
  if (!parameters) {
    return message;
  }

  return message.replace(/\{([A-Za-z0-9_]+)\}/g, (placeholder, name: string) => {
    const value = parameters[name];
    return value === undefined ? placeholder : String(value);
  });
}
