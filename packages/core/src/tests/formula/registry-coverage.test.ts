import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  DEFAULT_FORMULA_FUNCTION_REGISTRY,
  createFormulaError,
  evaluateFormulaRuntime,
  getFormulaFunctionMetadata,
  type FormulaRuntimeValue,
  type FormulaValue,
} from "../../formula/index.js";
import {
  coverageResolver as resolver,
  referencedCoverageCase as referencedCase,
} from "./registry-coverage-references.js";
import { REGISTRY_COVERAGE_CASES, type RegistryCoverageCase } from "./registry-coverage-cases.js";

function assertCase(result: FormulaRuntimeValue, scenario: RegistryCoverageCase): void {
  if (scenario.numericInterval) {
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThanOrEqual(scenario.numericInterval[0]);
    expect(result).toBeLessThan(scenario.numericInterval[1]);
    if (scenario.integer) expect(Number.isInteger(result)).toBe(true);
  } else if (typeof scenario.expected === "number") {
    expect(result).toBeCloseTo(scenario.expected, scenario.precision ?? 12);
  } else {
    expect(result).toEqual(scenario.expected);
  }
}

describe("registered formula coverage gap scenarios", () => {
  test.each(REGISTRY_COVERAGE_CASES)("$name: independently expected result", (scenario) => {
    assertCase(evaluateFormulaRuntime(scenario.formula, resolver()), scenario);
  });
  test.each(REGISTRY_COVERAGE_CASES)("$name: references preserve typed values", (scenario) => {
    const referenced = referencedCase(scenario);
    assertCase(evaluateFormulaRuntime(referenced.formula, resolver(referenced.cells)), scenario);
  });
});

const matrixPath = fileURLToPath(
  new URL("../../../../../docs/formula-regression-matrix.json", import.meta.url),
);
const referenceCases = (
  JSON.parse(readFileSync(matrixPath, "utf8")) as {
    functions: Array<{ addedReferenceCase: RegistryCoverageCase | null }>;
  }
).functions.flatMap((entry) => (entry.addedReferenceCase ? [entry.addedReferenceCase] : []));

describe("existing independent expectations with typed references", () => {
  test.each(referenceCases)("$name: preserves its existing asserted result", (scenario) => {
    const referenced = referencedCase(scenario);
    assertCase(evaluateFormulaRuntime(referenced.formula, resolver(referenced.cells)), scenario);
  });
});

describe("complete first-party registry contracts", () => {
  const metadata = getFormulaFunctionMetadata();
  test.each(metadata)("$name: definition and canonical name entry", (item) => {
    const definition = DEFAULT_FORMULA_FUNCTION_REGISTRY.get(item.name);
    expect(typeof definition?.evaluate).toBe("function");
    expect(definition?.metadata).toEqual(item);
    expect(DEFAULT_FORMULA_FUNCTION_REGISTRY.get(item.name.toLowerCase())).toBe(definition);
    expect(DEFAULT_FORMULA_FUNCTION_REGISTRY.get(`_xlfn.${item.name}`)).toBe(definition);
  });
  test.each(metadata.filter((item) => item.minArgs > 0))(
    "$name: below minimum arity returns VALUE before argument evaluation",
    (item) => {
      const args = Array.from({ length: item.minArgs - 1 }, () => "#N/A").join(",");
      expect(evaluateFormulaRuntime(`=${item.name}(${args})`, resolver())).toEqual(
        createFormulaError("VALUE"),
      );
    },
  );
  test.each(metadata.filter((item) => item.maxArgs !== null))(
    "$name: above maximum arity returns VALUE before argument evaluation",
    (item) => {
      const args = Array.from({ length: item.maxArgs! + 1 }, () => "#N/A").join(",");
      expect(evaluateFormulaRuntime(`=${item.name}(${args})`, resolver())).toEqual(
        createFormulaError("VALUE"),
      );
    },
  );
  test("durable regression matrix matches all current registry metadata", () => {
    const path = fileURLToPath(
      new URL("../../../../../docs/formula-regression-matrix.json", import.meta.url),
    );
    const matrix = JSON.parse(readFileSync(path, "utf8")) as {
      functions: Array<{
        name: string;
        metadata: unknown;
        tests: unknown[];
        implementation: unknown;
      }>;
    };
    expect(matrix.functions.map((item) => item.name).sort()).toEqual(
      metadata.map((item) => item.name).sort(),
    );
    for (const item of metadata) {
      const row = matrix.functions.find((entry) => entry.name === item.name)!;
      expect(row.metadata).toEqual(item);
      expect(row.tests.length, item.name).toBeGreaterThan(0);
      expect(row.implementation, item.name).toBeTruthy();
    }
  });
});

