import { readPictureDataArray } from "./picture-data-array.js";

/** Structured document math belongs to a drawing, independently of cell calculations. */
export type EquationDocument = { kind: "equation-document-v1"; body: EquationSequence };
export type EquationSequence = { id: string; kind: "sequence"; children: EquationNode[] };
export type EquationText = { id: string; kind: "text"; value: string; mode?: "math" | "normal" };
/** Opaque legacy/source math. Never treat it as trusted renderer input or execute its commands. */
export type EquationLatex = { id: string; kind: "latex"; value: string };
export type EquationFractionStyle = "stacked" | "skewed" | "linear" | "no-bar";
export type EquationFraction = {
  id: string;
  kind: "fraction";
  numerator: EquationSequence;
  denominator: EquationSequence;
  style: EquationFractionStyle;
};
export type EquationScript = {
  id: string;
  kind: "script";
  base: EquationSequence;
  subscript?: EquationSequence;
  superscript?: EquationSequence;
  presubscript?: EquationSequence;
  presuperscript?: EquationSequence;
};
export type EquationRadical = {
  id: string;
  kind: "radical";
  radicand: EquationSequence;
  degree?: EquationSequence;
};
export type EquationNaryOperator =
  | "sum"
  | "prod"
  | "coprod"
  | "int"
  | "iint"
  | "iiint"
  | "oint"
  | "oiint"
  | "oiiint"
  | "bigcup"
  | "bigcap"
  | "bigvee"
  | "bigwedge";
export type EquationNary = {
  id: string;
  kind: "nary";
  operator: EquationNaryOperator;
  body: EquationSequence;
  lower?: EquationSequence;
  upper?: EquationSequence;
  limits: "auto" | "under-over" | "side";
};
export type EquationDelimiterName =
  | "none"
  | "paren-open"
  | "paren-close"
  | "bracket-open"
  | "bracket-close"
  | "brace-open"
  | "brace-close"
  | "bar"
  | "double-bar"
  | "angle-open"
  | "angle-close"
  | "floor-open"
  | "floor-close"
  | "ceil-open"
  | "ceil-close";
export type EquationDelimiter = {
  id: string;
  kind: "delimiter";
  left: EquationDelimiterName;
  right: EquationDelimiterName;
  body: EquationSequence;
};
export type EquationFunction = {
  id: string;
  kind: "function";
  name: string;
  body: EquationSequence;
};
export type EquationAccentName =
  | "hat"
  | "acute"
  | "grave"
  | "breve"
  | "check"
  | "bar"
  | "vec"
  | "dot"
  | "ddot"
  | "dddot"
  | "ddddot"
  | "tilde"
  | "overbrace"
  | "underbrace"
  | "overleftarrow"
  | "overrightarrow"
  | "overleftrightarrow"
  | "underleftarrow"
  | "underrightarrow"
  | "underleftrightarrow"
  | "overline"
  | "underline";
export type EquationAccent = {
  id: string;
  kind: "accent";
  name: EquationAccentName;
  body: EquationSequence;
};
export type EquationLimitName = "lim" | "min" | "max" | "log" | "ln";
export type EquationLimit = {
  id: string;
  kind: "limit";
  name: EquationLimitName;
  body: EquationSequence;
  subscript?: EquationSequence;
};
export type EquationAnnotation = {
  id: string;
  kind: "annotation";
  position: "over" | "under";
  base: EquationSequence;
  annotation: EquationSequence;
};
export type EquationBox = { id: string; kind: "box"; body: EquationSequence };
export type EquationMatrixBrackets = "none" | "paren" | "bracket" | "brace" | "bar" | "double-bar";
export type EquationMatrix = {
  id: string;
  kind: "matrix";
  rows: EquationSequence[][];
  brackets: EquationMatrixBrackets;
  alignment: "center" | "left" | "right";
};
export type EquationNode =
  | EquationSequence
  | EquationText
  | EquationLatex
  | EquationFraction
  | EquationScript
  | EquationRadical
  | EquationNary
  | EquationDelimiter
  | EquationFunction
  | EquationAccent
  | EquationLimit
  | EquationAnnotation
  | EquationBox
  | EquationMatrix;

