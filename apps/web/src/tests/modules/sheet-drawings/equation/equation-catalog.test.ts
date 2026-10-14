import { describe, expect, test } from "vitest";
import {
  normalizeEquationDocument,
  serializeEquationDocument,
  walkEquationDocument,
  type EquationDocument,
} from "@sheetcraft/core/equation-document";
import {
  EQUATION_PRESETS,
  EQUATION_PRESET_IDS,
  EQUATION_STRUCTURE_CATEGORIES,
  EQUATION_SYMBOL_CATEGORIES,
  EQUATION_TEMPLATES,
  createEquationPreset,
  createEquationTemplate,
} from "../../../../modules/sheet-drawings/equation/equation-catalog";
import { renderEquationSource } from "../../../../modules/sheet-drawings/equation/equation-render";

function ids(prefix: string) {
  let next = 0;
  return () => `${prefix}-${++next}`;
}
function assertDocument(document: EquationDocument) {
  expect(normalizeEquationDocument(document)).toEqual(document);
  const seen: string[] = [];
  walkEquationDocument(document, (node) => seen.push(node.id));
  expect(new Set(seen).size).toBe(seen.length);
  expect(renderEquationSource(serializeEquationDocument(document)).status).toBe("ready");
}
describe("public mathematical Equation catalog", () => {
  test("13 confirmed presets keep observed order, local labels and valid mathematical mirrors", () => {
    expect(EQUATION_PRESETS.map((choice) => choice.id)).toEqual(EQUATION_PRESET_IDS);
    expect(EQUATION_PRESETS).toHaveLength(13);
    for (const choice of EQUATION_PRESETS) {
      const document = createEquationPreset(choice.id, ids(choice.id));
      assertDocument(document);
      expect(serializeEquationDocument(document)).toBe(choice.source);
      expect(choice.label["en-US"]).toBeTruthy();
      expect(choice.label["zh-CN"]).toBeTruthy();
    }
  });
  test("preset sums keep observed under-over bounds and generic functions keep math letters", () => {
    for (const id of ["binomial-theorem", "fourier-series", "average"] as const) {
      const document = createEquationPreset(id, ids(id));
      walkEquationDocument(document, (node) => {
        if (node.kind === "nary" && node.operator === "sum") expect(node.limits).toBe("under-over");
      });
    }
    expect(EQUATION_PRESETS.find((choice) => choice.id === "fourier-series")!.source).not.toContain(
      "operatorname{f}",
    );
    expect(
      EQUATION_PRESETS.find((choice) => choice.id === "fundamental-calculus")!.source,
    ).not.toContain("operatorname{F}");
  });
  test("all 11 structure categories are concrete, uniquely identified and usable", () => {
    expect(EQUATION_STRUCTURE_CATEGORIES.map((choice) => choice.id)).toEqual([
      "fraction",
      "script",
      "radical",
      "integral",
      "large-operator",
      "bracket",
      "function",
      "accent",
      "limit-log",
      "operator",
      "matrix",
    ]);
    expect(new Set(EQUATION_TEMPLATES.map((choice) => choice.id)).size).toBe(
      EQUATION_TEMPLATES.length,
    );
    for (const category of EQUATION_STRUCTURE_CATEGORIES)
      expect(EQUATION_TEMPLATES.some((choice) => choice.category === category.id)).toBe(true);
    for (const choice of EQUATION_TEMPLATES) {
      const createId = ids(choice.id);
      const document: EquationDocument = {
        kind: "equation-document-v1",
        body: {
          id: createId(),
          kind: "sequence",
          children: [createEquationTemplate(choice.id, createId)],
        },
      };
      assertDocument(document);
      expect(renderEquationSource(choice.source).status, choice.id).toBe("ready");
      expect(["observed", "sheetcraft"]).toContain(choice.origin);
    }
  });
  test("clear observed structure inventory counts and group headings are preserved", () => {
    for (const [category, count] of [
      ["fraction", 9],
      ["radical", 6],
      ["integral", 21],
      ["large-operator", 40],
      ["bracket", 41],
      ["limit-log", 8],
      ["matrix", 22],
    ] as const) {
      expect(
        EQUATION_TEMPLATES.filter((choice) => choice.category === category),
        category,
      ).toHaveLength(count);
    }
    expect(
      EQUATION_TEMPLATES.filter(
        (choice) => choice.category === "function" && choice.origin === "observed",
      ),
    ).toHaveLength(27);
    const accentGroups = new Set(
      EQUATION_TEMPLATES.filter((choice) => choice.category === "accent").map(
        (choice) => choice.group["en-US"],
      ),
    );
    expect(accentGroups).toEqual(
      new Set([
        "Accents",
        "Sheetcraft mathematical choices",
        "Boxed Formulas",
        "Overbars and Underbars",
        "Common Accent Objects",
      ]),
    );
  });
  test("templates create independent node and slot IDs for every insertion", () => {
    const createId = ids("fresh"),
      all: string[] = [];
    for (const choice of EQUATION_TEMPLATES)
      for (let repeat = 0; repeat < 2; repeat++) {
        const document: EquationDocument = {
          kind: "equation-document-v1",
          body: {
            id: createId(),
            kind: "sequence",
            children: [createEquationTemplate(choice.id, createId)],
          },
        };
        walkEquationDocument(document, (node) => all.push(node.id));
      }
    expect(new Set(all).size).toBe(all.length);
    expect(() => createEquationTemplate("not-a-template", createId)).toThrow(TypeError);
  });
  test("eight symbol categories have unique IDs, safe insertion and KaTeX-ready previews", () => {
    expect(EQUATION_SYMBOL_CATEGORIES.map((choice) => choice.id)).toEqual([
      "basic",
      "greek",
      "letter-like",
      "operators",
      "arrows",
      "negated-relations",
      "scripts",
      "geometry",
    ]);
    const all = EQUATION_SYMBOL_CATEGORIES.flatMap((category) => category.symbols);
    expect(new Set(all.map((symbol) => symbol.id)).size).toBe(all.length);
    for (const symbol of all) {
      expect(symbol.label["zh-CN"]).toBeTruthy();
      expect(symbol.group["en-US"]).toBeTruthy();
      expect(renderEquationSource(symbol.source).status, symbol.id).toBe("ready");
      const createId = ids(symbol.id);
      const document: EquationDocument = {
        kind: "equation-document-v1",
        body: {
          id: createId(),
          kind: "sequence",
          children: [{ id: createId(), ...symbol.insertion }],
        },
      };
      assertDocument(document);
    }
    expect(
      new Set(
        EQUATION_SYMBOL_CATEGORIES.find((category) => category.id === "greek")!.symbols.map(
          (symbol) => symbol.group["en-US"],
        ),
      ),
    ).toEqual(new Set(["Lowercase", "Uppercase"]));
    expect(
      new Set(
        EQUATION_SYMBOL_CATEGORIES.find((category) => category.id === "scripts")!.symbols.map(
          (symbol) => symbol.group["en-US"],
        ),
      ),
    ).toEqual(new Set(["Scripts", "Frakturs", "Double-Struck"]));
  });
});
