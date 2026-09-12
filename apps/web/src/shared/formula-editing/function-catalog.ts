import {
  getFormulaFunctionMetadata,
  type FormulaFunctionMetadata,
} from "@idea10/core/formula";

export const FORMULA_CATEGORY_ORDER = [
  "Math",
  "Logical",
  "Statistical",
  "Text",
  "Date",
  "Financial",
  "Information",
  "Lookup",
  "Engineering",
] as const;
export type FormulaCategory = (typeof FORMULA_CATEGORY_ORDER)[number];

export type FormulaFunctionCopy = Readonly<{
  description: string;
  signature: string;
  example: string;
}>;
export type FormulaCatalogEntry = FormulaFunctionMetadata & FormulaFunctionCopy;
export type FormulaCatalogTranslator = (
  key: `formulaFunctions.${string}.${"description" | "signature" | "example"}`,
) => string;
export type FormulaCategoryTranslator = (
  key: `formulaTools.${"math" | "logical" | "statistical" | "text" | "dateTime" | "financial" | "information" | "lookup" | "engineering"}`,
) => string;

const categoryKeys: Record<
  FormulaCategory,
  `formulaTools.${"math" | "logical" | "statistical" | "text" | "dateTime" | "financial" | "information" | "lookup" | "engineering"}`
> = {
  Math: "formulaTools.math",
  Logical: "formulaTools.logical",
  Statistical: "formulaTools.statistical",
  Text: "formulaTools.text",
  Date: "formulaTools.dateTime",
  Financial: "formulaTools.financial",
  Information: "formulaTools.information",
  Lookup: "formulaTools.lookup",
  Engineering: "formulaTools.engineering",
};

function localCopy(
  name: string,
  t: FormulaCatalogTranslator,
): FormulaFunctionCopy {
  const description = t(`formulaFunctions.${name}.description`);
  const signature = t(`formulaFunctions.${name}.signature`);
  const example = t(`formulaFunctions.${name}.example`);
  return { description, signature, example };
}

export function getFormulaCatalogEntries(
  t: FormulaCatalogTranslator,
  metadata = getFormulaFunctionMetadata(),
): readonly FormulaCatalogEntry[] {
  return metadata.map((item) => ({ ...item, ...localCopy(item.name, t) }));
}

export function getFormulaCatalogEntry(
  name: string,
  t: FormulaCatalogTranslator,
): FormulaCatalogEntry | undefined {
  return getFormulaCatalogEntries(t).find(
    (item) => item.name === name.toUpperCase(),
  );
}

export function getFormulaCategoryLabel(
  category: string,
  t: FormulaCategoryTranslator,
): string {
  const key = categoryKeys[category as FormulaCategory];
  return key ? t(key) : category;
}