export const EQUATION_DOCUMENT_LIMITS = {
  depth: 32,
  nodes: 4096,
  text: 16384,
  source: 65536,
  id: 128,
  matrixRows: 16,
  matrixColumns: 16,
} as const;

const nodeKeys = {
  sequence: ["id", "kind", "children"],
  text: ["id", "kind", "value", "mode"],
  latex: ["id", "kind", "value"],
  fraction: ["id", "kind", "numerator", "denominator", "style"],
  script: ["id", "kind", "base", "subscript", "superscript", "presubscript", "presuperscript"],
  radical: ["id", "kind", "radicand", "degree"],
  nary: ["id", "kind", "operator", "body", "lower", "upper", "limits"],
  delimiter: ["id", "kind", "left", "right", "body"],
  function: ["id", "kind", "name", "body"],
  accent: ["id", "kind", "name", "body"],
  limit: ["id", "kind", "name", "body", "subscript"],
  annotation: ["id", "kind", "position", "base", "annotation"],
  box: ["id", "kind", "body"],
  matrix: ["id", "kind", "rows", "brackets", "alignment"],
} as const;
const delimiters: Record<EquationDelimiterName, string> = {
  none: ".",
  "paren-open": "(",
  "paren-close": ")",
  "bracket-open": "[",
  "bracket-close": "]",
  "brace-open": "\\{",
  "brace-close": "\\}",
  bar: "|",
  "double-bar": "\\Vert",
  "angle-open": "\\langle",
  "angle-close": "\\rangle",
  "floor-open": "\\lfloor",
  "floor-close": "\\rfloor",
  "ceil-open": "\\lceil",
  "ceil-close": "\\rceil",
};

function dataRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Equation documents require ordinary data records.");
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError("Equation documents require ordinary data records.");
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !keys.includes(key) || !("value" in field) || !field.enumerable)
      throw new TypeError("Equation documents require known enumerable own data fields.");
    if (field.value === undefined)
      throw new TypeError("Equation document fields cannot be undefined.");
    result[key] = field.value as unknown;
  }
  return result;
}
function choice<T extends string>(value: unknown, choices: readonly T[], name: string): T {
  if (typeof value !== "string" || !choices.includes(value as T))
    throw new TypeError(`Invalid equation ${name}.`);
  return value as T;
}

