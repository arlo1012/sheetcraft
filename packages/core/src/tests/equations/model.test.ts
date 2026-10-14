import { describe, expect, test } from "vitest";
import {
  cloneEquationDocument,
  EQUATION_DOCUMENT_LIMITS,
  findEquationNode,
  normalizeEquationDocument,
  serializeEquationDocument,
  walkEquationDocument,
  type EquationDocument,
  type EquationNode,
} from "../../equation-document.js";
import { normalizeSheetDrawing } from "../../sheet-drawings.js";
import { equationDocument, equationDrawing, equationFactory } from "./fixtures.js";

function document(node: EquationNode): EquationDocument {
  return { kind: "equation-document-v1", body: { id: "root", kind: "sequence", children: [node] } };
}

describe("bounded semantic equation documents", () => {
  test("nested WPS-like fraction/root/matrix source roundtrips with detached stable IDs", () => {
    const input = equationDocument(),
      clone = cloneEquationDocument(input);
    expect(clone).toEqual(input);
    expect(clone).not.toBe(input);
    expect(clone.body).not.toBe(input.body);
    expect(clone.body.children).not.toBe(input.body.children);
    expect(serializeEquationDocument(input)).toBe(
      "\\frac{\\sqrt{x}y\\left( \\begin{array}{cc}12&3\\\\4&5\\end{array}\\right) }{c}",
    );
    const visited: EquationNode[] = [];
    walkEquationDocument(input, (node, parent) => {
      visited.push(node);
      if (node !== input.body) expect(parent).not.toBeNull();
    });
    expect(new Set(visited.map((node) => node.id)).size).toBe(visited.length);
    for (const node of visited) expect(findEquationNode(input, node.id)).toBe(node);
    expect(findEquationNode(input, "missing")).toBeUndefined();
    const drawing = equationDrawing(input),
      normalized = normalizeSheetDrawing(drawing);
    expect(normalized).toEqual(drawing);
    expect(normalized.kind === "equation" && normalized.equationDocument).not.toBe(input);
  });

  test("all semantic structures generate bounded canonical source without calculation evaluation", () => {
    const { id, sequence, text } = equationFactory();
    const structures: EquationNode[] = [
      ...(["stacked", "skewed", "linear", "no-bar"] as const).map((style): EquationNode => ({
        id: id(),
        kind: "fraction",
        numerator: sequence(text("a")),
        denominator: sequence(text("b")),
        style,
      })),
      {
        id: id(),
        kind: "script",
        base: sequence(text("x")),
        subscript: sequence(text("i")),
        superscript: sequence(text("2")),
      },
      { id: id(), kind: "radical", degree: sequence(text("3")), radicand: sequence(text("x")) },
      {
        id: id(),
        kind: "nary",
        operator: "sum",
        lower: sequence(text("i=1")),
        upper: sequence(text("n")),
        body: sequence(text("x")),
        limits: "under-over",
      },
      { id: id(), kind: "delimiter", left: "brace-open", right: "none", body: sequence(text("x")) },
      { id: id(), kind: "function", name: "sin", body: sequence(text("x")) },
      { id: id(), kind: "accent", name: "vec", body: sequence(text("x")) },
      {
        id: id(),
        kind: "limit",
        name: "lim",
        subscript: sequence(text("x→0")),
        body: sequence(text("x")),
      },
      {
        id: id(),
        kind: "annotation",
        position: "over",
        base: sequence(text("=")),
        annotation: sequence(text("a")),
      },
      {
        id: id(),
        kind: "matrix",
        rows: [[sequence(text("1")), sequence()]],
        brackets: "double-bar",
        alignment: "right",
      },
    ];
    const source = serializeEquationDocument({
      kind: "equation-document-v1",
      body: sequence(...structures),
    });
    for (const fragment of [
      "\\frac{a}{b}",
      "{a}/{b}",
      "\\genfrac{}{}{0pt}{}{a}{b}",
      "{x}_{i}^{2}",
      "\\sqrt[{3}]{x}",
      "\\sum\\limits_{i=1}^{n}{x}",
      "\\operatorname{sin}{x}",
      "\\vec{x}",
      "\\lim_{x→0}{x}",
      "\\overset{a}{=}",
      "\\begin{array}{rr}1&\\end{array}",
    ])
      expect(source).toContain(fragment);
  });

  test("literal text cannot inject source commands and opaque LaTeX preserves exact source", () => {
    const value = "\\frac{x}{y}_^~%&#$";
    const math = serializeEquationDocument(document({ id: "literal", kind: "text", value }));
    expect(math).toBe(
      "\\backslash{}frac\\{x\\}\\{y\\}\\_\\text{\\textasciicircum}\\text{\\textasciitilde}\\%\\&\\#\\$",
    );
    const normal = serializeEquationDocument(
      document({ id: "literal", kind: "text", value, mode: "normal" }),
    );
    expect(normal).toContain("\\text{\\textbackslash{}frac\\{x\\}");
    const opaque = "  \\href{https://invalid.test}{x}\n\\unknown{y}  ";
    expect(
      serializeEquationDocument(document({ id: "source", kind: "latex", value: opaque })),
    ).toBe(opaque);
  });

  test("prescripts are real editable slots, detached and walked before the base", () => {
    const { id, sequence, text } = equationFactory();
    const node: EquationNode = {
      id: id(),
      kind: "script",
      base: sequence(text("X")),
      presubscript: sequence(text("a")),
      presuperscript: sequence(text("b")),
      subscript: sequence(text("i")),
      superscript: sequence(text("j")),
    };
    const input = document(node);
    expect(serializeEquationDocument(input)).toBe("{}_{a}^{b}{X}_{i}^{j}");
    const clone = cloneEquationDocument(input);
    expect(clone).toEqual(input);
    expect(clone.body.children[0]).not.toBe(node);
    const leaves: string[] = [];
    walkEquationDocument(input, (child) => {
      if (child.kind === "text") leaves.push(child.value);
    });
    expect(leaves).toEqual(["a", "b", "X", "i", "j"]);
    expect(findEquationNode(input, node.presubscript!.id)).toBe(node.presubscript);
    for (const [slot, expected] of [
      ["presubscript", "{}_{a}{X}"],
      ["presuperscript", "{}^{a}{X}"],
    ] as const) {
      const onlyPre = document({
        id: id(),
        kind: "script",
        base: sequence(text("X")),
        [slot]: sequence(text("a")),
      });
      expect(serializeEquationDocument(onlyPre)).toBe(expected);
      expect(normalizeEquationDocument(onlyPre)).toEqual(onlyPre);
    }
  });

  test("expanded operators, accents and boxes preserve semantic structure and exact mirrors", () => {
    const { id, sequence, text } = equationFactory();
    for (const operator of ["oiint", "oiiint", "bigvee", "bigwedge"] as const) {
      const input = document({
        id: id(),
        kind: "nary",
        operator,
        lower: sequence(text("i")),
        upper: sequence(text("n")),
        body: sequence(text("x")),
        limits: "side",
      });
      expect(serializeEquationDocument(input)).toBe(`\\${operator}\\nolimits_{i}^{n}{x}`);
      expect(cloneEquationDocument(input)).toEqual(input);
    }
    for (const name of [
      "acute",
      "grave",
      "breve",
      "check",
      "dddot",
      "ddddot",
      "overleftarrow",
      "overrightarrow",
      "overleftrightarrow",
      "underleftarrow",
      "underrightarrow",
      "underleftrightarrow",
      "overline",
      "underline",
    ] as const) {
      const input = document({ id: id(), kind: "accent", name, body: sequence(text("x")) });
      expect(serializeEquationDocument(input)).toBe(`\\${name}{x}`);
      expect(cloneEquationDocument(input)).toEqual(input);
    }
    const box: EquationNode = { id: id(), kind: "box", body: sequence(text("x+y")) };
    const input = document(box),
      clone = cloneEquationDocument(input);
    expect(serializeEquationDocument(input)).toBe("\\boxed{x+y}");
    expect(clone).toEqual(input);
    expect(clone.body.children[0]).not.toBe(box);
    expect(findEquationNode(input, box.body.id)).toBe(box.body);
  });

  test("new prescript and box slots enforce descriptor, sequence and ownership contracts", () => {
    const { id, sequence, text } = equationFactory();
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("read");
      },
    };
    const box = { id: id(), kind: "box", body: sequence(text("x")) };
    const script = { id: id(), kind: "script", base: sequence(text("X")) };
    for (const node of [
      { ...box, body: undefined },
      { ...box, body: text("x") },
      { ...box, extra: true },
      Object.defineProperty({ ...box }, "body", getter),
      { ...script, presubscript: undefined },
      { ...script, presuperscript: text("x") },
      { ...script, presubscript: script.base },
      Object.defineProperty({ ...script }, "presuperscript", getter),
    ])
      expect(() => normalizeEquationDocument(document(node as EquationNode))).toThrow();
    expect(reads).toBe(0);
  });

  test("radical degree slots group literal closing brackets within the optional argument", () => {
    const { id, sequence, text } = equationFactory();
    expect(
      serializeEquationDocument(
        document({
          id: id(),
          kind: "radical",
          degree: sequence(text("]x")),
          radicand: sequence(text("y")),
        }),
      ),
    ).toBe("\\sqrt[{]x}]{y}");
  });

  test("known descriptor-only records reject malicious fields without executing getters", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("read");
      },
    };
    const leaf = { id: "leaf", kind: "text", value: "x" };
    const inherited = Object.assign(Object.create({ mode: "normal" }), leaf);
    for (const node of [
      { ...leaf, unknown: 1 },
      { ...leaf, value: undefined },
      { ...leaf, mode: undefined },
      Object.defineProperty({ ...leaf }, "value", getter),
      Object.defineProperty({ ...leaf }, "kind", getter),
      inherited,
      Object.defineProperty({ ...leaf }, "value", { value: "x", enumerable: false }),
      { ...leaf, [Symbol("payload")]: true },
      {
        id: "function",
        kind: "function",
        name: "x}\\href",
        body: { id: "slot", kind: "sequence", children: [] },
      },
      { id: "script", kind: "script", base: { id: "slot", kind: "sequence", children: [] } },
    ])
      expect(() => normalizeEquationDocument(document(node as EquationNode))).toThrow();
    const malformedDocument = Object.defineProperty(
      { kind: "equation-document-v1" },
      "body",
      getter,
    );
    expect(() => normalizeEquationDocument(malformedDocument)).toThrow();
    const children = [leaf];
    Object.defineProperty(children, "0", getter);
    expect(() =>
      normalizeEquationDocument({
        kind: "equation-document-v1",
        body: { id: "root", kind: "sequence", children },
      }),
    ).toThrow();
    expect(reads).toBe(0);
  });

  test("ownership is acyclic, IDs are unique and arrays are ordinary dense data", () => {
    const leaf: EquationNode = { id: "leaf", kind: "text", value: "x" };
    const base: EquationDocument = document(leaf);
    for (const children of [
      [leaf, leaf],
      [{ ...leaf }, { ...leaf }],
      Array(1),
      Object.assign([leaf], { extra: 1 }),
    ])
      expect(() =>
        normalizeEquationDocument({ ...base, body: { ...base.body, children } }),
      ).toThrow();
    base.body.children = [base.body];
    expect(() => normalizeEquationDocument(base)).toThrow(/Cyclic/);
    for (const id of ["", " ", "x".repeat(129), "x\u0000y"])
      expect(() => normalizeEquationDocument(document({ ...leaf, id }))).toThrow();
  });

  test("node, depth, total text, output source and rectangular matrix budgets are enforced", () => {
    const makeNodes = (count: number): EquationDocument => ({
      kind: "equation-document-v1",
      body: {
        id: "root",
        kind: "sequence",
        children: Array.from({ length: count }, (_, index) => ({
          id: `leaf-${index}`,
          kind: "text",
          value: "",
        })),
      },
    });
    expect(
      normalizeEquationDocument(makeNodes(EQUATION_DOCUMENT_LIMITS.nodes - 1)).body.children,
    ).toHaveLength(4095);
    expect(() => normalizeEquationDocument(makeNodes(EQUATION_DOCUMENT_LIMITS.nodes))).toThrow(
      /budget/,
    );
    function deep(count: number): EquationDocument {
      let node: EquationNode = { id: "leaf", kind: "text", value: "x" };
      for (let index = 1; index < count; index++)
        node = { id: `s-${index}`, kind: "sequence", children: [node] };
      return { kind: "equation-document-v1", body: node as EquationDocument["body"] };
    }
    expect(normalizeEquationDocument(deep(32))).toEqual(deep(32));
    expect(() => normalizeEquationDocument(deep(33))).toThrow(/budget/);
    expect(
      serializeEquationDocument(
        document({ id: "source", kind: "latex", value: "x".repeat(16384) }),
      ),
    ).toHaveLength(16384);
    expect(() =>
      normalizeEquationDocument(
        document({ id: "source", kind: "latex", value: "x".repeat(16385) }),
      ),
    ).toThrow(/text budget/);
    const tooMuchText = makeNodes(2);
    for (const node of tooMuchText.body.children)
      if (node.kind === "text") node.value = "x".repeat(8193);
    expect(() => normalizeEquationDocument(tooMuchText)).toThrow(/text budget/);
    expect(() =>
      normalizeEquationDocument(document({ id: "source", kind: "text", value: "^".repeat(4000) })),
    ).toThrow(/source budget/);
    for (const rows of [
      [],
      [[]],
      [[{ id: "a", kind: "sequence", children: [] }], []],
      Array.from({ length: 17 }, (_, index) => [
        { id: `cell-${index}`, kind: "sequence", children: [] },
      ]),
    ])
      expect(() =>
        normalizeEquationDocument(
          document({
            id: "matrix",
            kind: "matrix",
            rows,
            brackets: "none",
            alignment: "center",
          } as EquationNode),
        ),
      ).toThrow();
  });

  test("document ownership is equation-only with an exact generated mirror and strict placement data", () => {
    const drawing = equationDrawing();
    let reads = 0;
    for (const candidate of [
      { ...drawing, kind: "shape" },
      { ...drawing, text: "stale" },
      { ...drawing, equationDocument: undefined },
      { ...drawing, extra: 1 },
      { ...drawing, anchor: { ...drawing.anchor, extra: 1 } },
      Object.defineProperty({ ...drawing }, "text", {
        get() {
          reads++;
          return drawing.text;
        },
      }),
      {
        ...drawing,
        anchor: Object.defineProperty({ column: 2 }, "row", {
          get() {
            reads++;
            return 3;
          },
        }),
      },
      Object.defineProperty({ ...drawing }, "equationDocument", {
        get() {
          reads++;
          return drawing.equationDocument;
        },
      }),
    ])
      expect(() => normalizeSheetDrawing(candidate as typeof drawing)).toThrow();
    expect(reads).toBe(0);
  });

  test("accepted non-enumerable equation anchor coordinates survive detached normalization", () => {
    const drawing = equationDrawing();
    for (const key of ["row", "column"] as const) {
      const anchor = { ...drawing.anchor };
      Object.defineProperty(anchor, key, { value: anchor[key], enumerable: false });
      const normalized = normalizeSheetDrawing({ ...drawing, anchor });
      expect(normalized).toEqual(drawing);
      expect(normalizeSheetDrawing(normalized)).toEqual(drawing);
    }
  });
});
