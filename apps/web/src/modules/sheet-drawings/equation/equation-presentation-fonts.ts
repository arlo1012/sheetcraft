import katex from "katex";
import {
  KATEX_PRESENTATION_FACES,
  KATEX_PRESENTATION_FONT_VERSION,
} from "./equation-presentation-font-coverage";
import { assertEquationCurrent, EquationPresentationFailure } from "./equation-presentation-plan";

export interface EquationFontUse {
  readonly family: string;
  readonly weight: string;
  readonly style: string;
  readonly size: number;
  readonly text: string;
}

function unquote(value: string): string {
  return value.trim().replace(/^["']|["']$/gu, "");
}
function weight(value: string): string {
  return value === "normal" ? "400" : value === "bold" ? "700" : value;
}

export function equationFontUse(style: CSSStyleDeclaration, text: string): EquationFontUse {
  const family = unquote(style.fontFamily.split(",")[0] ?? "");
  const size = Number.parseFloat(style.fontSize);
  const result = Object.freeze({
    family,
    weight: weight(style.fontWeight),
    style: style.fontStyle,
    size,
    text,
  });
  const face = KATEX_PRESENTATION_FACES.find(
    (face) =>
      face.family === family && face.weight === result.weight && face.style === result.style,
  );
  if (
    !face ||
    !Number.isFinite(size) ||
    size <= 0 ||
    katex.version !== KATEX_PRESENTATION_FONT_VERSION
  )
    throw new EquationPresentationFailure("font", "A bundled KaTeX font face is unavailable.");
  for (const glyph of text) {
    const codepoint = glyph.codePointAt(0)!;
    // Public KaTeX uses U+200B solely as an invisible table/line-box strut.
    if (codepoint === 0x200b) continue;
    if (!face.ranges.some(([start, end]) => codepoint >= start && codepoint <= end))
      throw new EquationPresentationFailure(
        "font",
        "This glyph would require an unverified fallback font.",
      );
  }
  return result;
}

export function equationCanvasFont(use: EquationFontUse): string {
  return `${use.style} ${use.weight} ${use.size}px "${use.family}"`;
}

function matchingFace(face: FontFace, use: EquationFontUse): boolean {
  return (
    unquote(face.family) === use.family &&
    weight(face.weight) === use.weight &&
    face.style === use.style
  );
}

/** Await the actual CSS FontFace objects, not fonts.ready or an unrelated cell-font loader. */
export async function awaitEquationFontFaces(
  fonts: FontFaceSet | undefined,
  uses: readonly EquationFontUse[],
  state: {
    readonly isCurrent: () => boolean;
    readonly now: () => number;
    readonly deadline: number;
  },
): Promise<readonly FontFace[]> {
  assertEquationCurrent(state.isCurrent);
  if (!fonts || typeof fonts.load !== "function" || typeof fonts.check !== "function")
    throw new EquationPresentationFailure("font", "Bundled KaTeX font loading cannot be verified.");
  const subset = new Map<string, EquationFontUse>();
  for (const use of uses) {
    const key = `${use.family}/${use.style}/${use.weight}`;
    const previous = subset.get(key);
    subset.set(key, previous ? { ...use, text: previous.text + use.text } : use);
  }
  let settled = false;
  let failure: unknown;
  let loaded: readonly (readonly FontFace[])[] = [];
  const requests = [...subset.values()];
  if (!requests.length) return Object.freeze([]);
  // Handlers are installed immediately so a timeout/stale exit cannot leave a rejection unhandled.
  void Promise.all(
    requests.map((use) => {
      try {
        return fonts.load(equationCanvasFont(use), use.text);
      } catch (error) {
        return Promise.reject(error);
      }
    }),
  ).then(
    (value) => {
      loaded = value;
      settled = true;
    },
    (error: unknown) => {
      failure = error;
      settled = true;
    },
  );
  while (!settled) {
    assertEquationCurrent(state.isCurrent);
    if (state.now() >= state.deadline)
      throw new EquationPresentationFailure("font", "Bundled KaTeX font loading timed out.");
    await new Promise<void>((resolve) => setTimeout(resolve, 16));
  }
  assertEquationCurrent(state.isCurrent);
  if (state.now() >= state.deadline)
    throw new EquationPresentationFailure("font", "Bundled KaTeX font loading timed out.");
  if (failure)
    throw new EquationPresentationFailure("font", "A bundled KaTeX font face failed to load.");
  const verified: FontFace[] = [];
  for (const [index, use] of requests.entries()) {
    const matches =
      loaded[index]?.filter((face) => matchingFace(face, use) && face.status === "loaded") ?? [];
    if (matches.length !== 1 || !fonts.check(equationCanvasFont(use), use.text))
      throw new EquationPresentationFailure(
        "font",
        "The requested bundled KaTeX font face did not load.",
      );
    verified.push(matches[0]!);
  }
  return Object.freeze(verified);
}