/** Validate descriptors before reads, detach every node, and preserve source and stable IDs exactly. */
export function normalizeEquationDocument(value: unknown): EquationDocument {
  const ids = new Set<string>();
  const seen = new WeakSet<object>();
  let nodes = 0;
  let text = 0;
  function own(source: unknown): void {
    if (!source || typeof source !== "object")
      throw new TypeError("Equation documents require data objects.");
    if (seen.has(source)) throw new TypeError("Cyclic or shared equation document ownership.");
    seen.add(source);
  }
  function array(source: unknown, maximum: number): unknown[] {
    own(source);
    return readPictureDataArray(source as readonly unknown[], "equation document", maximum);
  }
  function sequence(source: unknown, depth: number): EquationSequence {
    const result = node(source, depth);
    if (result.kind !== "sequence") throw new TypeError("Equation slots require sequences.");
    return result;
  }
  function node(source: unknown, depth: number): EquationNode {
    if (depth > EQUATION_DOCUMENT_LIMITS.depth || ++nodes > EQUATION_DOCUMENT_LIMITS.nodes)
      throw new RangeError("Equation document node or depth budget exceeded.");
    own(source);
    const tag = Object.getOwnPropertyDescriptor(source as object, "kind");
    if (
      !tag ||
      !("value" in tag) ||
      typeof tag.value !== "string" ||
      !Object.hasOwn(nodeKeys, tag.value)
    )
      throw new TypeError("Equation nodes require a known own data kind.");
    const kind = tag.value as EquationNode["kind"];
    const record = dataRecord(source, nodeKeys[kind]);
    const id = record.id;
    if (
      typeof id !== "string" ||
      !id.trim() ||
      id.length > EQUATION_DOCUMENT_LIMITS.id ||
      Array.from(id).some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    )
      throw new TypeError("Equation node IDs must be nonempty bounded strings without controls.");
    if (ids.has(id)) throw new TypeError("Equation node IDs must be unique within their document.");
    ids.add(id);
    const slot = (key: string) => sequence(record[key], depth + 1);
    const optional = (key: string) => (Object.hasOwn(record, key) ? slot(key) : undefined);
    switch (kind) {
      case "sequence":
        return {
          id,
          kind,
          children: array(record.children, EQUATION_DOCUMENT_LIMITS.nodes).map((child) =>
            node(child, depth + 1),
          ),
        };
      case "text":
      case "latex": {
        if (typeof record.value !== "string")
          throw new TypeError("Equation text requires a string.");
        text += record.value.length;
        if (text > EQUATION_DOCUMENT_LIMITS.text)
          throw new RangeError("Equation document text budget exceeded.");
        const mode =
          kind === "text" && Object.hasOwn(record, "mode")
            ? choice(record.mode, ["math", "normal"], "text mode")
            : undefined;
        return kind === "latex"
          ? { id, kind, value: record.value }
          : { id, kind, value: record.value, ...(mode ? { mode } : {}) };
      }
      case "fraction":
        return {
          id,
          kind,
          numerator: slot("numerator"),
          denominator: slot("denominator"),
          style: choice(record.style, ["stacked", "skewed", "linear", "no-bar"], "fraction style"),
        };
      case "script": {
        const base = slot("base"),
          subscript = optional("subscript"),
          superscript = optional("superscript"),
          presubscript = optional("presubscript"),
          presuperscript = optional("presuperscript");
        if (!subscript && !superscript && !presubscript && !presuperscript)
          throw new TypeError("Equation scripts require a subscript or superscript.");
        return {
          id,
          kind,
          base,
          ...(subscript ? { subscript } : {}),
          ...(superscript ? { superscript } : {}),
          ...(presubscript ? { presubscript } : {}),
          ...(presuperscript ? { presuperscript } : {}),
        };
      }
      case "radical": {
        const radicand = slot("radicand"),
          degree = optional("degree");
        return { id, kind, radicand, ...(degree ? { degree } : {}) };
      }
      case "nary": {
        const operator = choice(
          record.operator,
          [
            "sum",
            "prod",
            "coprod",
            "int",
            "iint",
            "iiint",
            "oint",
            "oiint",
            "oiiint",
            "bigcup",
            "bigcap",
            "bigvee",
            "bigwedge",
          ],
          "large operator",
        );
        const body = slot("body"),
          lower = optional("lower"),
          upper = optional("upper");
        return {
          id,
          kind,
          operator,
          body,
          ...(lower ? { lower } : {}),
          ...(upper ? { upper } : {}),
          limits: choice(record.limits, ["auto", "under-over", "side"], "operator limits"),
        };
      }
      case "delimiter":
        return {
          id,
          kind,
          left: choice(
            record.left,
            Object.keys(delimiters) as EquationDelimiterName[],
            "left delimiter",
          ),
          right: choice(
            record.right,
            Object.keys(delimiters) as EquationDelimiterName[],
            "right delimiter",
          ),
          body: slot("body"),
        };
      case "function": {
        if (typeof record.name !== "string" || !/^[A-Za-z][A-Za-z0-9]{0,31}$/.test(record.name))
          throw new TypeError("Equation functions require a bounded safe identifier.");
        return { id, kind, name: record.name, body: slot("body") };
      }
      case "accent":
        return {
          id,
          kind,
          name: choice(
            record.name,
            [
              "hat",
              "acute",
              "grave",
              "breve",
              "check",
              "bar",
              "vec",
              "dot",
              "ddot",
              "dddot",
              "ddddot",
              "tilde",
              "overbrace",
              "underbrace",
              "overleftarrow",
              "overrightarrow",
              "overleftrightarrow",
              "underleftarrow",
              "underrightarrow",
              "underleftrightarrow",
              "overline",
              "underline",
            ],
            "accent",
          ),
          body: slot("body"),
        };
      case "limit": {
        const name = choice(record.name, ["lim", "min", "max", "log", "ln"], "limit name"),
          body = slot("body"),
          subscript = optional("subscript");
        return { id, kind, name, body, ...(subscript ? { subscript } : {}) };
      }
      case "annotation":
        return {
          id,
          kind,
          position: choice(record.position, ["over", "under"], "annotation position"),
          base: slot("base"),
          annotation: slot("annotation"),
        };
      case "box":
        return { id, kind, body: slot("body") };
      case "matrix": {
        const rows = array(record.rows, EQUATION_DOCUMENT_LIMITS.matrixRows).map((row) =>
          array(row, EQUATION_DOCUMENT_LIMITS.matrixColumns).map((cell) =>
            sequence(cell, depth + 1),
          ),
        );
        if (!rows.length || !rows[0]!.length || rows.some((row) => row.length !== rows[0]!.length))
          throw new TypeError("Equation matrices must be nonempty and rectangular.");
        return {
          id,
          kind,
          rows,
          brackets: choice(
            record.brackets,
            ["none", "paren", "bracket", "brace", "bar", "double-bar"],
            "matrix brackets",
          ),
          alignment: choice(record.alignment, ["center", "left", "right"], "matrix alignment"),
        };
      }
    }
  }
  own(value);
  const record = dataRecord(value, ["kind", "body"]);
  if (record.kind !== "equation-document-v1")
    throw new TypeError("Unsupported equation document kind.");
  const result: EquationDocument = { kind: "equation-document-v1", body: sequence(record.body, 1) };
  renderDocument(result);
  return result;
}

