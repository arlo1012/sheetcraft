import { xml } from "../pivot-xml.js";

/** OOXML strings can carry XML-forbidden controls, with literal escapes protected. */
export function xlsxText(value: unknown): string {
  const escaped = String(value)
    // Escape only the leading underscore: adjacent escapes can share an
    // underscore, as in the literal _x005F_x0041_. Consuming the whole token
    // would miss that second escape and corrupt it during single-pass decode.
    .replace(/_(?=x[0-9a-f]{4}_)/gi, "_x005F_")
    .replace(
      // eslint-disable-next-line no-control-regex -- XML 1.0 forbids these controls; OOXML encodes them.
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,
      (character) => `_x${character.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}_`,
    );
  return xml(escaped);
}
