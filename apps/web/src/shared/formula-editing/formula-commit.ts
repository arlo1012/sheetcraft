import { parseFormula } from "@idea10/core/formula";

/**
 * Adds only tail closing parentheses, and only if the current Core grammar can
 * parse the resulting source. It never repairs operators, commas, quotes, or
 * unmatched closing parentheses.
 */
export function completeFormulaForCommit(source: string): string {
  if (!source.startsWith("=")) return source;
  let quoted = false;
  let openings = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') index += 1;
      else quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (character === "(") openings += 1;
    if (character === ")") {
      openings -= 1;
      if (openings < 0) return source;
    }
  }
  if (quoted || openings === 0) return source;
  const completed = `${source}${")".repeat(openings)}`;
  return parseFormula(completed).ok ? completed : source;
}