export function cloneEquationDocument(value: EquationDocument): EquationDocument {
  return normalizeEquationDocument(value);
}

function renderDocument(textDocument: EquationDocument): string {
  const parts: string[] = [];
  let length = 0;
  function append(value: string): void {
    length += value.length;
    if (length > EQUATION_DOCUMENT_LIMITS.source)
      throw new RangeError("Equation document source budget exceeded.");
    parts.push(value);
  }
  function literal(value: string, normal: boolean): void {
    if (normal) append("\\text{");
    for (const character of value) {
      if (character === "\\") append(normal ? "\\textbackslash{}" : "\\backslash{}");
      else if ("{}$#&%_".includes(character)) append(`\\${character}`);
      else if (character === "^")
        append(normal ? "\\textasciicircum{}" : "\\text{\\textasciicircum}");
      else if (character === "~")
        append(normal ? "\\textasciitilde{}" : "\\text{\\textasciitilde}");
      else if (/\s/.test(character)) append(normal ? " " : "\\ ");
      else append(character);
    }
    if (normal) append("}");
  }
  function group(value: EquationSequence): void {
    append("{");
    render(value);
    append("}");
  }
  function render(value: EquationNode): void {
    switch (value.kind) {
      case "sequence":
        for (const child of value.children) render(child);
        break;
      case "text":
        literal(value.value, value.mode === "normal");
        break;
      case "latex":
        append(value.value);
        break;
      case "fraction":
        if (value.style === "stacked" || value.style === "no-bar") {
          append(value.style === "stacked" ? "\\frac" : "\\genfrac{}{}{0pt}{}");
          group(value.numerator);
          group(value.denominator);
        } else if (value.style === "skewed") {
          append("{}^");
          group(value.numerator);
          append("\\! / \\!{}_");
          group(value.denominator);
        } else {
          group(value.numerator);
          append("/");
          group(value.denominator);
        }
        break;
      case "script":
        if (value.presubscript || value.presuperscript) {
          append("{}");
          if (value.presubscript) {
            append("_");
            group(value.presubscript);
          }
          if (value.presuperscript) {
            append("^");
            group(value.presuperscript);
          }
        }
        group(value.base);
        if (value.subscript) {
          append("_");
          group(value.subscript);
        }
        if (value.superscript) {
          append("^");
          group(value.superscript);
        }
        break;
      case "radical":
        append("\\sqrt");
        if (value.degree) {
          append("[");
          group(value.degree);
          append("]");
        }
        group(value.radicand);
        break;
      case "nary":
        append(
          `\\${value.operator}${value.limits === "under-over" ? "\\limits" : value.limits === "side" ? "\\nolimits" : ""}`,
        );
        if (value.lower) {
          append("_");
          group(value.lower);
        }
        if (value.upper) {
          append("^");
          group(value.upper);
        }
        group(value.body);
        break;
      case "delimiter":
        append(`\\left${delimiters[value.left]} `);
        render(value.body);
        append(`\\right${delimiters[value.right]} `);
        break;
      case "function":
        append(`\\operatorname{${value.name}}`);
        group(value.body);
        break;
      case "accent":
        append(`\\${value.name}`);
        group(value.body);
        break;
      case "box":
        append("\\boxed");
        group(value.body);
        break;
      case "limit":
        append(`\\${value.name}`);
        if (value.subscript) {
          append("_");
          group(value.subscript);
        }
        group(value.body);
        break;
      case "annotation":
        append(value.position === "over" ? "\\overset" : "\\underset");
        group(value.annotation);
        group(value.base);
        break;
      case "matrix": {
        const pair: [string, string] | undefined =
          value.brackets === "none"
            ? undefined
            : value.brackets === "paren"
              ? ["(", ")"]
              : value.brackets === "bracket"
                ? ["[", "]"]
                : value.brackets === "brace"
                  ? ["\\{", "\\}"]
                  : value.brackets === "bar"
                    ? ["|", "|"]
                    : ["\\Vert", "\\Vert"];
        if (pair) append(`\\left${pair[0]} `);
        const alignment =
          value.alignment === "left" ? "l" : value.alignment === "right" ? "r" : "c";
        append(`\\begin{array}{${alignment.repeat(value.rows[0]!.length)}}`);
        value.rows.forEach((row, rowIndex) => {
          if (rowIndex) append("\\\\");
          row.forEach((cell, cellIndex) => {
            if (cellIndex) append("&");
            render(cell);
          });
        });
        append("\\end{array}");
        if (pair) append(`\\right${pair[1]} `);
        break;
      }
    }
  }
  render(textDocument.body);
  return parts.join("");
}

