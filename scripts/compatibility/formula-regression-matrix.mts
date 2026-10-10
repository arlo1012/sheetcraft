import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { format } from "oxfmt";
import {
  DEFAULT_FORMULA_FUNCTION_REGISTRY,
  createFormulaError,
  getFormulaFunctionMetadata,
  isFormulaErrorCode,
  parseFormula,
  type FormulaExpression,
  type FormulaRuntimeValue,
} from "../../packages/core/src/formula/index.js";
import {
  REGISTRY_COVERAGE_CASES,
  type RegistryCoverageCase,
} from "../../packages/core/src/tests/formula/registry-coverage-cases.js";
import { referencedCoverageCase } from "../../packages/core/src/tests/formula/registry-coverage-references.js";
import { functionRegistrationOffset, sourceFiles } from "./formula-regression-discovery.mts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const registryTest = "packages/core/src/tests/formula/registry-coverage.test.ts";
const timePartTest = "packages/core/src/tests/formula/time-part-functions.test.ts";
const gapCasesFile = "packages/core/src/tests/formula/registry-coverage-cases.ts";
const toolbarFile = "apps/web/src/modules/formula-tools/components/FormulaToolbar.vue";
const categoryFile = "apps/web/src/modules/formula-tools/components/FormulaCategoryMenu.vue";
const browserFile = "apps/web/src/modules/formula-tools/components/FormulaFunctionBrowser.vue";
const catalogFile = "apps/web/src/shared/formula-editing/function-catalog.ts";
const metadata = getFormulaFunctionMetadata();
const names = new Set(metadata.map((item) => item.name));
const source = (path: string) => readFileSync(resolve(root, path), "utf8");
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const files = (directory: string): string[] => sourceFiles(root, directory);

type Scenario = { file: string; line: number; formula: string; functions: string[] };
function functionNames(expression: FormulaExpression): string[] {
  const result: string[] = [];
  function visit(item: FormulaExpression): void {
    if (item.kind === "function") {
      result.push(item.name.toUpperCase());
      item.args.forEach(visit);
    } else if (item.kind === "binary") {
      visit(item.left);
      visit(item.right);
    } else if (item.kind === "unary") visit(item.operand);
    else if (item.kind === "array") item.rows.flat().forEach(visit);
  }
  visit(expression);
  return [...new Set(result)].filter((name) => names.has(name));
}

