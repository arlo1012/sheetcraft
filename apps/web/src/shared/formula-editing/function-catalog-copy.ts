import { getFormulaFunctionMetadata } from "@idea10/core/formula";

export type FormulaFunctionLocalizedSource = Readonly<{
  description: string;
  example: string;
}>;

export function createFormulaFunctionCopy(
  source: Readonly<Record<string, FormulaFunctionLocalizedSource>>,
) {
  return Object.fromEntries(
    getFormulaFunctionMetadata().map((metadata) => {
      const localized = source[metadata.name];
      const argumentsText = metadata.arguments
        .map((argument) =>
          argument.optional ? `[${argument.name}]` : argument.name,
        )
        .join(", ");
      return [
        metadata.name,
        { ...localized!, signature: `${metadata.name}(${argumentsText})` },
      ];
    }),
  );
}
