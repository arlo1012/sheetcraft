import {
  createFormulaError,
  formulaErrorCodeFromToken,
  type FormulaAst,
  type FormulaAxisRange,
  type FormulaExpression,
  type FormulaParseResult,
  type FormulaRange,
  type FormulaReference,
} from "./types.js";
import { parseA1FormulaReference } from "./reference-model.js";

const NUMBER_PATTERN = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i;
/** Dots are accepted only as function-name segments (for example CEILING.MATH). */
const IDENTIFIER_PATTERN = /^[\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}_][\p{L}\p{N}_]*)*/u;
const REFERENCE_PATTERN = /^\$?[A-Za-z]+\$?[1-9]\d*/;
const CELL_LIKE_PATTERN = /^\$?[A-Za-z]+\$?\d+/;
const QUALIFIED_REFERENCE_PATTERN =
  /^(?:(?:'(?:[^']|'')*'|[\p{L}\p{N}_.]+)!)?\$?[A-Za-z]+\$?[1-9]\d*/u;
const AXIS_RANGE_PATTERN = /^(?:(?:'(?:[^']|'')*'|[\p{L}\p{N}_.]+)!)?(\$?[A-Za-z]+|\$?[1-9]\d*)\s*:\s*(\$?[A-Za-z]+|\$?[1-9]\d*)/u;

class FormulaParser {
  private offset = 1;

  constructor(private readonly source: string) {}

  parse(): FormulaParseResult {
    if (!this.source.startsWith("=")) return this.failure(0);
    this.skipWhitespace();
    if (this.atEnd()) return this.failure(this.offset);
    const expression = this.parseComparison();
    if (!expression) return this.failure(this.offset);
    this.skipWhitespace();
    if (!this.atEnd()) return this.failure(this.offset);
    return { ok: true, ast: { source: this.source, expression } };
  }

  private failure(offset: number): FormulaParseResult {
    return { ok: false, error: createFormulaError("PARSE"), offset };
  }

  private atEnd(): boolean {
    return this.offset >= this.source.length;
  }

