import { ref } from "vue";
import { createApproximateTextMeasurer, type TextMeasurer } from "@idea10/sheet-engine/row-height";

const approximate = createApproximateTextMeasurer();
const widths = new Map<string, number>();
let context: CanvasRenderingContext2D | null | undefined;
export const cellTextFontRevision = ref(0);

export const browserCellTextMeasurer: TextMeasurer = {
  measure(text, font) {
    const key = JSON.stringify([font, text]);
    const cached = widths.get(key);
    if (cached !== undefined) return cached;
    if (context === undefined)
      context =
        typeof document !== "undefined" && typeof CanvasRenderingContext2D !== "undefined"
          ? document.createElement("canvas").getContext("2d")
          : null;
    let width: number;
    if (context) {
      const family = font.family.includes(",") ? font.family : JSON.stringify(font.family);
      context.font = `${font.italic ? "italic " : ""}${font.weight} ${font.size}px ${family}`;
      width = context.measureText(text).width;
    } else width = approximate.measure(text, font);
    if (widths.size >= 2048) widths.clear();
    widths.set(key, width);
    return width;
  },
};

function fontsChanged(): void {
  widths.clear();
  cellTextFontRevision.value += 1;
}
if (typeof document !== "undefined") {
  document.fonts?.addEventListener("loadingdone", fontsChanged);
  import.meta.hot?.dispose(() => document.fonts?.removeEventListener("loadingdone", fontsChanged));
}
