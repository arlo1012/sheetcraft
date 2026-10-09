import { parseFormula } from "@sheetcraft/core/formula";

/**
 * Adds only tail closing parentheses, and only if the current Core grammar can
 * parse the resulting source. It never repairs operators, commas, quotes, or
 * unmatched closing parentheses.
 */
export function completeFormulaForCommit(source: string): string {
  if (!source.startsWith("=")) return source;
  if (/[,;]\s*$/.test(source)) return source;
  let quote: '"' | "'" | null = null;
  let openings = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote && source[index + 1] === quote) index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "(") openings += 1;
    if (character === ")") {
      openings -= 1;
      if (openings < 0) return source;
    }
  }
  if (quote || openings === 0) return source;
  const completed = `${source}${")".repeat(openings)}`;
  return parseFormula(completed).ok ? completed : source;
}
