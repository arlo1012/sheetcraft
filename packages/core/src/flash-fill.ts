/**
 * A deliberately small, deterministic Flash Fill inference language.  It is
 * designed for examples typed beside tabular text, not for formula inference
 * or for guessing arbitrary natural-language transformations.
 */

export type FlashFillExample = Readonly<{
  inputs: readonly string[];
  output: string;
}>;

export type FlashFillErrorReason = "noPattern" | "ambiguous" | "tooComplex";

export class FlashFillPatternError extends Error {
  constructor(
    readonly reason: FlashFillErrorReason,
    message: string,
  ) {
    super(message);
    this.name = "FlashFillPatternError";
  }
}

type Atom =
  | { kind: "whole"; source: number }
  | { kind: "trim"; source: number }
  | { kind: "case"; source: number; mode: "upper" | "lower" | "title" }
  | { kind: "token"; source: number; separator: string; index: number }
  | { kind: "digits"; source: number; index: number }
  | { kind: "camel"; source: number; index: number }
  | { kind: "slice"; source: number; side: "start" | "end"; length: number };

type Expression = Readonly<{
  atoms: readonly Atom[];
  /** There is one literal before every atom, followed by one trailing literal. */
  literals: readonly string[];
}>;

const MAX_INPUTS = 8;
const MAX_CELL_LENGTH = 256;
const MAX_ATOMS_PER_SOURCE = 32;
const MAX_EXPRESSION_CANDIDATES = 10_000;
const MAX_ATOMS_PER_EXPRESSION = 4;
const separatorPattern = /[\s\-_/.,，、\\|@]+/gu;
const digitPattern = /\d+/gu;
const camelPattern = /[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+/g;

const unique = <Value>(values: readonly Value[]) => [...new Set(values)];

function titleCase(value: string): string {
  return value.replace(/\p{L}[\p{L}\p{M}]*/gu, (word) =>
    word.length === 0 ? word : word[0]!.toLocaleUpperCase() + word.slice(1).toLocaleLowerCase(),
  );
}

function evaluateAtom(atom: Atom, inputs: readonly string[]): string {
  const source = inputs[atom.source] ?? "";
  switch (atom.kind) {
    case "whole":
      return source;
    case "trim":
      return source.trim();
    case "case":
      return atom.mode === "upper"
        ? source.toLocaleUpperCase()
        : atom.mode === "lower"
          ? source.toLocaleLowerCase()
          : titleCase(source);
    case "token":
      return source.includes(atom.separator)
        ? (source.split(atom.separator)[atom.index] ?? "")
        : "";
    case "digits":
      return [...source.matchAll(digitPattern)][atom.index]?.[0] ?? "";
    case "camel":
      return source.match(camelPattern)?.[atom.index] ?? "";
    case "slice": {
      const characters = Array.from(source);
      return atom.side === "start"
        ? characters.slice(0, atom.length).join("")
        : characters.slice(-atom.length).join("");
    }
  }
}

function atomKey(atom: Atom): string {
  switch (atom.kind) {
    case "whole":
    case "trim":
      return `${atom.kind}:${atom.source}`;
    case "case":
      return `${atom.kind}:${atom.source}:${atom.mode}`;
    case "token":
      return `${atom.kind}:${atom.source}:${atom.separator}:${atom.index}`;
    case "digits":
    case "camel":
      return `${atom.kind}:${atom.source}:${atom.index}`;
    case "slice":
      return `${atom.kind}:${atom.source}:${atom.side}:${atom.length}`;
  }
}

function atomCost(atom: Atom): number {
  switch (atom.kind) {
    case "whole":
      return 1;
    case "trim":
      return 2;
    case "case":
      return 3;
    case "token":
    case "digits":
      return 4;
    case "camel":
      return 5;
    case "slice":
      return 6;
  }
}

function makeAtoms(inputs: readonly string[]): Atom[] {
  const atoms: Atom[] = [];
  for (let source = 0; source < inputs.length; source += 1) {
    const value = inputs[source]!;
    const sourceAtoms: Atom[] = [
      { kind: "whole", source },
      { kind: "trim", source },
    ];
    sourceAtoms.push(
      { kind: "case", source, mode: "upper" },
      { kind: "case", source, mode: "lower" },
      { kind: "case", source, mode: "title" },
    );
    for (const separator of unique(value.match(separatorPattern) ?? [])) {
      const tokens = value.split(separator);
      for (let index = 0; index < tokens.length; index += 1)
        if (tokens[index]) sourceAtoms.push({ kind: "token", source, separator, index });
    }
    const digits = [...value.matchAll(digitPattern)];
    for (let index = 0; index < digits.length; index += 1)
      sourceAtoms.push({ kind: "digits", source, index });
    const camel = value.match(camelPattern) ?? [];
    for (let index = 0; index < camel.length; index += 1)
      sourceAtoms.push({ kind: "camel", source, index });
    // Fixed slices are useful for stable codes, but limiting them keeps this a
    // bounded pattern language instead of arbitrary substring guessing.
    for (let length = 1; length <= Math.min(8, Array.from(value).length); length += 1) {
      sourceAtoms.push({ kind: "slice", source, side: "start", length });
      sourceAtoms.push({ kind: "slice", source, side: "end", length });
    }
    const sourceSeen = new Set<string>();
    for (const atom of sourceAtoms) {
      const key = atomKey(atom);
      if (sourceSeen.has(key)) continue;
      sourceSeen.add(key);
      if (sourceSeen.size <= MAX_ATOMS_PER_SOURCE) atoms.push(atom);
    }
  }
  return atoms;
}

function expressionValue(expression: Expression, inputs: readonly string[]): string {
  let value = expression.literals[0] ?? "";
  for (let index = 0; index < expression.atoms.length; index += 1)
    value +=
      evaluateAtom(expression.atoms[index]!, inputs) + (expression.literals[index + 1] ?? "");
  return value;
}

function expressionKey(expression: Expression): string {
  return JSON.stringify([expression.atoms.map(atomKey), expression.literals]);
}

function expressionCost(expression: Expression): number {
  return (
    expression.atoms.reduce((total, atom) => total + atomCost(atom), 0) +
    expression.literals.reduce((total, literal) => total + (literal ? 2 + literal.length : 0), 0)
  );
}

function validateInput(
  examples: readonly FlashFillExample[],
  targets: readonly (readonly string[])[],
): number {
  if (examples.length === 0)
    throw new FlashFillPatternError("noPattern", "Provide an example first.");
  const width = examples[0]!.inputs.length;
  if (width === 0) throw new FlashFillPatternError("noPattern", "No source values are available.");
  if (width > MAX_INPUTS) throw new FlashFillPatternError("tooComplex", "Too many source columns.");
  const values = [
    ...examples.flatMap((example) => [...example.inputs, example.output]),
    ...targets.flat(),
  ];
  if (
    examples.some((example) => example.inputs.length !== width) ||
    targets.some((row) => row.length !== width)
  )
    throw new FlashFillPatternError("noPattern", "Examples must use the same source columns.");
  if (
    values.some((value) => typeof value !== "string" || Array.from(value).length > MAX_CELL_LENGTH)
  )
    throw new FlashFillPatternError("tooComplex", "Cell text is too long for Flash Fill.");
  return width;
}

/**
 * Infers a text-only transformation from adjacent-row examples.  Ambiguous
 * equally simple transformations deliberately fail instead of silently writing
 * potentially wrong data.
 */
export function inferFlashFill(
  examples: readonly FlashFillExample[],
  targets: readonly (readonly string[])[],
): string[] {
  validateInput(examples, targets);
  const first = examples[0]!;
  // A direct adjacent column is both common and unambiguous enough to avoid
  // spending the bounded search budget on repeated short values such as "1".
  const direct = makeAtoms(first.inputs)
    .filter((atom): atom is Extract<Atom, { kind: "whole" }> => atom.kind === "whole")
    .filter((atom) =>
      examples.every((example) => evaluateAtom(atom, example.inputs) === example.output),
    );
  if (direct.length > 0) {
    const directPredictions = direct.map((atom) => {
      const values = targets.map((target) => evaluateAtom(atom, target));
      if (values.some((value) => value === ""))
        throw new FlashFillPatternError(
          "noPattern",
          "A source value is missing in the fill range.",
        );
      return values;
    });
    const distinct = unique(directPredictions.map((prediction) => JSON.stringify(prediction)));
    if (distinct.length !== 1)
      throw new FlashFillPatternError(
        "ambiguous",
        "More than one source column matches the examples.",
      );
    return directPredictions[0] ?? [];
  }
  const atoms = makeAtoms(first.inputs).filter((atom) => evaluateAtom(atom, first.inputs) !== "");
  if (atoms.length === 0)
    throw new FlashFillPatternError("noPattern", "No text pattern was found.");

  const candidates: Expression[] = [];
  const seen = new Set<string>();
  const add = (atomsInExpression: Atom[], literals: string[]) => {
    if (candidates.length >= MAX_EXPRESSION_CANDIDATES)
      throw new FlashFillPatternError(
        "tooComplex",
        "The pattern has too many possible interpretations.",
      );
    const expression: Expression = { atoms: atomsInExpression, literals };
    const key = expressionKey(expression);
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(expression);
  };
  const output = first.output;
  const visit = (offset: number, atomsInExpression: Atom[], literals: string[]) => {
    if (atomsInExpression.length > 0) add(atomsInExpression, [...literals, output.slice(offset)]);
    if (atomsInExpression.length === MAX_ATOMS_PER_EXPRESSION) return;
    for (const atom of atoms) {
      const value = evaluateAtom(atom, first.inputs);
      let occurrence = output.indexOf(value, offset);
      while (occurrence >= 0) {
        visit(
          occurrence + value.length,
          [...atomsInExpression, atom],
          [...literals, output.slice(offset, occurrence)],
        );
        occurrence = output.indexOf(value, occurrence + 1);
      }
    }
  };
  visit(0, [], []);

  const valid = candidates.filter((candidate) => {
    if (examples.length === 1 && candidate.atoms.some((atom) => atom.kind === "slice"))
      return false;
    return examples.every(
      (example) => expressionValue(candidate, example.inputs) === example.output,
    );
  });
  if (valid.length === 0)
    throw new FlashFillPatternError("noPattern", "No consistent text pattern was found.");
  const bestCost = Math.min(...valid.map(expressionCost));
  const best = valid.filter((candidate) => expressionCost(candidate) === bestCost);
  if (
    best.some((candidate) =>
      targets.some((target) => candidate.atoms.some((atom) => evaluateAtom(atom, target) === "")),
    )
  )
    throw new FlashFillPatternError("noPattern", "A source value is missing in the fill range.");
  const predictions = unique(
    best.map((candidate) =>
      JSON.stringify(targets.map((target) => expressionValue(candidate, target))),
    ),
  );
  if (predictions.length !== 1)
    throw new FlashFillPatternError(
      "ambiguous",
      "More than one equally simple pattern matches the examples.",
    );
  return best[0] ? targets.map((target) => expressionValue(best[0]!, target)) : [];
}
