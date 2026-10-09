import { getFormulaFunctionMetadata } from "@sheetcraft/core/formula";

export type FormulaFunctionLocalizedSource = Readonly<{
  description: string;
  example: string;
}>;

export function createFormulaFunctionCopy(
  source: Readonly<Record<string, FormulaFunctionLocalizedSource>>,
  argumentLabels: Readonly<Record<string, string>>,
) {
  return Object.fromEntries(
    getFormulaFunctionMetadata().map((metadata) => {
      const localized = source[metadata.name];
      const argumentsText = metadata.arguments
        .map((argument) => {
          const label = argumentLabels[argument.name]!;
          return argument.optional ? `[${label}]` : label;
        })
        .join(", ");
      const variadic =
        metadata.maxArgs === null ? [argumentsText, "…"].filter(Boolean).join(", ") : argumentsText;
      return [metadata.name, { ...localized!, signature: `${metadata.name}(${variadic})` }];
    }),
  );
}