describe("additional coercion, error, and domain boundaries", () => {
  test.each([
    "ABS",
    "INT",
    "SQRT",
    "SIGN",
    "TAN",
    "ACOS",
    "ATAN",
    "SINH",
    "COSH",
    "TANH",
    "ASINH",
    "ACOSH",
    "ATANH",
    "LOG10",
    "SQRTPI",
  ])("%s preserves typed errors and the current strict numeric contract", (name) => {
    expect(evaluateFormulaRuntime(`=${name}(#N/A)`, resolver())).toEqual(createFormulaError("NA"));
    expect(evaluateFormulaRuntime(`=${name}("1")`, resolver())).toEqual(
      createFormulaError("VALUE"),
    );
    expect(evaluateFormulaRuntime(`=${name}(TRUE)`, resolver())).toEqual(
      createFormulaError("VALUE"),
    );
    expect(evaluateFormulaRuntime(`=${name}(Z1)`, resolver())).toEqual(createFormulaError("VALUE"));
  });
  test.each([
    ["=SQRT(-1)", "NUM"],
    ["=ACOS(2)", "NUM"],
    ["=ACOSH(0)", "NUM"],
    ["=ATANH(1)", "NUM"],
    ["=LOG10(0)", "NUM"],
    ["=SQRTPI(-1)", "NUM"],
    ["=MROUND(5,-2)", "NUM"],
    ["=QUOTIENT(1,0)", "DIV0"],
    ["=RANDBETWEEN(2,1)", "NUM"],
    ["=GEOMEAN(0,1)", "NUM"],
    ["=HARMEAN(-1,2)", "NUM"],
    ["=PERCENTILE.EXC(A1:A4,0)", "NUM"],
    ["=QUARTILE.EXC(A1:A4,4)", "NUM"],
    ["=MODE.SNGL(1,2,3)", "NA"],
    ["=CHOOSE(0,1,2)", "VALUE"],
    ["=DROP({1;2},2)", "CALC"],
    ["=CHOOSECOLS({1,2},3)", "VALUE"],
    ["=CHOOSEROWS({1;2},0)", "VALUE"],
    ['=REPT("a",-1)', "VALUE"],
    ["=YEAR(99999999)", "NUM"],
    ['=OCT2DEC("8")', "NUM"],
    ['=BIN2HEX("2")', "NUM"],
    ['=OCT2BIN("8")', "NUM"],
    ['=HEX2OCT("G")', "NUM"],
  ] as const)("%s has independent %s boundary expectation", (formula, code) => {
    expect(evaluateFormulaRuntime(formula, resolver())).toEqual(createFormulaError(code));
  });
  test("aggregate direct coercion and referenced text/logical values are distinct", () => {
    const cells = new Map<string, FormulaValue>([
      ["0:30", "3"],
      ["1:30", true],
    ]);
    expect(evaluateFormulaRuntime('=PRODUCT("3",TRUE,2)', resolver(cells))).toBe(6);
    expect(evaluateFormulaRuntime("=PRODUCT(AE1:AE2,2)", resolver(cells))).toBe(2);
    expect(evaluateFormulaRuntime("=COUNTBLANK(D1:D4)", resolver())).toBe(2);
    expect(evaluateFormulaRuntime("=COUNTA(D1:D4)", resolver())).toBe(3);
    expect(evaluateFormulaRuntime("=N(TRUE)", resolver())).toBe(1);
    expect(evaluateFormulaRuntime("=N(#N/A)", resolver())).toEqual(createFormulaError("NA"));
    expect(evaluateFormulaRuntime("=ISERROR(#DIV/0!)", resolver())).toBe(true);
    expect(evaluateFormulaRuntime("=ISNA(#DIV/0!)", resolver())).toBe(false);
    expect(evaluateFormulaRuntime("=ISNUMBER(TRUE)", resolver())).toBe(false);
  });
});