  private peek(): string | undefined {
    return this.source[this.offset];
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.peek() ?? "")) this.offset += 1;
  }

  private consume(character: string): boolean {
    this.skipWhitespace();
    if (this.peek() !== character) return false;
    this.offset += 1;
    return true;
  }

  private parseAdditive(): FormulaExpression | null {
    let expression = this.parseMultiplicative();
    if (!expression) return null;
    while (true) {
      this.skipWhitespace();
      const operator = this.peek();
      if (operator !== "+" && operator !== "-") return expression;
      this.offset += 1;
      const right = this.parseMultiplicative();
      if (!right) return null;
      expression = {
        kind: "binary",
        operator,
        left: expression,
        right,
        start: expression.start,
        end: right.end,
      };
    }
  }

  private parseConcatenation(): FormulaExpression | null {
    let expression = this.parseAdditive();
    if (!expression) return null;
    while (true) {
      this.skipWhitespace();
      if (this.peek() !== "&") return expression;
      this.offset += 1;
      const right = this.parseAdditive();
      if (!right) return null;
      expression = {
        kind: "binary",
        operator: "&",
        left: expression,
        right,
        start: expression.start,
        end: right.end,
      };
    }
  }

  private parseComparison(): FormulaExpression | null {
    let expression = this.parseConcatenation();
    if (!expression) return null;
    while (true) {
      this.skipWhitespace();
      const operator = this.readComparisonOperator();
      if (!operator) return expression;
      const right = this.parseConcatenation();
      if (!right) return null;
      expression = {
        kind: "binary",
        operator,
        left: expression,
        right,
        start: expression.start,
        end: right.end,
      };
    }
  }

  private readComparisonOperator(): "=" | "<>" | "<" | "<=" | ">" | ">=" | null {
    const next = this.source.slice(this.offset, this.offset + 2);
    if (next === "<=" || next === ">=" || next === "<>") {
      this.offset += 2;
      return next;
    }
    const character = this.peek();
    if (character === "=" || character === "<" || character === ">") {
      this.offset += 1;
      return character;
    }
    return null;
  }

  private parseMultiplicative(): FormulaExpression | null {
    let expression = this.parseUnary();
    if (!expression) return null;
    while (true) {
      this.skipWhitespace();
      const operator = this.peek();
      if (operator !== "*" && operator !== "/") return expression;
      this.offset += 1;
      const right = this.parseUnary();
      if (!right) return null;
      expression = {
        kind: "binary",
        operator,
        left: expression,
        right,
        start: expression.start,
        end: right.end,
      };
    }
  }

  private parseUnary(): FormulaExpression | null {
    this.skipWhitespace();
    const start = this.offset;
    const operator = this.peek();
    if (operator === "+" || operator === "-") {
      this.offset += 1;
      const operand = this.parseUnary();
      return operand ? { kind: "unary", operator, operand, start, end: operand.end } : null;
    }
    return this.parsePower();
  }

  private parsePower(): FormulaExpression | null {
    let left = this.parsePrimary();
    if (!left) return null;
    this.skipWhitespace();
    while (this.peek() === "%") {
      const start: number = left.start;
      this.offset += 1;
      left = {
        kind: "binary",
        operator: "*",
        left,
        right: { kind: "number", value: 0.01, start: this.offset - 1, end: this.offset },
        start,
        end: this.offset,
      };
      this.skipWhitespace();
    }
    if (this.peek() !== "^") return left;
    this.offset += 1;
    const right = this.parseUnary();
    return right
      ? { kind: "binary", operator: "^", left, right, start: left.start, end: right.end }
      : null;
  }

  private parsePrimary(): FormulaExpression | null {
    this.skipWhitespace();
    const start = this.offset;
    if (this.consume("(")) {
      const expression = this.parseComparison();
      if (!expression || !this.consume(")")) return null;
      return { ...expression, start, end: this.offset };
    }
    const remainder = this.source.slice(this.offset);
    const axisRangeText = AXIS_RANGE_PATTERN.exec(remainder)?.[0];
    if (axisRangeText) {
      const qualifier = splitSheetQualifier(axisRangeText, this.offset);
      const body = qualifier.referenceText;
      const match = /^(\$?)([A-Za-z]+|[1-9]\d*)\s*:\s*(\$?)([A-Za-z]+|[1-9]\d*)$/.exec(body);
      if (!match || (/[A-Za-z]/.test(match[2]!) !== /[A-Za-z]/.test(match[4]!))) return null;
      const column = /[A-Za-z]/.test(match[2]!);
      const toIndex = (value: string) => {
        if (!column) return Number(value) - 1;
        let result = 0;
        for (const character of value.toUpperCase()) result = result * 26 + character.charCodeAt(0) - 64;
        return result - 1;
      };
      const first = toIndex(match[2]!);
      const last = toIndex(match[4]!);
      const maximum = column ? 16_384 : 1_048_576;
      if (first < 0 || last < 0 || first >= maximum || last >= maximum) return null;
      const range: FormulaAxisRange = {
        axis: column ? "column" : "row", start: first, end: last,
        startAbsolute: match[1] === "$", endAbsolute: match[3] === "$",
        ...(qualifier.sheetName ? { sheetName: qualifier.sheetName } : {}),
        startOffset: qualifier.offset, endOffset: this.offset + axisRangeText.length,
      };
      this.offset += axisRangeText.length;
      return { kind: "axis-range", range, start, end: this.offset };
    }
    if (this.peek() === "{") return this.parseArray();
    const errorToken = /^#[A-Za-z0-9_/?]+[!?]?/.exec(remainder)?.[0];
    if (errorToken) {
      const code = formulaErrorCodeFromToken(errorToken);
      if (!code) return null;
      this.offset += errorToken.length;
      return { kind: "error", code, start, end: this.offset };
    }
    const numeric = NUMBER_PATTERN.exec(remainder)?.[0];
    if (numeric) {
      this.offset += numeric.length;
      const value = Number(numeric);
      if (this.peek() === "%") {
        this.offset += 1;
        return { kind: "number", value: value / 100, start, end: this.offset };
      }
      return { kind: "number", value, start, end: this.offset };
    }
    if (this.peek() === '"') {
      return this.parseString();
    }

    const identifierCandidate = IDENTIFIER_PATTERN.exec(remainder)?.[0];
    const isFunction = Boolean(
      identifierCandidate && /^\s*\(/.test(remainder.slice(identifierCandidate.length)),
    );
    const qualifiedReferenceText = isFunction
      ? undefined
      : QUALIFIED_REFERENCE_PATTERN.exec(remainder)?.[0];
    const referenceText = qualifiedReferenceText?.includes("!")
      ? qualifiedReferenceText
      : isFunction
        ? undefined
        : REFERENCE_PATTERN.exec(remainder)?.[0];
    if (referenceText) {
      const qualifier = splitSheetQualifier(referenceText, this.offset);
      const reference = parseA1FormulaReference(qualifier.referenceText, qualifier.offset);
      if (!reference) return null;
      this.offset += referenceText.length;
      if (qualifier.sheetName) reference.sheetName = qualifier.sheetName;
      this.skipWhitespace();
      if (!this.consume(":")) {
        return { kind: "reference", reference, start: reference.start, end: reference.end };
      }
      const rangeEnd = this.parseReference();
      if (!rangeEnd) return null;
      if (qualifier.sheetName) rangeEnd.sheetName = qualifier.sheetName;
      const range: FormulaRange = {
        start: reference,
        end: rangeEnd,
        startOffset: reference.start,
        endOffset: rangeEnd.end,
      };
      return { kind: "range", range, start: range.startOffset, end: range.endOffset };
    }
    if (!isFunction && CELL_LIKE_PATTERN.test(remainder)) return null;

    const identifier = IDENTIFIER_PATTERN.exec(remainder)?.[0];
    if (!identifier) return null;
    this.offset += identifier.length;
    const identifierEnd = this.offset;
    const normalizedIdentifier = identifier.toUpperCase();
    this.skipWhitespace();
    if (
      (normalizedIdentifier === "TRUE" || normalizedIdentifier === "FALSE") &&
      this.peek() !== "("
    ) {
      return {
        kind: "boolean",
        value: normalizedIdentifier === "TRUE",
        start,
        end: identifierEnd,
      };
    }
    if (!this.consume("(")) {
      return { kind: "identifier", name: identifier, start, end: identifierEnd };
    }
    const args: FormulaExpression[] = [];
    this.skipWhitespace();
    if (!this.consume(")")) {
      while (true) {
        const argument = this.parseComparison();
        if (!argument) return null;
        args.push(argument);
        if (this.consume(")")) break;
        if (!this.consume(",")) return null;
      }
    }
    return { kind: "function", name: identifier, args, start, end: this.offset };
  }

  private parseString(): FormulaExpression | null {
    const start = this.offset;
    this.offset += 1;
    let value = "";
    while (!this.atEnd()) {
      const character = this.peek();
      if (character === '"') {
        if (this.source[this.offset + 1] === '"') {
          value += '"';
          this.offset += 2;
          continue;
        }
        this.offset += 1;
        return { kind: "string", value, start, end: this.offset };
      }
      value += character;
      this.offset += 1;
    }
    return null;
  }

  private parseArray(): FormulaExpression | null {
    const start = this.offset;
    this.offset += 1;
    const rows: FormulaExpression[][] = [];
    let row: FormulaExpression[] = [];
    while (true) {
      const item = this.parseComparison();
      if (!item) return null;
      row.push(item);
      this.skipWhitespace();
      const next = this.peek();
      if (next === ",") { this.offset += 1; continue; }
      if (next === ";") { if (!row.length) return null; rows.push(row); row = []; this.offset += 1; continue; }
      if (next !== "}") return null;
      this.offset += 1;
      rows.push(row);
      const width = rows[0]?.length;
      return width && rows.every((candidate) => candidate.length === width)
        ? { kind: "array", rows, start, end: this.offset }
        : null;
    }
  }

  private parseReference(): FormulaReference | null {
    this.skipWhitespace();
    const text = REFERENCE_PATTERN.exec(this.source.slice(this.offset))?.[0];
    if (!text) return null;
    const reference = parseA1FormulaReference(text, this.offset);
    if (!reference) return null;
    this.offset += text.length;
    return reference;
  }
}

function splitSheetQualifier(
  text: string,
  start: number,
): { sheetName: string | null; referenceText: string; offset: number } {
  const separator = text.lastIndexOf("!");
  if (separator < 0) return { sheetName: null, referenceText: text, offset: start };
  const rawName = text.slice(0, separator);
  const sheetName = rawName.startsWith("'") ? rawName.slice(1, -1).replaceAll("''", "'") : rawName;
  return { sheetName, referenceText: text.slice(separator + 1), offset: start + separator + 1 };
}

export function parseFormula(source: string): FormulaParseResult {
  return new FormulaParser(source).parse();
}

export function getFormulaAst(source: string): FormulaAst | null {
  const result = parseFormula(source);
  return result.ok ? result.ast : null;
}

export { formulaErrorCodeFromToken } from "./types.js";
