import type {
  FormulaFunctionDefinition,
  FormulaFunctionMetadata,
  FormulaFunctionRegistry,
} from "./functions/contracts.js";
import { DATE_FUNCTIONS } from "./functions/date.js";
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
  ...INFORMATION_FUNCTIONS,
  ...LOOKUP_FUNCTIONS,
  ...TEXT_FUNCTIONS,
  ...DATE_FUNCTIONS,
  ...FINANCIAL_FUNCTIONS,
  ...ENGINEERING_FUNCTIONS,
] as const satisfies readonly FormulaFunctionDefinition[];

const definitionsByName = new Map(DEFINITIONS.map((item) => [item.metadata.name, item]));
const metadata = DEFINITIONS.map((item) => item.metadata);

export const DEFAULT_FORMULA_FUNCTION_REGISTRY: FormulaFunctionRegistry = Object.freeze({
  get: (name) => definitionsByName.get(name.toUpperCase()),
  list: () => metadata,
});

export function getFormulaFunctionMetadata(
  registry: FormulaFunctionRegistry = DEFAULT_FORMULA_FUNCTION_REGISTRY,
): readonly FormulaFunctionMetadata[] {
  return registry.list();
}
