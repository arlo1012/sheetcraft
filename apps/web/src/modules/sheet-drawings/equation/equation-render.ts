import katex from "katex";

export const EQUATION_RENDER_LIMITS = Object.freeze({
  sourceUnits: 16384,
  nesting: 32,
  tokens: 4096,
  expansion: 1000,
  htmlUnits: 2 * 1024 * 1024,
  elements: 16384,
});
export type EquationRenderResult =
  | { status: "ready"; html: string }
  | { status: "invalid" | "budget"; message: string; position?: number };

/** A conservative lexer budget, not an attempted UnicodeMath or TeX converter. */
function sourceBudget(source: string): boolean {
  if (source.length > EQUATION_RENDER_LIMITS.sourceUnits) return false;
  let depth = 0,
    tokens = 0;
  for (let index = 0; index < source.length; index++) {
    const value = source[index]!;
    if (/\s/u.test(value)) continue;
    if (++tokens > EQUATION_RENDER_LIMITS.tokens) return false;
    if (value === "\\") {
      const command = /^[A-Za-z]+/.exec(source.slice(index + 1))?.[0];
      if (!command) {
        index++;
        continue;
      }
      index += command.length;
      if (command === "left" || command === "begin") depth++;
      if (command === "right" || command === "end") depth = Math.max(0, depth - 1);
    } else if (value === "{" || value === "[") depth++;
    else if (value === "}" || value === "]") depth = Math.max(0, depth - 1);
    if (depth > EQUATION_RENDER_LIMITS.nesting) return false;
  }
  return true;
}

/** Old source remains untouched on every failure. Only KaTeX's public API emits HTML. */
export function renderEquationSource(source: string): EquationRenderResult {
  if (!sourceBudget(source))
    return { status: "budget", message: "This equation exceeds the rendering budget." };
  try {
    const html = katex.renderToString(source, {
      throwOnError: true,
      trust: false,
      strict: "ignore",
      output: "htmlAndMathml",
      maxExpand: EQUATION_RENDER_LIMITS.expansion,
      maxSize: 20,
    });
    if (
      html.length > EQUATION_RENDER_LIMITS.htmlUnits ||
      (html.match(/<[A-Za-z]/g)?.length ?? 0) > EQUATION_RENDER_LIMITS.elements
    )
      return { status: "budget", message: "This equation exceeds the output budget." };
    return { status: "ready", html };
  } catch (error) {
    const position =
      error instanceof katex.ParseError && Number.isSafeInteger(error.position)
        ? error.position
        : undefined;
    return {
      status: error instanceof RangeError ? "budget" : "invalid",
      message: error instanceof Error ? error.message : "The equation could not be rendered.",
      ...(position !== undefined ? { position } : {}),
    };
  }
}
