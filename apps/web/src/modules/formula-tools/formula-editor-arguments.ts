export type FormulaEditorArgument = Readonly<{
  start: number;
  end: number;
  value: string;
}>;

export type FormulaEditorRootCall = Readonly<{
  name: string;
  open: number;
  close: number;
  arguments: readonly FormulaEditorArgument[];
}>;

/**
 * Finds a complete top-level function call. It intentionally rejects formulas
 * with a trailing expression so argument fields never rewrite part of a more
 * complex formula.
 */
export function getFormulaEditorRootCall(value: string): FormulaEditorRootCall | null {
  const equals = value.search(/\S/);
  if (equals < 0 || value[equals] !== "=") return null;
  let index = skipWhitespace(value, equals + 1);
  const nameStart = index;
  if (!/[A-Za-z_]/.test(value[index] ?? "")) return null;
  index += 1;
  while (/[A-Za-z0-9_]/.test(value[index] ?? "")) index += 1;
  const name = value.slice(nameStart, index).toUpperCase();
  index = skipWhitespace(value, index);
  if (value[index] !== "(") return null;
  const open = index;
  const segments: Array<{ start: number; end: number }> = [];
  let segmentStart = open + 1;
  let parentheses = 1;
  let braces = 0;
  let quote: '"' | "'" | null = null;

  for (index = open + 1; index < value.length; index += 1) {
    const character = value[index] ?? "";
    if (quote) {
      if (character === quote && value[index + 1] === quote) {
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "{") {
      braces += 1;
      continue;
    }
    if (character === "}") {
      braces -= 1;
      if (braces < 0) return null;
      continue;
    }
    if (character === "(") {
      parentheses += 1;
      continue;
    }
    if (character === ")") {
      if (braces > 0) continue;
      parentheses -= 1;
      if (parentheses < 0) return null;
      if (parentheses === 0) {
        if (value.slice(index + 1).trim()) return null;
        if (segments.length || value.slice(segmentStart, index).trim()) {
          segments.push({ start: segmentStart, end: index });
        }
        return buildRootCall(name, open, index, value, segments);
      }
      continue;
    }
    if (character === "," && parentheses === 1 && braces === 0) {
      segments.push({ start: segmentStart, end: index });
      segmentStart = index + 1;
    }
  }
  return null;
}

export function replaceFormulaEditorArgument(
  value: string,
  argument: FormulaEditorArgument,
  replacement: string,
): string {
  return value.slice(0, argument.start) + replacement + value.slice(argument.end);
}

export function appendFormulaEditorArgument(
  value: string,
  call: FormulaEditorRootCall,
  replacement: string,
): string | null {
  if (!replacement.trim()) return null;
  const separator = call.arguments.length ? "," : "";
  return value.slice(0, call.close) + separator + replacement + value.slice(call.close);
}

function buildRootCall(
  name: string,
  open: number,
  close: number,
  value: string,
  segments: readonly { start: number; end: number }[],
): FormulaEditorRootCall | null {
  const argumentsList: FormulaEditorArgument[] = [];
  for (const segment of segments) {
    const start = skipWhitespace(value, segment.start);
    const end = trimEndWhitespace(value, segment.end);
    if (start === end) return null;
    argumentsList.push({ start, end, value: value.slice(start, end) });
  }
  return { name, open, close, arguments: argumentsList };
}

function skipWhitespace(value: string, index: number): number {
  while (/\s/.test(value[index] ?? "")) index += 1;
  return index;
}

function trimEndWhitespace(value: string, index: number): number {
  while (index > 0 && /\s/.test(value[index - 1] ?? "")) index -= 1;
  return index;
}