function scenarios(file: string): Scenario[] {
  const text = source(file);
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const result: Scenario[] = [];
  function visit(node: ts.Node): void {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (node.text.startsWith("=")) {
        const parsed = parseFormula(node.text);
        if (parsed.ok) {
          const functions = functionNames(parsed.ast.expression);
          if (functions.length)
            result.push({
              file,
              line: tree.getLineAndCharacterOfPosition(node.getStart()).line + 1,
              formula: node.text,
              functions,
            });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return result;
}

const testFiles = files("packages/core/src/tests/formula")
  .filter((file) => file.endsWith(".test.ts") && file !== registryTest && file !== timePartTest)
  // Parse/copy/dependency tests are valuable but do not establish a function result.
  .filter(
    (file) => !/\/(?:parser|references|reference-model\/reference-model)\.test\.ts$/.test(file),
  );
const existingScenarios = testFiles.flatMap(scenarios);
type ExistingExpectedCase = RegistryCoverageCase & {
  sourceTest: string;
  sourceExpectedExpression: string;
};
/** Read expectation constants, never evaluate a Core formula to produce an oracle. */
function staticExpected(node: ts.Expression): FormulaRuntimeValue | undefined {
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isStringLiteral(node)) return node.text;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isParenthesizedExpression(node)) return staticExpected(node.expression);
  if (ts.isPropertyAccessExpression(node) && node.getText() === "Math.PI") return Math.PI;
  if (ts.isPrefixUnaryExpression(node)) {
    const operand = staticExpected(node.operand);
    if (typeof operand !== "number") return undefined;
    return node.operator === ts.SyntaxKind.MinusToken
      ? -operand
      : node.operator === ts.SyntaxKind.PlusToken
        ? operand
        : undefined;
  }
  if (ts.isBinaryExpression(node)) {
    const left = staticExpected(node.left),
      right = staticExpected(node.right);
    if (typeof left !== "number" || typeof right !== "number") return undefined;
    const operators: Record<number, () => number> = {
      [ts.SyntaxKind.PlusToken]: () => left + right,
      [ts.SyntaxKind.MinusToken]: () => left - right,
      [ts.SyntaxKind.AsteriskToken]: () => left * right,
      [ts.SyntaxKind.SlashToken]: () => left / right,
    };
    return operators[node.operatorToken.kind]?.();
  }
  if (
    ts.isCallExpression(node) &&
    node.expression.getText() === "createFormulaError" &&
    node.arguments[0] &&
    ts.isStringLiteral(node.arguments[0]) &&
    isFormulaErrorCode(node.arguments[0].text)
  )
    return createFormulaError(node.arguments[0].text);
  return undefined;
}

const existingExpectedCases: ExistingExpectedCase[] = [];
for (const file of testFiles) {
  const tree = ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true);
  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ["toBe", "toEqual", "toBeCloseTo"].includes(node.expression.name.text)
    ) {
      const assertion = node.expression.expression;
      if (
        ts.isCallExpression(assertion) &&
        assertion.expression.getText() === "expect" &&
        assertion.arguments[0] &&
        ts.isCallExpression(assertion.arguments[0])
      ) {
        const calculation = assertion.arguments[0];
        const formula = calculation.arguments[0];
        const expectedNode = node.arguments[0];
        if (
          ["evaluateFormula", "evaluateFormulaRuntime"].includes(
            calculation.expression.getText(),
          ) &&
          formula &&
          ts.isStringLiteral(formula) &&
          expectedNode
        ) {
          const parsed = parseFormula(formula.text);
          const expected = staticExpected(expectedNode);
          if (parsed.ok && expected !== undefined) {
            for (const name of functionNames(parsed.ast.expression)) {
              const scenario = { name, formula: formula.text, expected };
              const referenced = referencedCoverageCase(scenario);
              // Original worksheet references need their own resolver data; retain their existing tests.
              const hasReferences = /\b\$?[A-Z]{1,3}\$?[1-9]\d*\b/.test(formula.text);
              if (!hasReferences && referenced.formula !== formula.text)
                existingExpectedCases.push({
                  ...scenario,
                  ...(node.expression.name.text === "toBeCloseTo"
                    ? {
                        precision:
                          typeof staticExpected(
                            node.arguments[1] ?? ts.factory.createNumericLiteral(2),
                          ) === "number"
                            ? (staticExpected(
                                node.arguments[1] ?? ts.factory.createNumericLiteral(2),
                              ) as number)
                            : 2,
                      }
                    : {}),
                  sourceTest: `${file}#L${tree.getLineAndCharacterOfPosition(node.getStart()).line + 1}`,
                  sourceExpectedExpression: expectedNode.getText(tree),
                });
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
}

const supplementalReferenceCases: readonly RegistryCoverageCase[] = [
  { name: "DEGREES", formula: "=DEGREES(3.141592653589793)", expected: 180 },
  {
    name: "FILTER",
    formula: "=FILTER({1,10;2,20;3,30},{TRUE;FALSE;TRUE})",
    expected: {
      kind: "formula-array",
      rows: [
        [1, 10],
        [3, 30],
      ],
    },
  },
  {
    name: "TAKE",
    formula: "=TAKE({1,2;3,4},1)",
    expected: { kind: "formula-array", rows: [[1, 2]] },
  },
  {
    name: "HSTACK",
    formula: "=HSTACK({1;2},{3;4})",
    expected: {
      kind: "formula-array",
      rows: [
        [1, 3],
        [2, 4],
      ],
    },
  },
  {
    name: "SORT",
    formula: "=SORT({3,30;1,10;2,20},1,1)",
    expected: {
      kind: "formula-array",
      rows: [
        [1, 10],
        [2, 20],
        [3, 30],
      ],
    },
  },
  {
    name: "UNIQUE",
    formula: "=UNIQUE({1;2;1;3})",
    expected: { kind: "formula-array", rows: [[1], [2], [3]] },
  },
  { name: "ROW", formula: "=ROW(A11)", expected: 11 },
  { name: "COLUMN", formula: "=COLUMN(AE1)", expected: 31 },
];
const additionalScenarios = [...scenarios(registryTest), ...scenarios(timePartTest)];
const fixtureScenarios = scenarios(gapCasesFile);
const allScenarios = [...existingScenarios, ...additionalScenarios, ...fixtureScenarios];
const implementationFiles = files("packages/core/src/formula/functions").filter(
  (file) => file.endsWith(".ts") && !/\/(?:contracts|helpers)\.ts$/.test(file),
);
const implementationTexts = implementationFiles.map((file) => ({ file, text: source(file) }));
const toolbar = source(toolbarFile);
const categoryOrder = [...toolbar.matchAll(/<FormulaCategoryMenu\s+category="([^"]+)"/g)].map(
  (match) => match[1]!,
);
const autoSumFunctions = [...toolbar.matchAll(/data-formula-aggregate="([^"]+)"/g)].map(
  (match) => match[1]!,
);
const directFunctions = [...toolbar.matchAll(/data-formula-function="([^"]+)"/g)].map(
  (match) => match[1]!,
);
const browserUsesRegistry = source(browserFile).includes("getFormulaCatalogEntries(translate)");
const categoryUsesRegistry = source(categoryFile).includes("getFormulaCatalogEntries(translate)");
const catalogUsesRegistry = source(catalogFile).includes("metadata = getFormulaFunctionMetadata()");
if (!browserUsesRegistry || !categoryUsesRegistry || !catalogUsesRegistry)
  throw new Error("Formula menu discovery contract changed; inspect before regenerating.");
const microsoftInventory = JSON.parse(source("docs/compatibility/function-inventory.json")) as {
  functions: Array<{ name: string; sourceUrl: string }>;
};
const strictNumericNames = new Set([
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
]);
const zeroArgumentNames = new Set(
  metadata.filter((item) => item.maxArgs === 0).map((item) => item.name),
);
const independentCaseLine = source(registryTest)
  .slice(0, source(registryTest).indexOf('"$name: independently expected result"'))
  .split("\n").length;

const functions = metadata.map((item) => {
  const current = allScenarios.filter((scenario) => scenario.functions.includes(item.name));
  const baseline = existingScenarios.filter((scenario) => scenario.functions.includes(item.name));
  const fixture = REGISTRY_COVERAGE_CASES.find((scenario) => scenario.name === item.name);
  const generatedBaseConversion = /^(?:BIN|OCT|HEX)2(?:BIN|OCT|HEX)$/.test(item.name);
  const implementation =
    implementationTexts.find(({ text }) => functionRegistrationOffset(text, item.name) >= 0) ??
    (generatedBaseConversion
      ? implementationTexts.find(({ file }) => file.endsWith("/engineering.ts"))
      : undefined);
  if (!implementation || !DEFAULT_FORMULA_FUNCTION_REGISTRY.get(item.name)?.evaluate)
    throw new Error(`Missing implemented function: ${item.name}`);
  if (!current.length) throw new Error(`Missing independent calculation scenario: ${item.name}`);
  const offset = generatedBaseConversion
    ? implementation.text.indexOf("name: `${labels[from]}2${labels[to]}`")
    : functionRegistrationOffset(implementation.text, item.name);
  const referenceCases = current.filter((scenario) =>
    /\b\$?[A-Z]{1,3}\$?[1-9]\d*\b/.test(scenario.formula),
  );
  const errorCases = current.filter((scenario) => /#[A-Z0-9/]+[!?]?/.test(scenario.formula));
  const literalKinds = [
    ...new Set(
      current.flatMap((scenario) => [
        ...(scenario.formula.includes('"') ? ["text"] : []),
        ...(scenario.formula.match(/\b(?:TRUE|FALSE)\b/i) ? ["logical"] : []),
        ...(scenario.formula.match(/\b\d+(?:\.\d+)?\b/) ? ["numeric"] : []),
        ...(scenario.formula.match(/\{/) ? ["array"] : []),
        ...(scenario.formula.match(/,\s*[,)]/) ? ["omitted"] : []),
      ]),
    ),
  ];
  const testLinks = [
    ...new Set(
      current.flatMap((scenario) =>
        scenario.file === gapCasesFile
          ? [`${gapCasesFile}#L${scenario.line}`, `${registryTest}#L${independentCaseLine}`]
          : [`${scenario.file}#L${scenario.line}`],
      ),
    ),
  ];
  const typedReferenceVariant = fixture && !zeroArgumentNames.has(item.name);
  const addedReferenceCase =
    !referenceCases.length && !typedReferenceVariant && !zeroArgumentNames.has(item.name)
      ? (existingExpectedCases.find((scenario) => scenario.name === item.name) ??
        supplementalReferenceCases.find((scenario) => scenario.name === item.name) ??
        null)
      : null;
  if (addedReferenceCase) {
    const line = source(registryTest)
      .slice(0, source(registryTest).indexOf('"$name: preserves its existing asserted result"'))
      .split("\n").length;
    testLinks.push(`${registryTest}#L${line}`);
  }
  return {
    name: item.name,
    metadata: item,
    entry: {
      categoryMenu: categoryOrder.includes(item.category) ? item.category : null,
      allFunctionsBrowser: true,
      autoSum: autoSumFunctions.includes(item.name),
      autoSumConditional: directFunctions.includes(item.name),
      catalogSource: catalogFile,
    },
    implementation: {
      file: implementation.file,
      line: implementation.text.slice(0, offset).split("\n").length,
      registry: "packages/core/src/formula/functions.ts",
      runtime: "first-party Core",
    },
    arguments: {
      signature: `${item.name}(${item.arguments.map((argument) => (argument.optional ? `[${argument.name}]` : argument.name)).join(", ")})`,
      min: item.minArgs,
      max: item.maxArgs,
      belowMinimumTest:
        item.minArgs > 0
          ? `${registryTest}: below minimum arity returns VALUE`
          : "n/a: minimum is zero",
      aboveMaximumTest:
        item.maxArgs !== null
          ? `${registryTest}: above maximum arity returns VALUE`
          : "n/a: variadic registry contract",
    },
    coercion: {
      observedInputs: literalKinds,
      strictNumericTypedErrorTests: strictNumericNames.has(item.name) ? registryTest : null,
      typedReferenceVariant: typedReferenceVariant
        ? `${registryTest}: references preserve typed values`
        : null,
      scope: "Only linked input types are evidenced. No complete Excel/WPS coercion claim.",
      contractNotes: strictNumericNames.has(item.name)
        ? "Core accepts finite numbers, preserves typed errors, and returns VALUE for numeric text, logical values, and blank numeric inputs. This intentionally bounded contract is stricter than Excel coercion."
        : "The listed formulas record concrete typed inputs. Additional coercion behavior must be read in the linked implementation and is not inferred from metadata or other functions.",
    },
    errors: {
      arityValueError: item.minArgs > 0 || item.maxArgs !== null,
      typedErrorInputCases: errorCases.map(({ file, line, formula }) => ({ file, line, formula })),
      strictNumericTypedErrorTest: strictNumericNames.has(item.name) ? registryTest : null,
    },
    references: {
      applicable: !zeroArgumentNames.has(item.name),
      scenarios: referenceCases.map(({ file, line, formula }) => ({ file, line, formula })),
      typedReferenceVariant: typedReferenceVariant ? registryTest : null,
      existingExpectedReferenceVariant: addedReferenceCase ? registryTest : null,
      scope:
        "Cell/range cases plus generated typed cell or matrix replacements for literal arguments; not every reference syntax for every function.",
    },
    boundaries: {
      arity: "automated per-function registry boundary checks",
      formulaCases: current.map(({ formula }) => formula),
      exhaustive: false,
    },
    remainingCoverageGaps: [
      ...(!zeroArgumentNames.has(item.name) &&
      !referenceCases.length &&
      !typedReferenceVariant &&
      !addedReferenceCase
        ? ["No direct cell/range scenario for this function yet."]
        : []),
      ...(!zeroArgumentNames.has(item.name) &&
      !errorCases.length &&
      !strictNumericNames.has(item.name)
        ? [
            "No inline typed-error-input scenario recorded by literal discovery; arity error boundaries are tested. Referenced errors and template-driven error cases may exist in linked tests.",
          ]
        : []),
      ...(!zeroArgumentNames.has(item.name) &&
      !strictNumericNames.has(item.name) &&
      literalKinds.filter((kind) => ["text", "logical", "omitted"].includes(kind)).length === 0
        ? [
            "No dedicated mixed-type coercion scenario; numeric/array calculation cases and typed references where listed are tested.",
          ]
        : []),
      "Not exhaustive across all numeric extremes, reference syntaxes, locales, or cross-app versions.",
    ],
    tests: testLinks,
    existingScenarioCount: baseline.length,
    addedIndependentCase: fixture ?? null,
    addedReferenceCase,
    sourceDocumentation: {
      excel:
        microsoftInventory.functions.find((entry) => entry.name === item.name)?.sourceUrl ?? null,
      provenance:
        "Existing official function inventory link; not proof of a cross-app execution result.",
    },
    compatibility: {
      firstPartyCalculation: "automated scenario evidence",
      excelDesktop: "representative workbook acceptance is tracked separately",
      wpsDesktop: "representative workbook acceptance is tracked separately",
      comprehensiveCrossAppParity: false,
    },
  };
});

const document = {
  schemaVersion: 1,
  capturedAt: "2026-10-09",
  purpose:
    "Complete current first-party registry regression gate, separate from actual menu operations and the historical Excel function catalog.",
  methodology: {
    expectedValues:
      "Reuse existing assertions; add hand-calculated fixed results or documented stochastic bounds only for uncovered functions. No self-generated calculation oracle and no third-party runtime.",
    scenarioDiscovery:
      "TypeScript literal formula ASTs in Core calculation scenario files; parser/copy-only tests excluded. Scenarios are linked source evidence, not a substitute for running their tests.",
    commands: [
      "bun scripts/compatibility/formula-regression-matrix.mts --check",
      "cd packages/core && bun run test src/tests/formula src/tests/commands/filter-wps-conditions.test.ts",
      "bun run --filter @sheetcraft/core typecheck",
      "bun run --filter @sheetcraft/compatibility-lab qualify",
    ],
    excludes: [
      "All historical Excel functions",
      "Exhaustive per-function combinations or locale coercion",
      "UI insertion/extraction behavior",
      "All 240 functions executed in each desktop application",
    ],
  },
  counts: {
    registered: metadata.length,
    categories: categoryOrder.length,
    existingCalculationScenarios: new Set(
      existingScenarios.flatMap((scenario) => scenario.functions),
    ).size,
    addedIndependentFunctionCases: REGISTRY_COVERAGE_CASES.length,
    addedExistingExpectedReferenceCases: functions.filter((item) => item.addedReferenceCase).length,
    referenceApplicableFunctions: metadata.filter((item) => item.maxArgs !== 0).length,
    functionsWithReferenceEvidence: functions.filter(
      (item) =>
        item.references.scenarios.length ||
        item.references.typedReferenceVariant ||
        item.references.existingExpectedReferenceVariant,
    ).length,
    functionsWithLinkedCalculationEvidence: functions.length,
  },
  actualMenuInventory: {
    source: toolbarFile,
    topLevelControls: [
      "Insert Function",
      "AutoSum",
      ...categoryOrder,
      "Name Manager",
      "Quick Create Names",
      "Recalculate",
    ],
    topLevelControlCount: 5 + categoryOrder.length,
    autoSumMenu: [...autoSumFunctions, ...directFunctions, "Other Functions"],
    categoryMenus: categoryOrder.map((category) => ({
      category,
      entries: metadata.filter((item) => item.category === category).map((item) => item.name),
    })),
    functionBrowser: {
      allEntries: metadata.map((item) => item.name),
      filters: ["all", "recent when nonempty", ...categoryOrder],
    },
    quickCreateNamesOptions: ["top", "left", "bottom", "right"],
    calculationOptions: ["automatic", "manual", "iterative", "maxIterations", "maxChange"],
    distinction:
      "Toolbar controls and menu commands are not the function count. Category and browser function entries are registry-derived.",
  },
  officialComparisons: [
    {
      functions: ["SUBTOTAL"],
      excel: "https://support.microsoft.com/en-us/excel/functions/subtotal-function",
      wps: "https://www.wps.cn/learning/course/detail/id/158?sid=517",
      finding:
        "Both exclude filtered-out rows and nested subtotals. The filter regression fixture's visible 10 and 9 therefore sum to 19, not 20.",
    },
    {
      functions: ["HOUR", "MINUTE", "SECOND"],
      excel: "https://support.microsoft.com/en-us/excel/functions/hour-function",
      wps: "https://www.wps.cn/learning/room/d/326896",
      finding:
        "Both document the fractional-day time representation; 0.5 denotes noon. Time-part extraction must preserve fractions. Text time parsing remains outside the current strict numeric contract.",
    },
    {
      functions: ["PERCENTRANK.INC", "PERCENTRANK.EXC", "PERCENTRANK"],
      excel: "https://support.microsoft.com/en-us/excel/functions/percentrank-exc-function",
      wps: "https://www.wps.cn/learning/room/d/326873",
      finding:
        "Both document interpolation for nonmatching x; inclusive and exclusive endpoint formulas remain distinct. The symmetric middle fixture has an independently derived rank of 0.5 in either form.",
    },
    {
      functions: ["MROUND"],
      excel: "https://support.microsoft.com/en-us/excel/functions/mround-function",
      wps: null,
      finding:
        "Official Microsoft worked example -10,-3 gives -9, opposite signs give NUM. Decimal midpoint ambiguities are intentionally not treated as an exact parity promise.",
    },
  ],
  functions,
};

const json = `${JSON.stringify(document, null, 2)}\n`;
const categoryCounts = categoryOrder
  .map((category) => `${category}: ${metadata.filter((item) => item.category === category).length}`)
  .join("; ");
const md = [
  "# Current formula regression matrix",
  "",
  `Captured 2026-10-09. Current implemented registry: **${metadata.length}** functions across **${categoryOrder.length}** categories.`,
  "",
  "## Menu inventory is separate",
  "",
  `The formula ribbon has ${document.actualMenuInventory.topLevelControlCount} top-level controls: Insert Function, AutoSum, 11 category menus, Name Manager, Quick Create Names, and Recalculate. AutoSum contains SUM, AVERAGE, COUNT, MAX, MIN, SUMIF, and Other Functions. Category menus and the All Functions browser both derive their function entries from Core metadata.`,
  "",
  categoryCounts,
  "",
  "## Automated evidence",
  "",
  `Existing calculation scenario files are reused for ${document.counts.existingCalculationScenarios} functions. The bounded coverage file adds ${REGISTRY_COVERAGE_CASES.length} independent cases for the original uncovered names, scalar-to-cell reference variants, registration/name checks for all 240 functions, below-minimum and above-maximum arity/error checks where applicable, and focused coercion/domain boundaries. Expected results are fixed hand calculations, existing assertions, or documented random bounds, never this engine's generated answers.`,
  "",
  `An additional ${document.counts.addedExistingExpectedReferenceCases} reference variants reuse existing assertion constants or small hand-calculated array/coordinate cases. All ${document.counts.referenceApplicableFunctions} functions that accept an argument have cell/range calculation evidence; the other seven are zero-argument functions. Reused expectations retain their original numeric tolerance and source link.`,
  "",
  "The JSON companion is the detailed per-function matrix: menu entry, implementation file/line, argument names and limits, tested input kinds, error scenarios, reference scenarios, boundary formulas, exact test links, and official-source provenance. Coverage means at least one independent calculation/error scenario for every current function, with explicit arity contracts; it does not mean every coercion, boundary, reference form, or application version is exhausted. Fields identify exactly which evidence exists.",
  "",
  "## Bounded findings",
  "",
  "- Filter/SUBTOTAL fixture: visible rows hold 10 and 9. Its asserted hidden intervals already establish the result 19. Correcting 20 to 19 repairs the assertion without changing calculation behavior.",
  "- Independent HOUR(0.5) coverage found and repaired a genuine fractional-time extraction defect; shared calendar decomposition floored the serial. HOUR, MINUTE, and SECOND now preserve fractions while calendar helpers retain day truncation.",
  "- No previous formula engine or XLSX engine is restored. Compatibility-lab continues to probe the public Core and native XLSX packages.",
  "",
  "## Official comparisons",
  "",
  ...document.officialComparisons.map(
    (comparison) =>
      `- ${comparison.functions.join(", ")}: ${comparison.finding} [Excel](${comparison.excel})${comparison.wps ? `; [WPS](${comparison.wps})` : "; WPS behavior is not independently documented by this entry."}`,
  ),
  "",
  "## Run and refresh",
  "",
  "- `bun scripts/compatibility/formula-regression-matrix.mts` regenerates this Markdown and the JSON from actual registry, menu source, and scenario source.",
  "- `bun scripts/compatibility/formula-regression-matrix.mts --check` fails if either matrix is stale or a function has no calculation scenario.",
  "- From packages/core: `bun run test src/tests/formula src/tests/commands/filter-wps-conditions.test.ts` runs all linked formula cases and the corrected visibility fixture.",
  "- `bun run --filter @sheetcraft/core typecheck` and the existing compatibility-lab qualification cover their owned boundaries.",
  "",
  "## Per-function index",
  "",
  "| Function | Category | Arity | Implementation | Calculation tests | Added independent result |",
  "| --- | --- | --- | --- | --- | --- |",
  ...functions.map(
    (item) =>
      `| ${item.name} | ${item.metadata.category} | ${item.arguments.min}–${item.arguments.max ?? "variadic"} | [source](../${item.implementation.file}#L${item.implementation.line}) | ${item.tests.map((link, index) => `[${index + 1}](../${link})`).join(" ")} | ${item.addedIndependentCase ? "yes" : "existing"} |`,
  ),
  "",
].join("\n");

for (const [path, rawText] of [
  ["docs/formula-regression-matrix.json", json],
  ["docs/formula-regression-matrix.md", md],
] as const) {
  const formatted = await format(path, rawText, { printWidth: 100 });
  if (formatted.errors.length) throw new Error(`Could not format ${path}`);
  const text = formatted.code;
  if (process.argv.includes("--check")) {
    if (source(path) !== text) throw new Error(`Stale ${path}; regenerate the matrix.`);
  } else writeFileSync(resolve(root, path), text);
}
console.log(
  JSON.stringify({
    counts: document.counts,
    matrixSha256: digest(json),
    checked: process.argv.includes("--check"),
  }),
);
