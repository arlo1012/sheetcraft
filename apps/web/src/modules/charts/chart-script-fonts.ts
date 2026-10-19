import {
  resolveChartScriptFont,
  type ChartFontScript,
  type ChartTextFormat,
} from "@sheetcraft/core/chart-format";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import type { SheetChart } from "@sheetcraft/core/sheet-charts";

export type ChartFontContext = {
  theme?: WorkbookTheme;
  resolveFontFamily?: (family: string) => string;
};
export type ChartTextRun = {
  text: string;
  script: ChartFontScript | "literal";
  fontFamily: string;
};
export type ChartTextPlan = {
  text: string;
  runs: ChartTextRun[];
  /** Host fallback is a preview decision, never a stored font replacement. */
  limitations: (
    | "unresolved-font"
    | "complex-shaping"
    | "grapheme-unavailable"
    | "rich-literal-font"
  )[];
};
const scripts: ChartFontScript[] = ["latin", "eastAsia", "complexScript"];
const eastAsia =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]/u;
const simple =
  /^[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Common}\p{Script=Inherited}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]*$/u;
// Never fragment RTL, directional controls or joining/Indic sequences into rich tokens.
const bidi = /[\u0590-\u08ff\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const strongLatin = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Number}]/u;

export function chartGraphemes(text: string): string[] | undefined {
  if (typeof Intl.Segmenter !== "function") return undefined;
  return Array.from(
    new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text),
    (part) => part.segment,
  );
}

function resolved(
  format: ChartTextFormat | undefined,
  script: ChartFontScript,
  theme?: WorkbookTheme,
) {
  // A missing caller theme must not acquire certainty from the application's default theme.
  if (!theme && format?.scriptFonts?.[script]?.kind === "theme")
    return { kind: "unresolved" } as const;
  return resolveChartScriptFont(format, script, theme!);
}
export function getChartTextFontFamilies(
  format?: ChartTextFormat,
  theme?: WorkbookTheme,
): string[] {
  return [
    ...new Set(
      scripts.flatMap((script) => {
        const value = resolved(format, script, theme);
        return value.kind === "family" ? [value.family] : [];
      }),
    ),
  ];
}
export function getChartFontFamilies(chart: SheetChart, theme?: WorkbookTheme): string[] {
  const f = chart.format;
  return [
    ...new Set(
      [
        f?.title,
        f?.legend?.text,
        f?.categoryAxis?.text,
        f?.valueAxis?.text,
        f?.secondaryValueAxis?.text,
        f?.categoryAxis?.titleText,
        f?.valueAxis?.titleText,
        f?.secondaryValueAxis?.titleText,
      ].flatMap((text) => getChartTextFontFamilies(text, theme)),
    ),
  ];
}

export function createChartTextPlan(
  text: string,
  format?: ChartTextFormat,
  theme?: WorkbookTheme,
  fallback = "sans-serif",
  resolveFamily?: (family: string) => string,
): ChartTextPlan {
  const limitations: ChartTextPlan["limitations"] = [];
  const families = Object.fromEntries(
    scripts.map((script) => {
      const choice = resolved(format, script, theme);
      if (choice.kind === "unresolved" && !limitations.includes("unresolved-font"))
        limitations.push("unresolved-font");
      const family = choice.kind === "family" ? choice.family : fallback;
      return [script, resolveFamily?.(family) ?? family];
    }),
  ) as Record<ChartFontScript, string>;
  if (!format?.scriptFonts)
    return { text, runs: [{ text, script: "latin", fontFamily: families.latin }], limitations };
  const finish = (runs: ChartTextRun[]): ChartTextPlan => {
    if (/[{}]/.test(text)) limitations.push("rich-literal-font");
    // ZRender cannot encode a closing brace inside a rich token. Its literal
    // fragments use the parent face. Model that exact preview fallback in the
    // measurement/SVG/Canvas plan too, and disclose the fidelity boundary.
    const literalFamily = resolveFamily?.(fallback) ?? fallback;
    return {
      text,
      limitations,
      runs: runs.flatMap((run) => {
        const clusters = chartGraphemes(run.text);
        if (!clusters) return [run];
        const pieces: ChartTextRun[] = [];
        for (const cluster of clusters) {
          const literal = cluster.includes("}");
          const last = pieces.at(-1);
          const script = literal ? "literal" : run.script;
          if (last?.script === script && !cluster.includes("{") && !last.text.includes("{"))
            last.text += cluster;
          else
            pieces.push({
              text: cluster,
              script,
              fontFamily: literal ? literalFamily : run.fontFamily,
            });
        }
        return pieces;
      }),
    };
  };
  const graphemes = chartGraphemes(text);
  if (!simple.test(text) || bidi.test(text) || !graphemes) {
    limitations.push(!graphemes ? "grapheme-unavailable" : "complex-shaping");
    // One complete shaping/bidi input. A declared complex-script face may paint the
    // whole paragraph; a mixed paragraph's exact per-script faces remain unverified.
    return finish([
      {
        text,
        script: "complexScript",
        fontFamily: graphemes ? families.complexScript : (resolveFamily?.(fallback) ?? fallback),
      },
    ]);
  }
  const classifications = graphemes.map((part): ChartFontScript | undefined =>
    eastAsia.test(part) ? "eastAsia" : strongLatin.test(part) ? "latin" : undefined,
  );
  const nextStrong: (ChartFontScript | undefined)[] = [];
  let next: ChartFontScript | undefined;
  for (let i = classifications.length - 1; i >= 0; i--) {
    next = classifications[i] ?? next;
    nextStrong[i] = next;
  }
  const runs: ChartTextRun[] = [];
  let previous: ChartFontScript | undefined;
  for (let i = 0; i < graphemes.length; i++) {
    const script = classifications[i] ?? previous ?? nextStrong[i] ?? "latin";
    previous = script;
    const tail = runs.at(-1);
    if (tail?.script === script) tail.text += graphemes[i]!;
    else runs.push({ text: graphemes[i]!, script, fontFamily: families[script] });
  }
  return finish(runs);
}