/** Canonical bounded LaTeX mirror. Opaque latex nodes preserve their exact, untrusted source. */
export function serializeEquationDocument(value: EquationDocument): string {
  return renderDocument(normalizeEquationDocument(value));
}

/** Visit in document order. Callbacks receive original node references after strict validation. */
export function walkEquationDocument(
  textDocument: EquationDocument,
  visit: (node: EquationNode, parent: EquationNode | null) => void,
): void {
  normalizeEquationDocument(textDocument);
  function walk(node: EquationNode, parent: EquationNode | null): void {
    visit(node, parent);
    const child = (value: EquationNode | undefined) => {
      if (value) walk(value, node);
    };
    switch (node.kind) {
      case "sequence":
        for (const value of node.children) child(value);
        break;
      case "fraction":
        child(node.numerator);
        child(node.denominator);
        break;
      case "script":
        child(node.presubscript);
        child(node.presuperscript);
        child(node.base);
        child(node.subscript);
        child(node.superscript);
        break;
      case "radical":
        child(node.degree);
        child(node.radicand);
        break;
      case "nary":
        child(node.lower);
        child(node.upper);
        child(node.body);
        break;
      case "delimiter":
      case "function":
      case "accent":
      case "box":
        child(node.body);
        break;
      case "limit":
        child(node.subscript);
        child(node.body);
        break;
      case "annotation":
        child(node.base);
        child(node.annotation);
        break;
      case "matrix":
        for (const row of node.rows) for (const value of row) child(value);
        break;
      case "text":
      case "latex":
        break;
    }
  }
  walk(textDocument.body, null);
}

export function findEquationNode(
  textDocument: EquationDocument,
  id: string,
): EquationNode | undefined {
  let result: EquationNode | undefined;
  walkEquationDocument(textDocument, (node) => {
    if (node.id === id) result = node;
  });
  return result;
}
