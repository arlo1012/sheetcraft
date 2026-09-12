import type {
  FormulaFunctionDefinition,
  FormulaFunctionMetadata,
  FormulaFunctionRegistry,
} from "./functions/contracts.js";
import { DATE_FUNCTIONS } from "./functions/date.js";
import { DATABASE_FUNCTIONS } from "./functions/database.js";
import { DYNAMIC_ARRAY_FUNCTIONS } from "./functions/dynamic-array.js";
import { ENGINEERING_FUNCTIONS } from "./functions/engineering.js";
import { FINANCIAL_FUNCTIONS } from "./functions/financial.js";
import { INFORMATION_FUNCTIONS } from "./functions/information.js";
import { LOGICAL_FUNCTIONS } from "./functions/logical.js";
import { LOOKUP_FUNCTIONS } from "./functions/lookup.js";
import { MATH_FUNCTIONS } from "./functions/math.js";
import { STATISTICAL_FUNCTIONS } from "./functions/statistical.js";
import { TEXT_FUNCTIONS } from "./functions/text.js";

export type {
  FormulaFunctionArgument,
  FormulaFunctionArgumentMetadata,
  FormulaFunctionContext,
  FormulaFunctionDefinition,
  FormulaFunctionMetadata,
  FormulaFunctionRegistry,
} from "./functions/contracts.js";

const DEFINITIONS = [
  ...MATH_FUNCTIONS,
  ...LOGICAL_FUNCTIONS,
  ...STATISTICAL_FUNCTIONS,
  ...DATABASE_FUNCTIONS,
  ...DYNAMIC_ARRAY_FUNCTIONS,
  ...INFORMATION_FUNCTIONS,
  ...LOOKUP_FUNCTIONS,
  ...TEXT_FUNCTIONS,
  ...DATE_FUNCTIONS,
  ...FINANCIAL_FUNCTIONS,
  ...ENGINEERING_FUNCTIONS,
] as const satisfies readonly FormulaFunctionDefinition[];

const arrayFunctionNames = new Set<string>([
  ...DYNAMIC_ARRAY_FUNCTIONS.map((item) => item.metadata.name),
  "INDEX",
  "IF",
  "IFERROR",
  "IFNA",
  "IFS",
  "SWITCH",
  "CHOOSE",
]);
const definitionsByName = new Map(
  DEFINITIONS.map((item) => [
    item.metadata.name,
    arrayFunctionNames.has(item.metadata.name)
      ? { ...item, metadata: { ...item.metadata, arrayResult: true } }
      : item,
  ]),
);
const metadata = [...definitionsByName.values()].map((item) => item.metadata);

export const DEFAULT_FORMULA_FUNCTION_REGISTRY: FormulaFunctionRegistry = Object.freeze({
  get: (name) => definitionsByName.get(normalizeFormulaFunctionName(name)),
  list: () => metadata,
});

/** OOXML prefixes mark newer functions; the runtime registry uses their canonical names. */
export function normalizeFormulaFunctionName(name: string): string {
  return name.toUpperCase().replace(/^_XLFN\.(?:_XLWS\.)?/, "");
}

export function getFormulaFunctionMetadata(
  registry: FormulaFunctionRegistry = DEFAULT_FORMULA_FUNCTION_REGISTRY,
): readonly FormulaFunctionMetadata[] {
  return registry.list();
}