/** ECharts has no rich-text escaping API. Encode braces as independent literal
 * fragments so a user label can never become a style token. Closing braces are
 * literal plain fragments and inherit the enclosing text style. */
function richRun(text: string, key: string): string {
  const chunks: string[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) chunks.push(`{${key}|${buffer}}`);
    buffer = "";
  };
  for (const cluster of chartGraphemes(text) ?? [text]) {
    if (cluster.includes("{") || cluster.includes("\n")) {
      flush();
      chunks.push(cluster.includes("\n") ? cluster : `{${key}|${cluster}}`);
    } else buffer += cluster;
  }
  flush();
  return chunks.join("");
}

export function chartRichText(plan: ChartTextPlan): string {
  return plan.runs
    .map((run) => (run.script === "literal" ? run.text : richRun(run.text, `sc_${run.script}`)))
    .join("");
}
export function chartRichStyles(
  format?: ChartTextFormat,
  theme?: WorkbookTheme,
  fallback = "sans-serif",
  resolveFamily?: (family: string) => string,
) {
  return Object.fromEntries(
    scripts.map((script) => {
      const choice = resolved(format, script, theme);
      const family = choice.kind === "family" ? choice.family : fallback;
      return [
        `sc_${script}`,
        {
          fontFamily: resolveFamily?.(family) ?? family,
          ...(format?.fontSize !== undefined ? { fontSize: format.fontSize } : {}),
          ...(format?.bold !== undefined
            ? { fontWeight: format.bold ? ("bold" as const) : ("normal" as const) }
            : {}),
          ...(format?.italic !== undefined
            ? { fontStyle: format.italic ? ("italic" as const) : ("normal" as const) }
            : {}),
        },
      ];
    }),
  );
}
/** Word-cloud geometry has one title strip. Keep that existing layout explicit;
 * this is only a paint projection and never changes the retained title text. */
export function createChartWordTitlePlan(
  text: string,
  format?: ChartTextFormat,
  theme?: WorkbookTheme,
  fallback = "sans-serif",
  resolveFamily?: (family: string) => string,
): ChartTextPlan {
  return createChartTextPlan(
    format?.scriptFonts ? text.replace(/\r?\n/g, " ") : text,
    format,
    theme,
    fallback,
    resolveFamily,
  );
}

export function measureChartText(
  plan: ChartTextPlan,
  measure: (text: string, family: string) => number,
): number {
  let line = 0,
    widest = 0;
  for (const run of plan.runs) {
    const lines = run.text.split(/\r?\n/);
    lines.forEach((part, index) => {
      if (index) {
        widest = Math.max(widest, line);
        line = 0;
      }
      line += measure(part, run.fontFamily);
    });
  }
  return Math.max(widest, line);
}
/** Truncate only at complete graphemes, then re-plan/re-measure the exact paint. */
export function truncateChartText(
  text: string,
  width: number,
  makePlan: (text: string) => ChartTextPlan,
  measure: (text: string, family: string) => number,
): ChartTextPlan {
  if (text.includes("\n")) {
    // Width truncation applies to each explicit line. Never discard later lines
    // merely because an earlier line is too wide; height remains the owner's job.
    return makePlan(
      text
        .split(/(\r?\n)/)
        .map((part, index) =>
          index % 2 ? part : truncateChartText(part, width, makePlan, measure).text,
        )
        .join(""),
    );
  }
  const complete = makePlan(text);
  if (measureChartText(complete, measure) <= width) return complete;
  const parts = chartGraphemes(text);
  if (!parts) return makePlan("…");
  let low = 0,
    high = parts.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (measureChartText(makePlan(parts.slice(0, middle).join("") + "…"), measure) <= width)
      low = middle;
    else high = middle - 1;
  }
  return makePlan(parts.slice(0, low).join("") + "…");
}
