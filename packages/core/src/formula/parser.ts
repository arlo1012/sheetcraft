import {
  createFormulaError,
  formulaErrorCodeFromToken,
  type FormulaAst,
  type FormulaExpression,
  type FormulaParseResult,
  type FormulaRange,
  type FormulaReference,
} from "./types.js";
import { parseA1FormulaReference } from "./reference-model.js";

const NUMBER_PATTERN = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i;
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*/;
const REFERENCE_PATTERN = /^\$?[A-Za-z]+\$?[1-9]\d*/;
const CELL_LIKE_PATTERN = /^\$?[A-Za-z]+\$?\d+/;

class FormulaParser {
  private offset = 1;

  constructor(private readonly source: string) {}

  parse(): FormulaParseResult {
    if (!this.source.startsWith("=")) return this.failure(0);
    this.skipWhitespace();
    if (this.atEnd()) return this.failure(this.offset);
    const expression = this.parseAdditive();
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
    return this.parsePrimary();
  }

  private parsePrimary(): FormulaExpression | null {
    this.skipWhitespace();
    const start = this.offset;
    if (this.consume("(")) {
      const expression = this.parseAdditive();
      if (!expression || !this.consume(")")) return null;
      return { ...expression, start, end: this.offset };
    }
    const remainder = this.source.slice(this.offset);
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
      return { kind: "number", value: Number(numeric), start, end: this.offset };
    }

    const referenceText = REFERENCE_PATTERN.exec(remainder)?.[0];
    if (referenceText) {
      const reference = parseA1FormulaReference(referenceText, this.offset);
      if (!reference) return null;
      this.offset += referenceText.length;
      this.skipWhitespace();
      if (!this.consume(":")) {
        return { kind: "reference", reference, start: reference.start, end: reference.end };
      }
      const rangeEnd = this.parseReference();
      if (!rangeEnd) return null;
      const range: FormulaRange = {
        start: reference,
        end: rangeEnd,
        startOffset: reference.start,
        endOffset: rangeEnd.end,
      };
      return { kind: "range", range, start: range.startOffset, end: range.endOffset };
    }
    if (CELL_LIKE_PATTERN.test(remainder)) return null;

    const identifier = IDENTIFIER_PATTERN.exec(remainder)?.[0];
    if (!identifier) return null;
    this.offset += identifier.length;
    const identifierEnd = this.offset;
    this.skipWhitespace();
    if (!this.consume("(")) {
      return { kind: "identifier", name: identifier, start, end: identifierEnd };
    }
    const args: FormulaExpression[] = [];
    this.skipWhitespace();
    if (!this.consume(")")) {
      while (true) {
        const argument = this.parseAdditive();
        if (!argument) return null;
        args.push(argument);
        if (this.consume(")")) break;
        if (!this.consume(",")) return null;
      }
    }
    return { kind: "function", name: identifier, args, start, end: this.offset };
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

export function parseFormula(source: string): FormulaParseResult {
  return new FormulaParser(source).parse();
}

export function getFormulaAst(source: string): FormulaAst | null {
  const result = parseFormula(source);
  return result.ok ? result.ast : null;
}

export { formulaErrorCodeFromToken } from "./types.js";
